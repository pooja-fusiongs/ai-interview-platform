"""
ATS Sync API Router
Trigger syncs and inspect sync history, job mappings, and candidate mappings.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User,
    ATSConnection,
    ATSSyncLog,
    ATSJobMapping,
    ATSCandidateMapping,
)
from schemas import ATSSyncTrigger
from api.auth.jwt_handler import get_current_active_user
from services.audit_service import log_action
from services.ats.sync_service import sync_jobs, sync_candidates, full_sync

router = APIRouter(tags=["ATS"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_recruiter_or_admin(current_user: User) -> None:
    """Raise 403 if the user is neither a recruiter nor an admin."""
    if current_user.role not in ("recruiter", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters or admins can access ATS sync features.",
        )


def _get_active_connection(
    connection_id: int,
    db: Session,
    current_user: User,
) -> ATSConnection:
    """Return the active connection owned by the current user, or 404."""
    connection = (
        db.query(ATSConnection)
        .filter(
            ATSConnection.id == connection_id,
            ATSConnection.user_id == current_user.id,
            ATSConnection.is_active == True,
        )
        .first()
    )
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ATS connection {connection_id} not found.",
        )
    return connection


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/api/ats/connections/{connection_id}/sync")
def trigger_sync(
    connection_id: int,
    payload: ATSSyncTrigger,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Trigger an ATS sync.

    Accepted *sync_type* values: ``jobs``, ``candidates``, ``full``.
    Returns the resulting sync log entry.
    """
    _require_recruiter_or_admin(current_user)
    connection = _get_active_connection(connection_id, db, current_user)

    sync_dispatch = {
        "jobs": sync_jobs,
        "candidates": sync_candidates,
        "full": full_sync,
    }

    sync_fn = sync_dispatch.get(payload.sync_type)
    if sync_fn is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sync_type '{payload.sync_type}'. "
                   f"Must be one of: jobs, candidates, full.",
        )

    try:
        sync_log = sync_fn(db=db, connection_id=connection.id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sync failed: {str(exc)}",
        )

    log_action(
        db=db,
        user_id=current_user.id,
        action="ats_sync_triggered",
        details=(
            f"sync_type={payload.sync_type} "
            f"connection_id={connection.id} "
            f"sync_log_id={sync_log.id}"
        ),
    )

    return sync_log


@router.get("/api/ats/connections/{connection_id}/sync-logs")
def get_sync_logs(
    connection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Return the sync history for a given connection, newest first."""
    _require_recruiter_or_admin(current_user)
    _get_active_connection(connection_id, db, current_user)

    logs = (
        db.query(ATSSyncLog)
        .filter(ATSSyncLog.connection_id == connection_id)
        .order_by(ATSSyncLog.started_at.desc())
        .all()
    )
    return logs


@router.get("/api/ats/connections/{connection_id}/job-mappings")
def get_job_mappings(
    connection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Return all job mappings for the given ATS connection."""
    _require_recruiter_or_admin(current_user)
    _get_active_connection(connection_id, db, current_user)

    mappings = (
        db.query(ATSJobMapping)
        .filter(ATSJobMapping.connection_id == connection_id)
        .all()
    )
    return mappings


@router.get("/api/ats/connections/{connection_id}/candidate-mappings")
def get_candidate_mappings(
    connection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Return all candidate mappings for the given ATS connection."""
    _require_recruiter_or_admin(current_user)
    _get_active_connection(connection_id, db, current_user)

    mappings = (
        db.query(ATSCandidateMapping)
        .filter(ATSCandidateMapping.connection_id == connection_id)
        .all()
    )
    return mappings
