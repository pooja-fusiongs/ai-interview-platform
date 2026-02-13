"""
Data retention and GDPR right-to-erasure service.

Implements automated retention cleanup, user anonymization, selective data
deletion, and portable data export (GDPR Article 17 & 20).
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy import and_
from sqlalchemy.orm import Session

import config
from models import (
    AuditLog,
    CandidateResume,
    ConsentRecord,
    DataExportRequest,
    DataRetentionPolicy,
    DeletionRequest,
    InterviewAnswer,
    InterviewSession,
    JobApplication,
    User,
)


# ---------------------------------------------------------------------------
# Retention cleanup
# ---------------------------------------------------------------------------

def run_retention_cleanup(db: Session) -> Dict[str, int]:
    """Delete data that has exceeded its configured retention period.

    Iterates over every active :class:`DataRetentionPolicy` row and removes
    records older than ``retention_days`` for the corresponding category.
    Only categories with ``auto_delete`` enabled are processed.

    Supported categories:
        * ``"resumes"`` -- :class:`CandidateResume`
        * ``"interview_sessions"`` -- :class:`InterviewSession`
        * ``"audit_logs"`` -- :class:`AuditLog`

    Args:
        db: Active database session.

    Returns:
        A summary dict mapping each processed category to the number of
        records deleted, e.g. ``{"resumes": 12, "interview_sessions": 3}``.
    """
    policies = db.query(DataRetentionPolicy).filter(
        DataRetentionPolicy.auto_delete == True  # noqa: E712
    ).all()

    summary: Dict[str, int] = {}

    category_map = {
        "resumes": CandidateResume,
        "interview_sessions": InterviewSession,
        "audit_logs": AuditLog,
    }

    for policy in policies:
        model = category_map.get(policy.data_category)
        if model is None:
            continue

        cutoff = datetime.utcnow() - timedelta(days=policy.retention_days)
        stale = db.query(model).filter(model.created_at < cutoff).all()
        count = len(stale)

        for record in stale:
            db.delete(record)

        if count > 0:
            summary[policy.data_category] = count

    db.commit()
    return summary


# ---------------------------------------------------------------------------
# User anonymization
# ---------------------------------------------------------------------------

def anonymize_user(db: Session, user_id: int) -> Dict:
    """Replace all PII on a user record with opaque placeholder values.

    This satisfies GDPR right-to-erasure requests while preserving
    referential integrity so that aggregate analytics remain valid.

    Fields overwritten: ``email``, ``username``, ``full_name``, ``phone``,
    ``mobile``.

    Args:
        db: Active database session.
        user_id: Primary key of the user to anonymize.

    Returns:
        A dict with ``"success"`` status and the anonymized user id, or an
        error message if the user was not found.
    """
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        return {"success": False, "message": f"User {user_id} not found"}

    placeholder = f"anonymized_{user_id}"

    user.email = f"{placeholder}@anonymized.invalid"
    user.username = placeholder
    user.full_name = placeholder
    user.phone = placeholder
    user.mobile = placeholder
    user.is_anonymized = True
    user.anonymized_at = datetime.utcnow()

    db.commit()
    db.refresh(user)

    return {
        "success": True,
        "user_id": user_id,
        "message": "User data has been anonymized",
        "anonymized_at": user.anonymized_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Selective user data deletion
# ---------------------------------------------------------------------------

_CATEGORY_DELETERS = {
    "interview_answers": lambda db, uid: _delete_interview_answers(db, uid),
    "interview_sessions": lambda db, uid: _delete_interview_sessions(db, uid),
    "resumes": lambda db, uid: _delete_resumes(db, uid),
    "consents": lambda db, uid: _delete_consents(db, uid),
    "audit_logs": lambda db, uid: _delete_audit_logs(db, uid),
}


def delete_user_data(
    db: Session,
    user_id: int,
    categories: Optional[List[str]] = None,
) -> Dict[str, int]:
    """Delete specific data categories belonging to a user.

    When *categories* is ``None`` **all** supported categories are deleted in
    dependency-safe order (answers before sessions).

    Supported categories: ``"interview_answers"``, ``"interview_sessions"``,
    ``"resumes"``, ``"consents"``, ``"audit_logs"``.

    Args:
        db: Active database session.
        user_id: The owning user whose data should be removed.
        categories: Optional list restricting which data types to remove.

    Returns:
        A summary dict mapping each category to the count of deleted records.
    """
    if categories is None:
        categories = [
            "interview_answers",
            "interview_sessions",
            "resumes",
            "consents",
            "audit_logs",
        ]

    summary: Dict[str, int] = {}

    for category in categories:
        deleter = _CATEGORY_DELETERS.get(category)
        if deleter is not None:
            summary[category] = deleter(db, user_id)

    db.commit()
    return summary


def _delete_interview_answers(db: Session, user_id: int) -> int:
    session_ids = [
        s.id
        for s in db.query(InterviewSession.id).filter(
            InterviewSession.candidate_id == user_id
        ).all()
    ]
    if not session_ids:
        return 0
    count = (
        db.query(InterviewAnswer)
        .filter(InterviewAnswer.session_id.in_(session_ids))
        .delete(synchronize_session="fetch")
    )
    return count


def _delete_interview_sessions(db: Session, user_id: int) -> int:
    count = (
        db.query(InterviewSession)
        .filter(InterviewSession.candidate_id == user_id)
        .delete(synchronize_session="fetch")
    )
    return count


def _delete_resumes(db: Session, user_id: int) -> int:
    application_ids = [
        a.id
        for a in db.query(JobApplication.id).filter(
            JobApplication.applicant_email == (
                db.query(User.email).filter(User.id == user_id).scalar()
            )
        ).all()
    ]
    if not application_ids:
        return 0
    count = (
        db.query(CandidateResume)
        .filter(CandidateResume.candidate_id.in_(application_ids))
        .delete(synchronize_session="fetch")
    )
    return count


def _delete_consents(db: Session, user_id: int) -> int:
    count = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.user_id == user_id)
        .delete(synchronize_session="fetch")
    )
    return count


def _delete_audit_logs(db: Session, user_id: int) -> int:
    count = (
        db.query(AuditLog)
        .filter(AuditLog.user_id == user_id)
        .delete(synchronize_session="fetch")
    )
    return count


# ---------------------------------------------------------------------------
# Portable data export  (GDPR Article 20)
# ---------------------------------------------------------------------------

def export_user_data(
    db: Session,
    user_id: int,
    export_format: str = "json",
) -> Dict:
    """Compile all data belonging to a user into a portable dict.

    The returned dictionary is suitable for JSON serialization.  The caller
    is responsible for writing the output to a file or HTTP response.

    Sections included: ``profile``, ``applications``, ``interview_sessions``
    (with nested answers), and ``consents``.

    Args:
        db: Active database session.
        user_id: The user whose data to export.
        export_format: Hint for the caller (default ``"json"``).

    Returns:
        A dict containing all exportable user data.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"error": f"User {user_id} not found"}

    # -- Profile --------------------------------------------------------
    profile = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "mobile": user.mobile,
        "company": user.company,
        "role": user.role.value if user.role else None,
        "department": user.department,
        "skills": user.skills,
        "experience_years": user.experience_years,
        "current_position": user.current_position,
        "bio": user.bio,
        "location": user.location,
        "education": user.education,
        "languages": user.languages,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

    # -- Job applications -----------------------------------------------
    applications_raw = (
        db.query(JobApplication)
        .filter(JobApplication.applicant_email == user.email)
        .all()
    )
    applications = [
        {
            "id": app.id,
            "job_id": app.job_id,
            "applicant_name": app.applicant_name,
            "applicant_email": app.applicant_email,
            "status": app.status,
            "applied_at": app.applied_at.isoformat() if app.applied_at else None,
        }
        for app in applications_raw
    ]

    # -- Interview sessions with answers --------------------------------
    sessions_raw = (
        db.query(InterviewSession)
        .filter(InterviewSession.candidate_id == user_id)
        .all()
    )
    sessions = []
    for sess in sessions_raw:
        answers_raw = (
            db.query(InterviewAnswer)
            .filter(InterviewAnswer.session_id == sess.id)
            .all()
        )
        answers = [
            {
                "id": ans.id,
                "question_id": ans.question_id,
                "answer_text": ans.answer_text,
                "score": ans.score,
                "relevance_score": ans.relevance_score,
                "completeness_score": ans.completeness_score,
                "accuracy_score": ans.accuracy_score,
                "clarity_score": ans.clarity_score,
                "feedback": ans.feedback,
                "created_at": ans.created_at.isoformat() if ans.created_at else None,
            }
            for ans in answers_raw
        ]
        sessions.append(
            {
                "id": sess.id,
                "job_id": sess.job_id,
                "status": sess.status.value if sess.status else None,
                "overall_score": sess.overall_score,
                "recommendation": sess.recommendation.value if sess.recommendation else None,
                "strengths": sess.strengths,
                "weaknesses": sess.weaknesses,
                "started_at": sess.started_at.isoformat() if sess.started_at else None,
                "completed_at": sess.completed_at.isoformat() if sess.completed_at else None,
                "answers": answers,
            }
        )

    # -- Consent records ------------------------------------------------
    consents_raw = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.user_id == user_id)
        .all()
    )
    consents = [
        {
            "id": c.id,
            "consent_type": c.consent_type.value if c.consent_type else None,
            "status": c.status.value if c.status else None,
            "consent_text": c.consent_text,
            "granted_at": c.granted_at.isoformat() if c.granted_at else None,
            "revoked_at": c.revoked_at.isoformat() if c.revoked_at else None,
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
        }
        for c in consents_raw
    ]

    return {
        "user_id": user_id,
        "export_format": export_format,
        "exported_at": datetime.utcnow().isoformat(),
        "profile": profile,
        "applications": applications,
        "interview_sessions": sessions,
        "consents": consents,
    }
