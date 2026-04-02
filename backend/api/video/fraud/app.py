"""
Fraud Detection API Endpoints.

Provides endpoints for:
- Triggering simulated fraud analysis on a video interview
- Retrieving fraud analysis results
- Dashboard-level statistics
- Listing flagged interviews
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from typing import List, Optional
from datetime import datetime
import json

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from database import get_db
from models import (
    User,
    VideoInterview,
    FraudAnalysis,
    UserRole,
)
from schemas import (
    FraudAnalysisResponse,
    FraudDashboardStats,
    VideoInterviewListResponse,
)
from api.auth.jwt_handler import get_current_active_user, require_any_role
# Lazy imports — these load heavy ML packages (opencv, mediapipe, transformers)
# Importing at module level causes 60+ second cold start on Cloud Run
def _get_run_real_analysis():
    from services.biometric_analyzer import run_real_analysis
    return run_real_analysis

def _get_run_simulated_analysis():
    from services.fraud_simulator import run_full_simulated_analysis
    return run_full_simulated_analysis

router = APIRouter(tags=["Fraud Detection"])


def get_or_create_fraud_analysis(db: Session, video_interview_id: int) -> FraudAnalysis:
    """Get existing or create new FraudAnalysis record. Prevents duplicates using row-level lock."""
    # First check without lock (fast path)
    existing = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.video_interview_id == video_interview_id)
        .first()
    )
    if existing:
        return existing

    # No record found — lock the VideoInterview row to serialize creation
    vi = (
        db.query(VideoInterview)
        .filter(VideoInterview.id == video_interview_id)
        .with_for_update()
        .first()
    )
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Re-check after acquiring lock (another request may have created it)
    existing = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.video_interview_id == video_interview_id)
        .first()
    )
    if existing:
        return existing
    # Safe to create — we hold the lock
    fraud = FraudAnalysis(
        video_interview_id=video_interview_id,
        analysis_status="pending",
    )
    db.add(fraud)
    db.flush()
    return fraud


# ---------------------------------------------------------------------------
# POST /api/video/fraud/{video_interview_id}/face-events  -- Live face detection
# ---------------------------------------------------------------------------

from pydantic import BaseModel


class FaceEventPayload(BaseModel):
    total_detections: int = 0
    no_face_count: int = 0
    multiple_face_count: int = 0
    single_face_count: int = 0
    no_face_seconds: float = 0
    multiple_face_seconds: float = 0
    max_faces_detected: int = 0
    detection_interval_ms: int = 750


@router.post("/{video_interview_id}/face-events")
def submit_face_events(
    video_interview_id: int,
    payload: FaceEventPayload,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Receive real-time face detection summary from the candidate's browser.
    Validates via candidate token (guest) or JWT auth (logged-in user).
    """
    vi = (
        db.query(VideoInterview)
        .filter(VideoInterview.id == video_interview_id)
        .first()
    )
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Validate access: candidate token or active interview participant
    from api.video.interviews.app import generate_candidate_token
    expected_token = generate_candidate_token(video_interview_id, vi.candidate_id) if vi.candidate_id else None
    if token != expected_token:
        # No valid candidate token — require JWT auth
        from fastapi import Request
        # Check if Authorization header is present (logged-in user)
        # If neither token nor auth, reject
        if not token:
            # Allow if interview is currently active (in_progress/waiting) — backward compat
            vi_status_check = vi.status.value if hasattr(vi.status, "value") else vi.status
            if vi_status_check not in ("in_progress", "waiting", "scheduled"):
                raise HTTPException(status_code=403, detail="Not authorized to submit face events")

    # Only block face events for fully ended interviews
    vi_status = vi.status.value if hasattr(vi.status, "value") else vi.status
    if vi_status in ("cancelled", "no_show", "completed"):
        raise HTTPException(status_code=400, detail="Interview is no longer active")

    # Calculate face detection score (0-1, higher = better/more trustworthy)
    # Skip if detector sent no meaningful data (total_detections=0 means model failed to run)
    if payload.total_detections == 0:
        return {"status": "skipped", "reason": "no face detections in payload"}

    total = payload.total_detections
    single_ratio = payload.single_face_count / total
    no_face_ratio = payload.no_face_count / total
    multi_face_ratio = payload.multiple_face_count / total

    # Score: single_face_ratio IS the score — no face detected = low score
    face_score = max(0.0, single_ratio)
    if multi_face_ratio > 0:
        face_score = max(0.0, face_score - (multi_face_ratio * 0.8))
    if payload.no_face_seconds > 2:
        face_score = max(0.0, face_score - 0.3)

    details = json.dumps({
        "total_detections": payload.total_detections,
        "single_face_count": payload.single_face_count,
        "no_face_count": payload.no_face_count,
        "multiple_face_count": payload.multiple_face_count,
        "single_face_pct": round(single_ratio * 100, 1),
        "no_face_pct": round(no_face_ratio * 100, 1),
        "multiple_face_pct": round(multi_face_ratio * 100, 1),
        "no_face_seconds": round(payload.no_face_seconds, 1),
        "multiple_face_seconds": round(payload.multiple_face_seconds, 1),
        "max_faces_detected": payload.max_faces_detected,
    })

    # Build face detection flags based on absolute counts (not just ratios)
    # Flags should persist once triggered — use both ratio and absolute thresholds
    face_flags = []
    if no_face_ratio > 0.2 or payload.no_face_seconds > 15:
        face_flags.append({
            "flag_type": "face_not_visible",
            "severity": "high" if no_face_ratio > 0.5 or payload.no_face_seconds > 60 else "medium",
            "description": f"Face not visible {round(no_face_ratio * 100)}% of interview ({round(payload.no_face_seconds)}s)",
            "confidence": round(no_face_ratio, 2),
            "timestamp_seconds": 0,
        })
    if payload.multiple_face_count > 0:
        face_flags.append({
            "flag_type": "multiple_faces",
            "severity": "high" if payload.multiple_face_count > 10 or multi_face_ratio > 0.1 else "medium",
            "description": f"Multiple faces detected {payload.multiple_face_count} times (max {payload.max_faces_detected} faces)",
            "confidence": round(multi_face_ratio, 2),
            "timestamp_seconds": 0,
        })

    # Get or create single FraudAnalysis record (prevents duplicates)
    existing = get_or_create_fraud_analysis(db, video_interview_id)
    now = datetime.utcnow()

    # Keep the WORST (lowest) face detection score
    if existing.face_detection_score is not None:
        existing.face_detection_score = round(min(face_score, existing.face_detection_score), 3)
    else:
        existing.face_detection_score = round(face_score, 3)
    existing.face_detection_details = details

    # Merge flags: keep existing non-face flags, and keep the WORST face flags
    existing_flags = []
    old_face_flags = []
    if existing.flags:
        try:
            parsed = json.loads(existing.flags)
            existing_flags = [f for f in parsed if f.get("flag_type") not in ("face_not_visible", "multiple_faces")]
            old_face_flags = [f for f in parsed if f.get("flag_type") in ("face_not_visible", "multiple_faces")]
        except (json.JSONDecodeError, TypeError):
            existing_flags = []
    merged_face_flags = {}
    for f in old_face_flags + face_flags:
        ft = f["flag_type"]
        if ft not in merged_face_flags:
            merged_face_flags[ft] = f
        else:
            sev_order = {"high": 3, "medium": 2, "low": 1}
            old_sev = sev_order.get(merged_face_flags[ft].get("severity", "low"), 0)
            new_sev = sev_order.get(f.get("severity", "low"), 0)
            if new_sev > old_sev or (new_sev == old_sev and f.get("confidence", 0) > merged_face_flags[ft].get("confidence", 0)):
                merged_face_flags[ft] = f
    all_flags = existing_flags + list(merged_face_flags.values())
    existing.flags = json.dumps(all_flags)
    existing.flag_count = len(all_flags)

    # Recalculate overall trust score
    scores = [s for s in [
        existing.voice_consistency_score,
        existing.lip_sync_score,
        existing.body_movement_score,
        existing.face_detection_score,
    ] if s is not None]
    if scores:
        existing.overall_trust_score = round(sum(scores) / len(scores), 3)
    if existing.analysis_status == "pending":
        existing.analysis_status = "completed"
        existing.analyzed_at = now

    db.commit()
    db.refresh(existing)
    return {"status": "updated", "face_detection_score": existing.face_detection_score, "flags": len(face_flags)}


# ---------------------------------------------------------------------------
# POST /api/video/fraud/{video_interview_id}/lip-events  -- Live lip sync detection
# ---------------------------------------------------------------------------


class LipEventPayload(BaseModel):
    total_frames: int = 0
    lip_moving_with_audio: int = 0
    lip_still_with_audio: int = 0
    lip_moving_no_audio: int = 0
    lip_still_no_audio: int = 0
    no_face_frames: int = 0
    max_mouth_openness: float = 0
    avg_mouth_openness: float = 0
    mismatch_seconds: float = 0
    detection_interval_ms: int = 750


@router.post("/{video_interview_id}/lip-events")
def submit_lip_events(
    video_interview_id: int,
    payload: LipEventPayload,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Receive real-time lip sync detection stats from the candidate's browser.
    Validates via candidate token or active interview status.
    """
    vi = (
        db.query(VideoInterview)
        .filter(VideoInterview.id == video_interview_id)
        .first()
    )
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    vi_status = vi.status.value if hasattr(vi.status, "value") else vi.status
    if vi_status in ("cancelled", "no_show", "completed"):
        raise HTTPException(status_code=400, detail="Interview is no longer active")

    # Validate: only allow during active interviews
    from api.video.interviews.app import generate_candidate_token
    expected_token = generate_candidate_token(video_interview_id, vi.candidate_id) if vi.candidate_id else None
    if token != expected_token and vi_status not in ("in_progress", "waiting", "scheduled"):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Calculate lip sync score
    # Frames where audio was active (candidate should be speaking)
    audio_active_frames = payload.lip_moving_with_audio + payload.lip_still_with_audio
    if audio_active_frames == 0:
        # No audio detected yet — can't calculate sync, give neutral score
        lip_score = 1.0
    else:
        # Sync ratio = how often lips move when audio is active
        sync_ratio = payload.lip_moving_with_audio / audio_active_frames
        # Penalize heavily for mismatch (audio active but lips still)
        mismatch_ratio = payload.lip_still_with_audio / audio_active_frames
        lip_score = max(0.0, min(1.0, sync_ratio - (mismatch_ratio * 0.3)))

    details = json.dumps({
        "total_frames": payload.total_frames,
        "lip_moving_with_audio": payload.lip_moving_with_audio,
        "lip_still_with_audio": payload.lip_still_with_audio,
        "lip_moving_no_audio": payload.lip_moving_no_audio,
        "lip_still_no_audio": payload.lip_still_no_audio,
        "no_face_frames": payload.no_face_frames,
        "sync_ratio": round(sync_ratio if audio_active_frames > 0 else 1.0, 3),
        "mismatch_seconds": round(payload.mismatch_seconds, 1),
        "max_mouth_openness": round(payload.max_mouth_openness, 4),
        "avg_mouth_openness": round(payload.avg_mouth_openness, 4),
    })

    # Build lip sync flags
    lip_flags = []
    if audio_active_frames > 0:
        mismatch_ratio_val = payload.lip_still_with_audio / audio_active_frames
        if mismatch_ratio_val > 0.3 or payload.mismatch_seconds > 20:
            lip_flags.append({
                "flag_type": "lip_sync_mismatch",
                "severity": "high" if mismatch_ratio_val > 0.5 or payload.mismatch_seconds > 45 else "medium",
                "description": f"Lip sync mismatch {round(mismatch_ratio_val * 100)}% of speaking time ({round(payload.mismatch_seconds)}s)",
                "confidence": round(mismatch_ratio_val, 2),
                "timestamp_seconds": 0,
            })

    # Get or create single FraudAnalysis record (prevents duplicates)
    existing = get_or_create_fraud_analysis(db, video_interview_id)
    now = datetime.utcnow()

    # Keep worst lip sync score
    if existing.lip_sync_score is not None:
        existing.lip_sync_score = round(min(lip_score, existing.lip_sync_score), 3)
    else:
        existing.lip_sync_score = round(lip_score, 3)
    existing.lip_sync_details = details

    # Merge lip flags with existing flags
    existing_flags = []
    old_lip_flags = []
    if existing.flags:
        try:
            parsed = json.loads(existing.flags)
            existing_flags = [f for f in parsed if f.get("flag_type") != "lip_sync_mismatch"]
            old_lip_flags = [f for f in parsed if f.get("flag_type") == "lip_sync_mismatch"]
        except (json.JSONDecodeError, TypeError):
            existing_flags = []

    merged_lip_flags = {}
    for f in old_lip_flags + lip_flags:
        ft = f["flag_type"]
        if ft not in merged_lip_flags:
            merged_lip_flags[ft] = f
        else:
            sev_order = {"high": 3, "medium": 2, "low": 1}
            old_sev = sev_order.get(merged_lip_flags[ft].get("severity", "low"), 0)
            new_sev = sev_order.get(f.get("severity", "low"), 0)
            if new_sev > old_sev or (new_sev == old_sev and f.get("confidence", 0) > merged_lip_flags[ft].get("confidence", 0)):
                merged_lip_flags[ft] = f

    all_flags = existing_flags + list(merged_lip_flags.values())
    existing.flags = json.dumps(all_flags)
    existing.flag_count = len(all_flags)

    # Recalculate overall trust score
    scores = [s for s in [
        existing.voice_consistency_score,
        existing.lip_sync_score,
        existing.body_movement_score,
        existing.face_detection_score,
    ] if s is not None]
    if scores:
        existing.overall_trust_score = round(sum(scores) / len(scores), 3)

    if existing.analysis_status == "pending":
        existing.analysis_status = "completed"
        existing.analyzed_at = now

    db.commit()
    db.refresh(existing)
    return {"status": "updated", "lip_sync_score": existing.lip_sync_score, "flags": len(lip_flags)}


# ---------------------------------------------------------------------------
# POST /api/video/fraud/{video_interview_id}/voice-events  -- Live voice consistency
# ---------------------------------------------------------------------------


class VoiceEventPayload(BaseModel):
    total_segments: int = 0
    consistent_segments: int = 0
    inconsistent_segments: int = 0
    silent_segments: int = 0
    avg_pitch: float = 0
    pitch_shift_count: int = 0
    max_pitch_deviation: float = 0
    inconsistent_seconds: float = 0
    detection_interval_ms: int = 1500


@router.post("/{video_interview_id}/voice-events")
def submit_voice_events(
    video_interview_id: int,
    payload: VoiceEventPayload,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Receive real-time voice consistency stats from the candidate's browser.
    Validates via candidate token or active interview status.
    """
    vi = (
        db.query(VideoInterview)
        .filter(VideoInterview.id == video_interview_id)
        .first()
    )
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    vi_status = vi.status.value if hasattr(vi.status, "value") else vi.status
    if vi_status in ("cancelled", "no_show", "completed"):
        raise HTTPException(status_code=400, detail="Interview is no longer active")

    # Validate: only allow during active interviews
    from api.video.interviews.app import generate_candidate_token
    expected_token = generate_candidate_token(video_interview_id, vi.candidate_id) if vi.candidate_id else None
    if token != expected_token and vi_status not in ("in_progress", "waiting", "scheduled"):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Calculate voice consistency score
    voiced_segments = payload.consistent_segments + payload.inconsistent_segments
    if voiced_segments == 0:
        voice_score = 1.0  # No voice data — neutral
    else:
        consistency_ratio = payload.consistent_segments / voiced_segments
        # Penalize pitch shifts
        shift_penalty = min(0.3, payload.pitch_shift_count * 0.03)
        voice_score = max(0.0, min(1.0, consistency_ratio - shift_penalty))

    details = json.dumps({
        "total_segments": payload.total_segments,
        "consistent_segments": payload.consistent_segments,
        "inconsistent_segments": payload.inconsistent_segments,
        "silent_segments": payload.silent_segments,
        "avg_pitch_hz": round(payload.avg_pitch, 1),
        "pitch_shift_count": payload.pitch_shift_count,
        "max_pitch_deviation_pct": round(payload.max_pitch_deviation * 100, 1),
        "inconsistent_seconds": round(payload.inconsistent_seconds, 1),
        "consistency_ratio": round(consistency_ratio if voiced_segments > 0 else 1.0, 3),
    })

    # Build voice flags
    voice_flags = []
    if voiced_segments > 0:
        inconsistency_ratio = payload.inconsistent_segments / voiced_segments
        if inconsistency_ratio > 0.2 or payload.pitch_shift_count > 5:
            voice_flags.append({
                "flag_type": "voice_pattern_change",
                "severity": "high" if inconsistency_ratio > 0.4 or payload.pitch_shift_count > 10 else "medium",
                "description": f"Voice pattern changed {payload.pitch_shift_count} times ({round(inconsistency_ratio * 100)}% inconsistent)",
                "confidence": round(inconsistency_ratio, 2),
                "timestamp_seconds": 0,
            })

    # Get or create single FraudAnalysis record
    existing = get_or_create_fraud_analysis(db, video_interview_id)
    now = datetime.utcnow()

    # Keep worst voice consistency score
    if existing.voice_consistency_score is not None:
        existing.voice_consistency_score = round(min(voice_score, existing.voice_consistency_score), 3)
    else:
        existing.voice_consistency_score = round(voice_score, 3)
    existing.voice_consistency_details = details

    # Merge voice flags
    existing_flags = []
    old_voice_flags = []
    if existing.flags:
        try:
            parsed = json.loads(existing.flags)
            existing_flags = [f for f in parsed if f.get("flag_type") != "voice_pattern_change"]
            old_voice_flags = [f for f in parsed if f.get("flag_type") == "voice_pattern_change"]
        except (json.JSONDecodeError, TypeError):
            existing_flags = []

    merged_voice_flags = {}
    for f in old_voice_flags + voice_flags:
        ft = f["flag_type"]
        if ft not in merged_voice_flags:
            merged_voice_flags[ft] = f
        else:
            sev_order = {"high": 3, "medium": 2, "low": 1}
            old_sev = sev_order.get(merged_voice_flags[ft].get("severity", "low"), 0)
            new_sev = sev_order.get(f.get("severity", "low"), 0)
            if new_sev > old_sev or (new_sev == old_sev and f.get("confidence", 0) > merged_voice_flags[ft].get("confidence", 0)):
                merged_voice_flags[ft] = f

    all_flags = existing_flags + list(merged_voice_flags.values())
    existing.flags = json.dumps(all_flags)
    existing.flag_count = len(all_flags)

    # Recalculate overall trust score
    scores = [s for s in [
        existing.voice_consistency_score,
        existing.lip_sync_score,
        existing.body_movement_score,
        existing.face_detection_score,
    ] if s is not None]
    if scores:
        existing.overall_trust_score = round(sum(scores) / len(scores), 3)

    if existing.analysis_status == "pending":
        existing.analysis_status = "completed"
        existing.analyzed_at = now

    db.commit()
    db.refresh(existing)
    return {"status": "updated", "voice_consistency_score": existing.voice_consistency_score, "flags": len(voice_flags)}


# ---------------------------------------------------------------------------
# POST /fraud/{video_interview_id}/analyze  -- Trigger analysis
# ---------------------------------------------------------------------------

@router.post("/{video_interview_id}/analyze", response_model=FraudAnalysisResponse)
def trigger_fraud_analysis(
    video_interview_id: int,
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
    db: Session = Depends(get_db),
):
    """
    Trigger fraud analysis for a completed video interview with a recording.
    Creates a new FraudAnalysis record or updates an existing one.
    Recruiter/Admin only.
    """
    # Verify the video interview exists
    vi = (
        db.query(VideoInterview)
        .filter(VideoInterview.id == video_interview_id)
        .first()
    )
    if not vi:
        raise HTTPException(
            status_code=404, detail="Video interview not found"
        )

    # Only allow analysis for completed interviews with a recording
    vi_status = vi.status.value if hasattr(vi.status, "value") else vi.status
    if vi_status != "completed":
        raise HTTPException(
            status_code=400,
            detail="Fraud analysis is only available for completed interviews"
        )

    if not vi.recording_url:
        raise HTTPException(
            status_code=400,
            detail="No recording available for this interview. Fraud analysis requires a recording."
        )

    # Create a pending fraud analysis record immediately so GET returns it
    existing = db.query(FraudAnalysis).filter(
        FraudAnalysis.video_interview_id == video_interview_id
    ).first()
    if not existing:
        existing = FraudAnalysis(
            video_interview_id=video_interview_id,
            analysis_status="processing",
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)
    elif existing.analysis_status == "completed":
        # Already analyzed — return existing result
        return FraudAnalysisResponse(
            id=existing.id,
            video_interview_id=existing.video_interview_id,
            voice_consistency_score=existing.voice_consistency_score,
            voice_consistency_details=existing.voice_consistency_details,
            lip_sync_score=existing.lip_sync_score,
            lip_sync_details=existing.lip_sync_details,
            body_movement_score=existing.body_movement_score,
            body_movement_details=existing.body_movement_details,
            face_detection_score=existing.face_detection_score,
            face_detection_details=existing.face_detection_details,
            overall_trust_score=existing.overall_trust_score,
            flags=existing.flags,
            flag_count=existing.flag_count,
            analysis_status=existing.analysis_status,
            consent_granted=existing.consent_granted,
            analyzed_at=existing.analyzed_at,
        )
    else:
        existing.analysis_status = "processing"
        db.commit()

    # Run heavy analysis in background thread
    _recording_url = vi.recording_url
    _vi_id = video_interview_id
    import threading
    def _bg_fraud_analysis():
        try:
            from database import SessionLocal
            bg_db = SessionLocal()
            import tempfile, requests

            # Download recording if remote URL
            recording_path = None
            temp_file = None
            if _recording_url.startswith("http://") or _recording_url.startswith("https://"):
                print(f"[fraud-bg] Downloading recording from {_recording_url[:80]}...")
                resp = requests.get(_recording_url, timeout=120)
                resp.raise_for_status()
                ext = ".webm" if ".webm" in _recording_url else ".mp4"
                temp_file = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
                temp_file.write(resp.content)
                temp_file.close()
                recording_path = temp_file.name
                print(f"[fraud-bg] Downloaded {len(resp.content)} bytes")
            else:
                base_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..")
                recording_path = os.path.join(base_dir, _recording_url.lstrip("/"))
                recording_path = os.path.normpath(recording_path)

            results = _get_run_real_analysis()(_vi_id, recording_path)

            # Cleanup temp
            if temp_file:
                try: os.unlink(temp_file.name)
                except OSError: pass

            # Update DB with results
            fa = bg_db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == _vi_id).first()
            if fa and results and not (isinstance(results, dict) and "_error" in results):
                fa.voice_consistency_score = results["voice_consistency_score"]
                fa.voice_consistency_details = results["voice_consistency_details"]
                fa.lip_sync_score = results["lip_sync_score"]
                fa.lip_sync_details = results["lip_sync_details"]
                fa.body_movement_score = results["body_movement_score"]
                fa.body_movement_details = results["body_movement_details"]
                fa.overall_trust_score = results["overall_trust_score"]
                fa.flags = results["flags"]
                fa.flag_count = results["flag_count"]
                fa.analysis_status = "completed"
                fa.analyzed_at = results["analyzed_at"]
                bg_db.commit()
                print(f"[fraud-bg] Analysis complete for VI {_vi_id}: trust={results['overall_trust_score']}")
            elif fa:
                fa.analysis_status = "failed"
                bg_db.commit()
                print(f"[fraud-bg] Analysis failed for VI {_vi_id}: {results}")
            bg_db.close()
        except Exception as e:
            print(f"[fraud-bg] Error: {e}")
            try:
                from database import SessionLocal
                err_db = SessionLocal()
                fa = err_db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == _vi_id).first()
                if fa:
                    fa.analysis_status = "failed"
                    err_db.commit()
                err_db.close()
            except Exception:
                pass

    threading.Thread(target=_bg_fraud_analysis, daemon=True).start()

    # Return immediately with "processing" status
    return FraudAnalysisResponse(
        id=existing.id,
        video_interview_id=existing.video_interview_id,
        voice_consistency_score=existing.voice_consistency_score,
        voice_consistency_details=existing.voice_consistency_details,
        lip_sync_score=existing.lip_sync_score,
        lip_sync_details=existing.lip_sync_details,
        body_movement_score=existing.body_movement_score,
        body_movement_details=existing.body_movement_details,
        face_detection_score=existing.face_detection_score,
        face_detection_details=existing.face_detection_details,
        overall_trust_score=existing.overall_trust_score,
        flags=existing.flags,
        flag_count=existing.flag_count,
        analysis_status=existing.analysis_status,
        consent_granted=existing.consent_granted,
        analyzed_at=existing.analyzed_at,
    )



# ---------------------------------------------------------------------------
# GET /api/video/fraud/dashboard  -- Dashboard statistics
# ---------------------------------------------------------------------------

@router.get("/dashboard", response_model=FraudDashboardStats)
def fraud_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Fraud detection dashboard stats — returns instantly.
    Heavy auto-analysis moved to background thread.
    """
    # Kick off auto-analysis in background (non-blocking)
    import threading
    def _bg_analyze():
        try:
            from database import SessionLocal
            bg_db = SessionLocal()
            # Find unanalyzed interviews
            unanalyzed = (
                bg_db.query(VideoInterview)
                .filter(
                    VideoInterview.status == "completed",
                    VideoInterview.recording_url.isnot(None),
                    ~VideoInterview.id.in_(
                        bg_db.query(FraudAnalysis.video_interview_id)
                    ),
                )
                .limit(3)  # Process max 3 at a time to avoid overload
                .all()
            )
            for vi in unanalyzed:
                try:
                    recording_path = None
                    temp_file = None
                    if vi.recording_url.startswith("http://") or vi.recording_url.startswith("https://"):
                        import tempfile, requests
                        try:
                            resp = requests.get(vi.recording_url, timeout=60)
                            resp.raise_for_status()
                            ext = ".webm" if ".webm" in vi.recording_url else ".mp4"
                            temp_file = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
                            temp_file.write(resp.content)
                            temp_file.close()
                            recording_path = temp_file.name
                        except Exception as dl_err:
                            print(f"[BG] Failed to download recording for VI {vi.id}: {dl_err}")
                            continue
                    else:
                        base_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..")
                        recording_path = os.path.join(base_dir, vi.recording_url.lstrip("/"))
                        recording_path = os.path.normpath(recording_path)
                    results = _get_run_real_analysis()(vi.id, recording_path)
                    if temp_file:
                        try: os.unlink(temp_file.name)
                        except OSError: pass
                    if results is None:
                        print(f"[BG] Skipping VI {vi.id} — real analysis unavailable")
                        continue
                    fraud = FraudAnalysis(
                        video_interview_id=vi.id,
                        voice_consistency_score=results["voice_consistency_score"],
                        voice_consistency_details=results["voice_consistency_details"],
                        lip_sync_score=results["lip_sync_score"],
                        lip_sync_details=results["lip_sync_details"],
                        body_movement_score=results["body_movement_score"],
                        body_movement_details=results["body_movement_details"],
                        overall_trust_score=results["overall_trust_score"],
                        flags=results["flags"],
                        flag_count=results["flag_count"],
                        analysis_status="completed",
                        analyzed_at=results["analyzed_at"],
                    )
                    bg_db.add(fraud)
                    bg_db.commit()
                    print(f"[BG] Auto-analyzed fraud for VI {vi.id}")
                except Exception as e:
                    bg_db.rollback()
                    print(f"[BG] Auto-analysis failed for VI {vi.id}: {e}")
            bg_db.close()
        except Exception as e:
            print(f"[BG] Fraud auto-analysis error: {e}")

    threading.Thread(target=_bg_analyze, daemon=True).start()

    # Return stats instantly using single aggregation query
    stats = db.query(
        sql_func.count(FraudAnalysis.id).label("analyzed"),
        sql_func.count(sql_func.nullif(FraudAnalysis.flag_count == 0, True)).label("flagged"),
        sql_func.avg(FraudAnalysis.overall_trust_score).label("avg_trust"),
    ).filter(FraudAnalysis.analysis_status == "completed").first()

    total_interviews = db.query(sql_func.count(VideoInterview.id)).scalar() or 0
    analyzed_count = stats.analyzed or 0
    flagged_count = db.query(sql_func.count(FraudAnalysis.id)).filter(
        FraudAnalysis.flag_count > 0
    ).scalar() or 0
    cleared_count = analyzed_count - flagged_count
    average_trust_score = round(float(stats.avg_trust), 3) if stats.avg_trust else 0.0

    # Severity breakdown — single query with JSON parsing in Python
    severity_counts = {"high": 0, "medium": 0, "low": 0}
    flagged_records = db.query(FraudAnalysis.flags).filter(
        FraudAnalysis.analysis_status == "completed",
        FraudAnalysis.flags.isnot(None),
    ).all()
    for (flags_json,) in flagged_records:
        try:
            for flag in json.loads(flags_json):
                sev = flag.get("severity", "low")
                if sev in severity_counts:
                    severity_counts[sev] += 1
        except (json.JSONDecodeError, TypeError):
            pass

    return FraudDashboardStats(
        total_interviews=total_interviews,
        analyzed_count=analyzed_count,
        flagged_count=flagged_count,
        cleared_count=cleared_count,
        average_trust_score=average_trust_score,
        flag_breakdown=severity_counts,
    )


# ---------------------------------------------------------------------------
# GET /api/video/fraud/flagged  -- List flagged interviews
# ---------------------------------------------------------------------------

@router.get("/flagged")
def list_flagged_interviews(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    List all fraud analyses with flag_count > 0, joined with
    video interview details for context.
    """
    from sqlalchemy.orm import joinedload
    flagged = (
        db.query(FraudAnalysis)
        .options(
            joinedload(FraudAnalysis.video_interview).joinedload(VideoInterview.candidate),
            joinedload(FraudAnalysis.video_interview).joinedload(VideoInterview.job),
        )
        .filter(FraudAnalysis.flag_count > 0)
        .order_by(FraudAnalysis.analyzed_at.desc().nullslast())
        .limit(100)
        .all()
    )

    results = []
    for fa in flagged:
        vi = fa.video_interview
        candidate_name = ""
        job_title = ""
        if vi:
            if vi.candidate:
                candidate_name = (
                    vi.candidate.full_name or vi.candidate.username or ""
                )
            if vi.job:
                job_title = vi.job.title or ""

        results.append({
            "fraud_analysis_id": fa.id,
            "video_interview_id": fa.video_interview_id,
            "candidate_name": candidate_name,
            "job_title": job_title,
            "overall_trust_score": fa.overall_trust_score,
            "flag_count": fa.flag_count,
            "flags": fa.flags,
            "voice_consistency_score": fa.voice_consistency_score,
            "lip_sync_score": fa.lip_sync_score,
            "body_movement_score": fa.body_movement_score,
            "analysis_status": fa.analysis_status,
            "analyzed_at": fa.analyzed_at.isoformat() if fa.analyzed_at else None,
            "scheduled_at": vi.scheduled_at.isoformat() if vi and vi.scheduled_at else None,
            "interview_status": (
                vi.status.value if vi and hasattr(vi.status, "value") else (vi.status if vi else None)
            ),
        })

    return {"flagged_interviews": results, "total": len(results)}


# ---------------------------------------------------------------------------
# GET /api/video/fraud/all  -- All analyses for live monitor
# ---------------------------------------------------------------------------

@router.get("/all")
def list_all_analyses(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """All fraud analyses (live + completed) for monitor dashboard.
    Also includes in_progress/waiting interviews that don't have fraud data yet."""
    from sqlalchemy.orm import joinedload, aliased
    from sqlalchemy import outerjoin

    # 1) Interviews WITH fraud analysis (completed/in_progress)
    analyses = (
        db.query(FraudAnalysis)
        .join(VideoInterview, FraudAnalysis.video_interview_id == VideoInterview.id)
        .options(
            joinedload(FraudAnalysis.video_interview).joinedload(VideoInterview.candidate),
            joinedload(FraudAnalysis.video_interview).joinedload(VideoInterview.job),
        )
        .filter(VideoInterview.status.notin_(["scheduled"]))
        .order_by(FraudAnalysis.analyzed_at.desc().nullslast())
        .limit(100)
        .all()
    )

    seen_vi_ids = set()
    results = []
    for fa in analyses:
        vi = fa.video_interview
        seen_vi_ids.add(fa.video_interview_id)
        candidate_name = ""
        job_title = ""
        if vi:
            if vi.candidate:
                candidate_name = vi.candidate.full_name or vi.candidate.username or ""
            if vi.job:
                job_title = vi.job.title or ""
        interview_status = ""
        if vi:
            interview_status = vi.status.value if hasattr(vi.status, "value") else (vi.status or "")
        results.append({
            "fraud_analysis_id": fa.id,
            "video_interview_id": fa.video_interview_id,
            "candidate_name": candidate_name,
            "job_title": job_title,
            "overall_trust_score": fa.overall_trust_score,
            "flag_count": fa.flag_count,
            "flags": fa.flags,
            "voice_consistency_score": fa.voice_consistency_score,
            "lip_sync_score": fa.lip_sync_score,
            "body_movement_score": fa.body_movement_score,
            "face_detection_score": fa.face_detection_score,
            "face_detection_details": fa.face_detection_details,
            "analysis_status": fa.analysis_status,
            "interview_status": interview_status,
            "analyzed_at": fa.analyzed_at.isoformat() if fa.analyzed_at else None,
        })

    # 2) Live interviews WITHOUT fraud analysis yet (just started)
    live_interviews = (
        db.query(VideoInterview)
        .options(
            joinedload(VideoInterview.candidate),
            joinedload(VideoInterview.job),
        )
        .filter(VideoInterview.status.in_(["in_progress", "waiting"]))
        .filter(VideoInterview.id.notin_(seen_vi_ids) if seen_vi_ids else sql_func.true())
        .order_by(VideoInterview.started_at.desc().nullslast())
        .limit(20)
        .all()
    )
    for vi in live_interviews:
        candidate_name = ""
        job_title = ""
        if vi.candidate:
            candidate_name = vi.candidate.full_name or vi.candidate.username or ""
        if vi.job:
            job_title = vi.job.title or ""
        interview_status = vi.status.value if hasattr(vi.status, "value") else (vi.status or "")
        results.append({
            "fraud_analysis_id": None,
            "video_interview_id": vi.id,
            "candidate_name": candidate_name,
            "job_title": job_title,
            "overall_trust_score": None,
            "flag_count": 0,
            "flags": [],
            "voice_consistency_score": None,
            "lip_sync_score": None,
            "body_movement_score": None,
            "face_detection_score": None,
            "face_detection_details": None,
            "analysis_status": "pending",
            "interview_status": interview_status,
            "analyzed_at": None,
        })

    return {"analyses": results, "total": len(results)}


# ---------------------------------------------------------------------------
# GET /api/video/fraud/{video_interview_id}  -- Get analysis for interview
# ---------------------------------------------------------------------------

@router.get("/{video_interview_id}", response_model=FraudAnalysisResponse)
def get_fraud_analysis(
    video_interview_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get fraud analysis results for a specific video interview."""
    fraud = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.video_interview_id == video_interview_id)
        .first()
    )
    if not fraud:
        raise HTTPException(
            status_code=404, detail="Fraud analysis not found for this interview"
        )

    return FraudAnalysisResponse(
        id=fraud.id,
        video_interview_id=fraud.video_interview_id,
        voice_consistency_score=fraud.voice_consistency_score,
        voice_consistency_details=fraud.voice_consistency_details,
        lip_sync_score=fraud.lip_sync_score,
        lip_sync_details=fraud.lip_sync_details,
        body_movement_score=fraud.body_movement_score,
        body_movement_details=fraud.body_movement_details,
        face_detection_score=fraud.face_detection_score,
        face_detection_details=fraud.face_detection_details,
        overall_trust_score=fraud.overall_trust_score,
        flags=fraud.flags,
        flag_count=fraud.flag_count,
        analysis_status=fraud.analysis_status,
        consent_granted=fraud.consent_granted,
        analyzed_at=fraud.analyzed_at,
    )
