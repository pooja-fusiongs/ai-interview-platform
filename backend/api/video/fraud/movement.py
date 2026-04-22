from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
import json
import time
import threading

from database import get_db
from models import VideoInterview, MovementTimeline, FraudAnalysis
from schemas import UnifiedDetectionPayload, MovementTimelineResponse

router = APIRouter(tags=["Movement Detection"])

# Throttle: prevent DB spam from frequent movement detection calls
_last_submit: dict = {}
_throttle_lock = threading.Lock()
MIN_INTERVAL = 3  # Minimum 3 seconds between submissions per interview


@router.post("/movement-detection")
def submit_movement_detection(
    payload: UnifiedDetectionPayload,
    db: Session = Depends(get_db),
):
    """
    Receives combined face, lip, voice, and body movement stats from the frontend.
    Throttled to prevent DB connection pool exhaustion.
    """
    interview_id = payload.interview_id

    # Throttle check — reject if called too frequently for same interview
    now = time.time()
    with _throttle_lock:
        if now - _last_submit.get(interview_id, 0) < MIN_INTERVAL:
            return {"status": "throttled"}
        _last_submit[interview_id] = now
        # Cleanup stale entries (interviews ended >10 min ago)
        for k in [k for k, v in _last_submit.items() if now - v > 600]:
            del _last_submit[k]

    vi = db.query(VideoInterview).filter(VideoInterview.id == interview_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    vi_status = vi.status.value if hasattr(vi.status, "value") else vi.status
    if vi_status in ("cancelled", "no_show", "completed"):
        return {"status": "interview_ended"}
    if vi_status == "scheduled":
        return {"status": "interview_not_started"}

    # 1) Store MovementTimeline record
    flags_dict = payload.flags.dict() if hasattr(payload.flags, "dict") else vars(payload.flags)
    
    timeline_entry = MovementTimeline(
        video_interview_id=interview_id,
        movement_score=payload.movement_score,
        movement_intensity=payload.movement_intensity,
        flags_json=json.dumps(flags_dict)
    )
    db.add(timeline_entry)
    
    # 2) Get or create FraudAnalysis
    existing = db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == interview_id).first()
    if not existing:
        existing = FraudAnalysis(video_interview_id=interview_id, analysis_status="pending")
        db.add(existing)
        db.flush()
        
    # 3) Update overarching FraudAnalysis using the unified payload
    # Face detection score: measures how well the candidate stays on screen
    # - Single face = good (1.0)
    # - No face = bad (person left)
    # - Multiple faces = fraud (someone helping)
    # - Looking away = suspicious (reading from another screen)
    total_face = payload.single_face_count + payload.no_face_count + payload.multiple_face_count
    looking_away_count = getattr(payload, 'looking_away_count', 0)
    looking_away_seconds = getattr(payload, 'looking_away_seconds', 0) or 0

    # Task 2: gaze-wiring fallback. Frontend populates `looking_away_seconds`
    # (see useDetection.ts:525) but the penalty here historically read only
    # `looking_away_count`. If the count is 0 but seconds > 0, derive a count
    # from seconds so the penalty actually triggers. Assume a ~1 frame/second
    # sampling cadence as a conservative lower bound; producers that DO send
    # looking_away_count keep working unchanged.
    if looking_away_count == 0 and looking_away_seconds > 0:
        looking_away_count = int(looking_away_seconds)

    # Task 4: minimum-data guard. Need a meaningful sample before writing a
    # face score — otherwise a single early batch with 1-2 frames can anchor
    # the rolling average at 1.0. Keep threshold low to not starve real data.
    MIN_FACE_FRAMES = 3

    if total_face >= MIN_FACE_FRAMES:
        sr = payload.single_face_count / total_face      # valid frames ratio
        nr = payload.no_face_count / total_face           # no face ratio
        mr = payload.multiple_face_count / total_face     # multiple faces ratio

        # Start from 1.0 (perfect), subtract penalties for violations
        face_score = 1.0

        # Penalty: no face detected (person left the frame)
        if nr > 0:
            face_score -= nr * 0.5  # proportional penalty

        # Penalty: multiple faces (fraud - someone else in frame)
        if mr > 0:
            face_score -= mr * 0.7  # heavy penalty for cheating

        # Penalty: sustained no-face (>2 seconds in 5-sec window = mostly gone)
        if payload.no_face_seconds > 2:
            face_score -= 0.15

        # Task 3: gaze penalty strengthened. Looking-away is a meaningful
        # signal (reading from 2nd screen / not engaged) so it should
        # measurably impact the score when detected. Previous 0.3 coefficient
        # capped the penalty at -30% even for 100% looking-away, leaving score
        # at 70% ("Excellent" band). Raise to 0.6 so 100% looking-away can
        # pull score down to 40%. Still bounded by max(0,..) below.
        if looking_away_count > 0 and total_face > 0:
            looking_away_ratio = min(1.0, looking_away_count / total_face)
            face_score -= looking_away_ratio * 0.6

        # Penalty: face identity changed (different person)
        face_changed_count = getattr(payload, 'face_changed_count', 0)
        if face_changed_count > 0:
            face_score -= 0.4  # heavy penalty — different person

        face_score = max(0.0, min(1.0, face_score))

        if existing.face_detection_score is not None:
            existing.face_detection_score = round((existing.face_detection_score * 0.5) + (face_score * 0.5), 3)
        else:
            existing.face_detection_score = round(face_score, 3)
    # else: Task 5 — insufficient data, do NOT update face_detection_score.
    # Existing value (if any) is preserved; no fabricated default written.

    # Task 1 + 4 + 5: lip-score guard. When aaf == 0 (no audio-active frames
    # observed in this batch), we have zero evidence of sync OR mismatch.
    # Previously defaulted to 1.0 (perfect) which let static-photo / no-face
    # scenarios score 100%. Now: skip the update entirely and preserve the
    # prior score. Rolling average below only runs when lip_score is set.
    aaf = payload.lip_moving_with_audio + payload.lip_still_with_audio
    lip_score = None

    # Minimum statistical floor: need at least 4 audio-active frames before
    # writing any lip score. Previous guard only skipped when sync_ratio was
    # explicitly low AND aaf >= 4 — so tiny batches (aaf 1-3) with 0 lip-
    # moving still slipped through and wrote 0, locking the score down.
    MIN_LIP_FRAMES = 4
    if aaf >= MIN_LIP_FRAMES:
        sync_ratio = payload.lip_moving_with_audio / aaf

        # Detection-failure guard: very low sync ratio (<10%) almost always
        # indicates the frontend MediaPipe lip-movement threshold is too
        # strict for the candidate's lighting/camera/skin-tone, NOT real
        # fraud. Real dubbing still produces ~30-50% sync (proxy on camera
        # does SOME lip motion). A healthy interview is 60-90%. Skip so prior
        # score is preserved rather than slamming to 0.
        if sync_ratio < 0.1:
            lip_score = None
        else:
            # Honest formula: lip_score = sync_ratio. Previous
            # "sync_ratio - mismatch_ratio * 0.2" double-counted the signal
            # (sync+mismatch sum to 1 by construction) and could yield
            # negatives that clamped to 0 for genuine speakers.
            lip_score = round(max(0.0, min(1.0, sync_ratio)), 3)

    if lip_score is not None:
        if existing.lip_sync_score is not None:
            existing.lip_sync_score = round((existing.lip_sync_score * 0.7) + (lip_score * 0.3), 3)
        else:
            existing.lip_sync_score = round(lip_score, 3)

    # Task 1 + 5 (voice): same anti-pattern was present here. No-data should
    # not be reported as perfect voice consistency. Skip update when vs == 0.
    vs = payload.consistent_segments + payload.inconsistent_segments
    voice_score = None
    if vs > 0:
        cr = payload.consistent_segments / vs
        sp = min(0.3, payload.pitch_shift_count * 0.03)
        voice_score = max(0.0, min(1.0, cr - sp))

    if voice_score is not None:
        if existing.voice_consistency_score is not None:
            existing.voice_consistency_score = round((existing.voice_consistency_score * 0.7) + (voice_score * 0.3), 3)
        else:
            existing.voice_consistency_score = round(voice_score, 3)

    # --- AUDIO QUALITY (Option B) ---
    # Existing Voice Consistency metric only detects pitch changes (impersonation).
    # It does NOT catch mic drops, silence mid-interview, or noise issues — the
    # recruiter sees "Voice 100%" even when the candidate's audio was broken.
    # Here we compute a per-batch quality signal and pull voice_consistency_score
    # down when audio was demonstrably problematic (sudden mic drops, or majority
    # of the batch was silent/noisy AFTER the candidate had started speaking).
    audio_normal = getattr(payload, 'audio_normal_frames', 0) or 0
    audio_low = getattr(payload, 'audio_low_frames', 0) or 0
    audio_silent = getattr(payload, 'audio_silent_frames', 0) or 0
    audio_noise = getattr(payload, 'audio_noise_frames', 0) or 0
    audio_drops = getattr(payload, 'audio_drop_count', 0) or 0
    audio_total = audio_normal + audio_low + audio_silent + audio_noise

    # Only apply audio-quality penalty when we have meaningful frame counts AND
    # some normal audio has already been observed (prevents penalizing the
    # very first pre-speaking seconds of an interview).
    if audio_total >= 10 and (audio_normal + audio_low) > 0:
        normal_ratio = audio_normal / audio_total
        low_ratio = audio_low / audio_total
        silent_ratio = audio_silent / audio_total
        noise_ratio = audio_noise / audio_total

        # Quality score starts at 1.0 and is subtracted for problems.
        quality = 1.0
        # Sustained silence (after candidate started speaking) is a strong signal.
        # Natural pauses make ~10-20% silence normal — only penalize beyond that.
        if silent_ratio > 0.2:
            quality -= min(0.5, (silent_ratio - 0.2) * 1.0)
        # Low-volume audio (weak mic, distant speaker) — moderate penalty.
        if low_ratio > 0.3:
            quality -= min(0.3, (low_ratio - 0.3) * 0.6)
        # Noise / clipping — heavy penalty (audio unusable).
        if noise_ratio > 0.1:
            quality -= min(0.4, noise_ratio * 1.0)
        # Mic drops are discrete events — each one is suspicious/disruptive.
        quality -= min(0.4, audio_drops * 0.15)

        quality = max(0.0, min(1.0, quality))

        # Blend into voice_consistency_score so "Voice Consistency" card reflects
        # BOTH impersonation detection AND audio health. Score = min(voice, quality)
        # so whichever is worse drives the display — a mic drop should not be
        # hidden behind a clean-pitch 100% impersonation score.
        if existing.voice_consistency_score is not None:
            blended = min(existing.voice_consistency_score, quality)
            existing.voice_consistency_score = round(blended, 3)

        # Add explicit flags so recruiter sees the root cause, not just a lower score.
        auto_audio_flag_types = {"audio_dropped", "poor_audio_quality", "audio_noise"}
        existing_flags_local = []
        if existing.flags:
            try:
                import json as _jf
                existing_flags_local = _jf.loads(existing.flags)
                # Remove old audio auto-flags so they get refreshed each batch
                existing_flags_local = [f for f in existing_flags_local if f.get("flag_type") not in auto_audio_flag_types]
            except Exception:
                existing_flags_local = []

        if audio_drops >= 1:
            existing_flags_local.append({
                "flag_type": "audio_dropped",
                "severity": "high" if audio_drops >= 3 else "medium",
                "description": f"Mic dropped / audio cut out {audio_drops} time(s) during interview",
                "confidence": 0.85,
                "timestamp_seconds": 0,
            })
        if silent_ratio > 0.5:
            existing_flags_local.append({
                "flag_type": "poor_audio_quality",
                "severity": "high",
                "description": f"Audio silent {int(silent_ratio * 100)}% of monitored window — possible mic/mute issue",
                "confidence": 0.8,
                "timestamp_seconds": 0,
            })
        elif low_ratio > 0.5:
            existing_flags_local.append({
                "flag_type": "poor_audio_quality",
                "severity": "medium",
                "description": f"Audio volume weak {int(low_ratio * 100)}% of monitored window",
                "confidence": 0.7,
                "timestamp_seconds": 0,
            })
        if noise_ratio > 0.2:
            existing_flags_local.append({
                "flag_type": "audio_noise",
                "severity": "medium",
                "description": f"Heavy audio noise/clipping detected ({int(noise_ratio * 100)}% of window)",
                "confidence": 0.7,
                "timestamp_seconds": 0,
            })

        if existing_flags_local:
            import json as _jf2
            existing.flags = _jf2.dumps(existing_flags_local)
            existing.flag_count = len(existing_flags_local)

    # Calculate Body Movement Score mapping to existing DB
    # Softer baseline: normal nervous movement shouldn't crash trust to ~0%.
    # CALM = 1.0, MODERATE = 0.75, HIGH = 0.35 (HIGH != fraud, just elevated motion)
    b_score = 1.0
    if payload.movement_score == "MODERATE":
        b_score = 0.75
    elif payload.movement_score == "HIGH":
        b_score = 0.35

    if existing.body_movement_score is not None:
        existing.body_movement_score = round((existing.body_movement_score * 0.7) + (b_score * 0.3), 3)
    else:
        existing.body_movement_score = round(b_score, 3)

    # Floor body_movement_score at 0.2 — never drop to ~2% from motion alone
    if existing.body_movement_score is not None and existing.body_movement_score < 0.2:
        existing.body_movement_score = 0.2

    # Flag only after sustained HIGH movement (raised threshold from 3 -> 5 to reduce false positives)
    high_count = db.query(MovementTimeline).filter(
        MovementTimeline.video_interview_id == interview_id,
        MovementTimeline.movement_score == "HIGH"
    ).count()

    existing_flags = []
    if existing.flags:
        try:
            existing_flags = json.loads(existing.flags)
        except:
            pass
            
    # Remove old auto-generated flags (keep manually added ones)
    # Include audio-quality flag types so a fresh batch replaces stale audio flags.
    auto_flag_types = {
        "excessive_movement", "low_face_score", "low_lip_sync",
        "low_voice_consistency", "face_identity_change",
        "audio_dropped", "poor_audio_quality", "audio_noise",
    }
    existing_flags = [f for f in existing_flags if f.get("flag_type") not in auto_flag_types]

    # Flag face identity change (different person during interview)
    face_changed_count = getattr(payload, 'face_changed_count', 0)
    if face_changed_count > 0:
        existing_flags.append({
            "flag_type": "face_identity_change",
            "severity": "high",
            "description": f"Different person detected during interview (identity changed {face_changed_count} times)",
            "confidence": 0.90,
            "timestamp_seconds": 0
        })

    if high_count >= 5:
        existing_flags.append({
            "flag_type": "excessive_movement",
            "severity": "high" if high_count > 8 else "medium",
            "description": f"HIGH body movement detected {high_count} times",
            "confidence": 0.9,
            "timestamp_seconds": 0
        })

    # Flag low face detection score (possible fraud: no face or multiple faces)
    if existing.face_detection_score is not None and existing.face_detection_score < 0.5:
        existing_flags.append({
            "flag_type": "low_face_score",
            "severity": "high" if existing.face_detection_score < 0.3 else "medium",
            "description": f"Face detection score low: {existing.face_detection_score}",
            "confidence": 0.85,
            "timestamp_seconds": 0
        })

    # Flag low lip sync score (possible lip-sync fraud)
    if existing.lip_sync_score is not None and existing.lip_sync_score < 0.5:
        existing_flags.append({
            "flag_type": "low_lip_sync",
            "severity": "high" if existing.lip_sync_score < 0.3 else "medium",
            "description": f"Lip sync score low: {existing.lip_sync_score}",
            "confidence": 0.8,
            "timestamp_seconds": 0
        })

    # Flag low voice consistency (possible voice spoofing)
    if existing.voice_consistency_score is not None and existing.voice_consistency_score < 0.5:
        existing_flags.append({
            "flag_type": "low_voice_consistency",
            "severity": "high" if existing.voice_consistency_score < 0.3 else "medium",
            "description": f"Voice consistency score low: {existing.voice_consistency_score}",
            "confidence": 0.8,
            "timestamp_seconds": 0
        })

    existing.flags = json.dumps(existing_flags)
    existing.flag_count = len(existing_flags)
    
    # Recalculate overall trust score — weighted formula (consistent everywhere)
    # Weights: voice=30%, lip=30%, body=20%, face=20%
    v = existing.voice_consistency_score if existing.voice_consistency_score is not None else 0.8
    l = existing.lip_sync_score if existing.lip_sync_score is not None else 0.8
    b = existing.body_movement_score if existing.body_movement_score is not None else 0.8
    f = existing.face_detection_score if existing.face_detection_score is not None else 0.8
    existing.overall_trust_score = round(v * 0.30 + l * 0.30 + b * 0.20 + f * 0.20, 3)
        
    db.commit()
    return {"status": "success"}

@router.get("/movement-report/{interview_id}", response_model=List[MovementTimelineResponse])
def get_movement_report(
    interview_id: int,
    db: Session = Depends(get_db),
):
    """
    Returns full movement timeline for recruiter dashboard.
    """
    entries = db.query(MovementTimeline).filter(
        MovementTimeline.video_interview_id == interview_id
    ).order_by(MovementTimeline.timestamp.asc()).all()
    
    return entries
