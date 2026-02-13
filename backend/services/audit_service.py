"""
Audit logging service for GDPR compliance.

Provides helpers to record and query user actions across the platform,
enabling accountability and traceability required by data-protection
regulations.
"""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import and_
from sqlalchemy.orm import Session

from models import AuditLog


def log_action(
    db: Session,
    user_id: int,
    action: str,
    resource_type: str,
    resource_id: Optional[int] = None,
    details: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> AuditLog:
    """Create an audit-log entry and persist it immediately.

    Args:
        db: Active database session.
        user_id: ID of the user who performed the action.
        action: Short verb/label (e.g. ``"login"``, ``"delete_data"``).
        resource_type: Kind of entity affected (e.g. ``"user"``, ``"resume"``).
        resource_id: Optional primary-key of the affected record.
        details: Optional free-text with additional context.
        ip_address: Optional client IP address.
        user_agent: Optional client User-Agent header.

    Returns:
        The newly created :class:`AuditLog` instance.
    """
    log_entry = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log_entry)
    db.commit()
    db.refresh(log_entry)
    return log_entry


def get_audit_logs(
    db: Session,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100,
) -> List[AuditLog]:
    """Query audit logs with optional filters.

    All filter parameters are optional; when omitted the corresponding
    condition is not applied.  Results are ordered newest-first.

    Args:
        db: Active database session.
        user_id: Filter by the acting user.
        action: Filter by action label.
        resource_type: Filter by resource kind.
        start_date: Only include logs created on or after this timestamp.
        end_date: Only include logs created on or before this timestamp.
        skip: Number of records to skip (for pagination).
        limit: Maximum number of records to return.

    Returns:
        A list of matching :class:`AuditLog` records.
    """
    filters = []

    if user_id is not None:
        filters.append(AuditLog.user_id == user_id)
    if action is not None:
        filters.append(AuditLog.action == action)
    if resource_type is not None:
        filters.append(AuditLog.resource_type == resource_type)
    if start_date is not None:
        filters.append(AuditLog.created_at >= start_date)
    if end_date is not None:
        filters.append(AuditLog.created_at <= end_date)

    query = db.query(AuditLog)
    if filters:
        query = query.filter(and_(*filters))

    return (
        query.order_by(AuditLog.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
