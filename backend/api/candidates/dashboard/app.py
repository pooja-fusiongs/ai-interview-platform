from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func as sa_func, case

import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from database import get_db
from models import (
    User, UserRole, JobApplication, InterviewSession, InterviewSessionStatus,
    VideoInterview,
)
from api.auth.jwt_handler import get_current_active_user

router = APIRouter(tags=["Candidate Dashboard"])


@router.get("/api/candidate/dashboard")
def get_candidate_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Aggregate dashboard data for the logged-in candidate."""

    # Application stats — single DB query with conditional counts (no full table load)
    status_col = sa_func.lower(JobApplication.status)
    stats_result = db.query(
        sa_func.count(JobApplication.id).label("total"),
        sa_func.count(case((status_col == "applied", 1))).label("applied"),
        sa_func.count(case((status_col == "reviewed", 1))).label("reviewed"),
        sa_func.count(case((status_col.in_(["interview", "interview in progress"]), 1))).label("interview"),
        sa_func.count(case((status_col == "hired", 1))).label("hired"),
        sa_func.count(case((status_col == "rejected", 1))).label("rejected"),
    ).filter(JobApplication.applicant_email == current_user.email).first()

    app_stats = {
        "total": stats_result.total or 0,
        "applied": stats_result.applied or 0,
        "reviewed": stats_result.reviewed or 0,
        "interview": stats_result.interview or 0,
        "hired": stats_result.hired or 0,
        "rejected": stats_result.rejected or 0,
    }

    # Recent applications — only top 10, not all
    recent_apps = (
        db.query(JobApplication)
        .options(joinedload(JobApplication.job))
        .filter(JobApplication.applicant_email == current_user.email)
        .order_by(desc(JobApplication.created_at))
        .limit(10)
        .all()
    )
    recent_applications = [
        {
            "id": app.id,
            "job_title": app.job.title if app.job else "N/A",
            "status": app.status,
            "applied_at": app.created_at.isoformat() if app.created_at else None,
        }
        for app in recent_apps
    ]

    # Interview sessions — only top 10
    sessions = (
        db.query(InterviewSession)
        .options(joinedload(InterviewSession.job))
        .filter(InterviewSession.candidate_id == current_user.id)
        .order_by(desc(InterviewSession.created_at))
        .limit(10)
        .all()
    )
    session_list = [
        {
            "id": s.id,
            "job_title": s.job.title if s.job else "N/A",
            "status": s.status.value if hasattr(s.status, "value") else s.status,
            "overall_score": s.overall_score,
            "recommendation": s.recommendation.value if s.recommendation and hasattr(s.recommendation, "value") else s.recommendation,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        }
        for s in sessions
    ]

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

    # Unread notifications count (Notification model may not exist yet)
    unread_count = 0
    try:
        from models import Notification
        unread_count = (
            db.query(Notification)
            .filter(Notification.user_id == current_user.id, Notification.is_read == False)
            .count()
        )
    except Exception:
        pass  # Notification table doesn't exist yet

    return {
        "user": {
            "name": current_user.full_name or current_user.username,
            "email": current_user.email,
            "role": current_user.role.value if hasattr(current_user.role, "value") else current_user.role,
        },
        "application_stats": app_stats,
        "recent_applications": recent_applications,
        "interview_sessions": session_list,
        "upcoming_interviews": upcoming_list,
        "unread_notifications": unread_count,
    }
