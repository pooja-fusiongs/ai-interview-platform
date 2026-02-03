"""
Video Interview API Endpoints.

Manages the full lifecycle of video interviews: scheduling, listing,
updating, starting, ending, and cancellation. Integrates with the
Zoom service for meeting creation/deletion and checks for associated
fraud analysis records.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from database import get_db
from models import (
    User,
    Job,
    VideoInterview,
    VideoInterviewStatus,
    FraudAnalysis,
    UserRole,
)
from schemas import (
    VideoInterviewCreate,
    VideoInterviewResponse,
    VideoInterviewUpdate,
    VideoInterviewListResponse,
)
from api.auth.jwt_handler import get_current_active_user, require_any_role
from services.zoom_service import create_zoom_meeting, delete_zoom_meeting

router = APIRouter(tags=["Video Interviews"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_response(vi: VideoInterview) -> VideoInterviewResponse:
    """Build a VideoInterviewResponse from an ORM object with joined names."""
    candidate_name = None
    if vi.candidate:
        candidate_name = vi.candidate.full_name or vi.candidate.username

    interviewer_name = None
    if vi.interviewer:
        interviewer_name = vi.interviewer.full_name or vi.interviewer.username

    job_title = vi.job.title if vi.job else None

    return VideoInterviewResponse(
        id=vi.id,
        session_id=vi.session_id,
        job_id=vi.job_id,
        candidate_id=vi.candidate_id,
        interviewer_id=vi.interviewer_id,
        zoom_meeting_url=vi.zoom_meeting_url,
        zoom_passcode=vi.zoom_passcode,
        status=vi.status.value if hasattr(vi.status, "value") else vi.status,
        scheduled_at=vi.scheduled_at,
        duration_minutes=vi.duration_minutes,
        started_at=vi.started_at,
        ended_at=vi.ended_at,
        recording_consent=vi.recording_consent,
        candidate_name=candidate_name,
        interviewer_name=interviewer_name,
        job_title=job_title,
    )


def _build_list_item(vi: VideoInterview, db: Session) -> VideoInterviewListResponse:
    """Build a list-view item including fraud analysis summary."""
    candidate_name = ""
    if vi.candidate:
        candidate_name = vi.candidate.full_name or vi.candidate.username or ""

    job_title = vi.job.title if vi.job else ""

    # Check for existing fraud analysis
    fraud = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.video_interview_id == vi.id)
        .first()
    )

    return VideoInterviewListResponse(
        id=vi.id,
        job_title=job_title,
        candidate_name=candidate_name,
        status=vi.status.value if hasattr(vi.status, "value") else vi.status,
        scheduled_at=vi.scheduled_at,
        duration_minutes=vi.duration_minutes,
        has_fraud_analysis=fraud is not None,
        flag_count=fraud.flag_count if fraud else 0,
        overall_trust_score=fraud.overall_trust_score if fraud else None,
    )


# ---------------------------------------------------------------------------
# POST /api/video/interviews  -- Schedule a new video interview
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews", response_model=VideoInterviewResponse)
def schedule_video_interview(
    body: VideoInterviewCreate,
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
    db: Session = Depends(get_db),
):
    """Schedule a new video interview. Recruiter/Admin only."""
    # Validate job exists
    job = db.query(Job).filter(Job.id == body.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Validate candidate exists
    candidate = db.query(User).filter(User.id == body.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Attempt to create a Zoom meeting
    topic = f"Interview: {job.title} - {candidate.full_name or candidate.username}"
    zoom_data = create_zoom_meeting(
        topic=topic,
        start_time=body.scheduled_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        duration=body.duration_minutes,
    )

    vi = VideoInterview(
        session_id=body.session_id,
        job_id=body.job_id,
        candidate_id=body.candidate_id,
        interviewer_id=body.interviewer_id,
        scheduled_at=body.scheduled_at,
        duration_minutes=body.duration_minutes,
        status=VideoInterviewStatus.SCHEDULED,
    )

    if zoom_data:
        vi.zoom_meeting_id = zoom_data["meeting_id"]
        vi.zoom_meeting_url = zoom_data["join_url"]
        vi.zoom_host_url = zoom_data["host_url"]
        vi.zoom_passcode = zoom_data["passcode"]

    db.add(vi)
    db.commit()
    db.refresh(vi)
    return _build_response(vi)


# ---------------------------------------------------------------------------
# GET /api/video/interviews  -- List all video interviews
# ---------------------------------------------------------------------------

@router.get(
    "/api/video/interviews",
    response_model=List[VideoInterviewListResponse],
)
def list_video_interviews(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    List video interviews.
    Recruiters/Admins see all; Candidates see only their own.
    """
    query = db.query(VideoInterview)
    if current_user.role == UserRole.CANDIDATE:
        query = query.filter(VideoInterview.candidate_id == current_user.id)

    interviews = query.order_by(VideoInterview.scheduled_at.desc()).all()
    return [_build_list_item(vi, db) for vi in interviews]


# ---------------------------------------------------------------------------
# GET /api/video/interviews/candidate/me  -- My scheduled interviews
# ---------------------------------------------------------------------------

@router.get(
    "/api/video/interviews/candidate/me",
    response_model=List[VideoInterviewResponse],
)
def get_my_video_interviews(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all video interviews for the current candidate."""
    interviews = (
        db.query(VideoInterview)
        .filter(VideoInterview.candidate_id == current_user.id)
        .order_by(VideoInterview.scheduled_at.desc())
        .all()
    )
    return [_build_response(vi) for vi in interviews]


# ---------------------------------------------------------------------------
# GET /api/video/interviews/{video_id}  -- Get single interview details
# ---------------------------------------------------------------------------

@router.get(
    "/api/video/interviews/{video_id}",
    response_model=VideoInterviewResponse,
)
def get_video_interview(
    video_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a single video interview with full details."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Candidates can only view their own
    if (
        current_user.role == UserRole.CANDIDATE
        and vi.candidate_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    return _build_response(vi)


# ---------------------------------------------------------------------------
# PUT /api/video/interviews/{video_id}  -- Update schedule / status
# ---------------------------------------------------------------------------

@router.put(
    "/api/video/interviews/{video_id}",
    response_model=VideoInterviewResponse,
)
def update_video_interview(
    video_id: int,
    body: VideoInterviewUpdate,
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
    db: Session = Depends(get_db),
):
    """Update a video interview schedule or status. Recruiter/Admin only."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    if body.status is not None:
        vi.status = body.status
    if body.scheduled_at is not None:
        vi.scheduled_at = body.scheduled_at
    if body.duration_minutes is not None:
        vi.duration_minutes = body.duration_minutes
    if body.notes is not None:
        vi.notes = body.notes

    db.commit()
    db.refresh(vi)
    return _build_response(vi)


# ---------------------------------------------------------------------------
# DELETE /api/video/interviews/{video_id}  -- Cancel interview
# ---------------------------------------------------------------------------

@router.delete("/api/video/interviews/{video_id}")
def cancel_video_interview(
    video_id: int,
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
    db: Session = Depends(get_db),
):
    """Cancel a video interview. If a Zoom meeting exists, delete it."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Attempt to cancel the Zoom meeting
    if vi.zoom_meeting_id:
        delete_zoom_meeting(vi.zoom_meeting_id)

    vi.status = VideoInterviewStatus.CANCELLED
    db.commit()

    return {"message": "Video interview cancelled", "id": video_id}


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/start  -- Mark as started
# ---------------------------------------------------------------------------

@router.post(
    "/api/video/interviews/{video_id}/start",
    response_model=VideoInterviewResponse,
)
def start_video_interview(
    video_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Mark a video interview as started."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    vi.status = VideoInterviewStatus.IN_PROGRESS
    vi.started_at = datetime.utcnow()
    db.commit()
    db.refresh(vi)
    return _build_response(vi)


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/end  -- Mark as ended
# ---------------------------------------------------------------------------

@router.post(
    "/api/video/interviews/{video_id}/end",
    response_model=VideoInterviewResponse,
)
def end_video_interview(
    video_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Mark a video interview as completed."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    vi.status = VideoInterviewStatus.COMPLETED
    vi.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(vi)
    return _build_response(vi)
