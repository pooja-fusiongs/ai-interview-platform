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
    looking_away_seconds = getattr(payload, 'looking_away_seconds', 0)

    if total_face > 0:
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

        # Penalty: looking away from screen (gaze detection)
        if looking_away_count > 0 and total_face > 0:
            looking_away_ratio = looking_away_count / total_face
            face_score -= looking_away_ratio * 0.3  # moderate penalty

        face_score = max(0.0, min(1.0, face_score))

        if existing.face_detection_score is not None:
            existing.face_detection_score = round((existing.face_detection_score * 0.5) + (face_score * 0.5), 3)
        else:
            existing.face_detection_score = round(face_score, 3)
        
    # Calculate lip score
    aaf = payload.lip_moving_with_audio + payload.lip_still_with_audio
    if aaf == 0:
        lip_score = 1.0
    else:
        sync_ratio = payload.lip_moving_with_audio / aaf
        mismatch_ratio = payload.lip_still_with_audio / aaf
        lip_score = max(0.0, min(1.0, sync_ratio - (mismatch_ratio * 0.3)))
        
    if existing.lip_sync_score is not None:
        existing.lip_sync_score = round((existing.lip_sync_score * 0.7) + (lip_score * 0.3), 3)
    else:
        existing.lip_sync_score = round(lip_score, 3)
        
    # Calculate voice score
    vs = payload.consistent_segments + payload.inconsistent_segments
    if vs == 0:
        voice_score = 1.0
    else:
        cr = payload.consistent_segments / vs
        sp = min(0.3, payload.pitch_shift_count * 0.03)
        voice_score = max(0.0, min(1.0, cr - sp))
        
    if existing.voice_consistency_score is not None:
        existing.voice_consistency_score = round((existing.voice_consistency_score * 0.7) + (voice_score * 0.3), 3)
    else:
        existing.voice_consistency_score = round(voice_score, 3)

    # Calculate Body Movement Score mapping to existing DB
    # CALM = 1.0, MODERATE = 0.5, HIGH = 0.0 for trust score
    b_score = 1.0
    if payload.movement_score == "MODERATE":
        b_score = 0.5
    elif payload.movement_score == "HIGH":
        b_score = 0.0
        
    if existing.body_movement_score is not None:
        existing.body_movement_score = round((existing.body_movement_score * 0.7) + (b_score * 0.3), 3)
    else:
        existing.body_movement_score = round(b_score, 3)

    # Fetch all movement entries to check for > 3 HIGH movements
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
            
    # Remove old movement flags
    existing_flags = [f for f in existing_flags if f.get("flag_type") != "excessive_movement"]
    
    if high_count >= 3:
        existing_flags.append({
            "flag_type": "excessive_movement",
            "severity": "high" if high_count > 5 else "medium",
            "description": f"HIGH body movement detected {high_count} times",
            "confidence": 0.9,
            "timestamp_seconds": 0
        })
        
    existing.flags = json.dumps(existing_flags)
    existing.flag_count = len(existing_flags)
    
    # Recalculate overall
    scores = [s for s in [
        existing.voice_consistency_score,
        existing.lip_sync_score,
        existing.body_movement_score,
        existing.face_detection_score,
    ] if s is not None]
    if scores:
        existing.overall_trust_score = round(sum(scores) / len(scores), 3)
        
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
