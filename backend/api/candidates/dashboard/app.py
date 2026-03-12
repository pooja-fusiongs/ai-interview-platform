from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc

import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from database import get_db
from models import (
    User, UserRole, JobApplication, InterviewSession, InterviewSessionStatus,
    VideoInterview, Notification
)
from api.auth.jwt_handler import get_current_active_user

router = APIRouter(tags=["Candidate Dashboard"])


@router.get("/api/candidate/dashboard")
def get_candidate_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Aggregate dashboard data for the logged-in candidate."""

    # Applications
    applications = (
        db.query(JobApplication)
        .filter(JobApplication.applicant_email == current_user.email)
        .all()
    )

    app_stats = {"total": 0, "applied": 0, "reviewed": 0, "interview": 0, "hired": 0, "rejected": 0}
    recent_applications = []
    for app in applications:
        app_stats["total"] += 1
        status_lower = (app.status or "").lower()
        if status_lower == "applied":
            app_stats["applied"] += 1
        elif status_lower == "reviewed":
            app_stats["reviewed"] += 1
        elif status_lower in ("interview", "interview in progress"):
            app_stats["interview"] += 1
        elif status_lower == "hired":
            app_stats["hired"] += 1
        elif status_lower == "rejected":
            app_stats["rejected"] += 1

        recent_applications.append({
            "id": app.id,
            "job_title": app.job.title if app.job else "N/A",
            "status": app.status,
            "applied_at": app.created_at.isoformat() if app.created_at else None,
        })

    # Interview sessions
    sessions = (
        db.query(InterviewSession)
        .options(joinedload(InterviewSession.job))
        .filter(InterviewSession.candidate_id == current_user.id)
        .order_by(desc(InterviewSession.created_at))
        .all()
    )

    session_list = []
    for s in sessions:
        session_list.append({
            "id": s.id,
            "job_title": s.job.title if s.job else "N/A",
            "status": s.status.value if hasattr(s.status, "value") else s.status,
            "overall_score": s.overall_score,
            "recommendation": s.recommendation.value if s.recommendation and hasattr(s.recommendation, "value") else s.recommendation,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        })

    # Upcoming video interviews
    upcoming_interviews = (
        db.query(VideoInterview)
        .options(joinedload(VideoInterview.job))
        .filter(
            VideoInterview.candidate_id == current_user.id,
            VideoInterview.status == "scheduled",
        )
        .order_by(VideoInterview.scheduled_at)
        .limit(5)
        .all()
    )

    upcoming_list = []
    for vi in upcoming_interviews:
        upcoming_list.append({
            "id": vi.id,
            "job_title": vi.job.title if vi.job else "N/A",
            "scheduled_at": vi.scheduled_at.isoformat() if vi.scheduled_at else None,
            "duration_minutes": vi.duration_minutes,
        })

    # Unread notifications count
    unread_count = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read == False)
        .count()
    )

    return {
        "user": {
            "name": current_user.full_name or current_user.username,
            "email": current_user.email,
            "role": current_user.role.value if hasattr(current_user.role, "value") else current_user.role,
        },
        "application_stats": app_stats,
        "recent_applications": sorted(recent_applications, key=lambda x: x["applied_at"] or "", reverse=True)[:10],
        "interview_sessions": session_list[:10],
        "upcoming_interviews": upcoming_list,
        "unread_notifications": unread_count,
    }
