from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional

from database import get_db
from api.auth.jwt_handler import get_current_active_user
from models import User, UserRole, AuditLog
from schemas import AuditLogResponse
from services.audit_service import get_audit_logs

router = APIRouter(tags=["GDPR Audit"])


@router.get("/api/gdpr/audit-logs", response_model=List[AuditLogResponse])
def query_audit_logs(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Admin only: Query audit logs with optional filters."""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(
            status_code=403, detail="Only admins can view audit logs"
        )

    logs = get_audit_logs(
        db=db,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        start_date=start_date,
        end_date=end_date,
    )
    return logs


@router.get("/api/gdpr/audit-logs/user/{user_id}", response_model=List[AuditLogResponse])
def get_user_audit_trail(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Admin only: Get the full audit trail for a specific user."""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(
            status_code=403, detail="Only admins can view user audit trails"
        )

    logs = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == user_id)
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    return logs
