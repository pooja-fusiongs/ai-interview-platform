from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List

from database import get_db
from api.auth.jwt_handler import get_current_active_user
from models import User, UserRole, ConsentRecord, ConsentStatus, ConsentType
from schemas import ConsentCreate, ConsentResponse, ConsentStatusCheck
from services.audit_service import log_action

router = APIRouter(tags=["GDPR Consent"])


@router.post("/api/gdpr/consent", response_model=ConsentResponse)
def grant_consent(
    consent_data: ConsentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Grant consent for a specific data processing type."""
    ip_address = request.client.host if request.client else None

    consent_record = ConsentRecord(
        user_id=current_user.id,
        consent_type=consent_data.consent_type,
        consent_text=consent_data.consent_text,
        status=ConsentStatus.GRANTED,
        ip_address=ip_address,
        granted_at=datetime.now(timezone.utc),
    )
    db.add(consent_record)
    db.commit()
    db.refresh(consent_record)

    log_action(
        db=db,
        user_id=current_user.id,
        action="consent_granted",
        resource_type="consent",
        resource_id=consent_record.id,
        details=f"Consent granted for {consent_data.consent_type}",
        ip_address=ip_address,
    )

    return consent_record


@router.get("/api/gdpr/consent/me", response_model=List[ConsentResponse])
def get_my_consents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get all consent records for the current user."""
    consents = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.user_id == current_user.id)
        .order_by(ConsentRecord.created_at.desc())
        .all()
    )
    return consents


@router.get("/api/gdpr/consent/check/{consent_type}", response_model=ConsentStatusCheck)
def check_consent(
    consent_type: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Check if the current user has granted a specific consent type."""
    active_consent = (
        db.query(ConsentRecord)
        .filter(
            ConsentRecord.user_id == current_user.id,
            ConsentRecord.consent_type == consent_type,
            ConsentRecord.status == ConsentStatus.GRANTED,
        )
        .first()
    )

    return ConsentStatusCheck(
        consent_type=consent_type,
        is_granted=active_consent is not None,
        granted_at=active_consent.granted_at if active_consent else None,
    )


@router.put("/api/gdpr/consent/{consent_id}/revoke", response_model=ConsentResponse)
def revoke_consent(
    consent_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Revoke a previously granted consent. Only the owner can revoke."""
    consent_record = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.id == consent_id)
        .first()
    )
    if not consent_record:
        raise HTTPException(status_code=404, detail="Consent record not found")

    if consent_record.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="You can only revoke your own consent"
        )

    consent_record.status = ConsentStatus.REVOKED
    consent_record.revoked_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(consent_record)

    ip_address = request.client.host if request.client else None
    log_action(
        db=db,
        user_id=current_user.id,
        action="consent_revoked",
        resource_type="consent",
        resource_id=consent_record.id,
        details=f"Consent revoked for {consent_record.consent_type}",
        ip_address=ip_address,
    )

    return consent_record


@router.get("/api/gdpr/consent/user/{user_id}", response_model=List[ConsentResponse])
def get_user_consents(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Admin only: Get all consent records for a specific user."""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(
            status_code=403, detail="Only admins can view other users' consents"
        )

    consents = (
        db.query(ConsentRecord)
        .filter(ConsentRecord.user_id == user_id)
        .order_by(ConsentRecord.created_at.desc())
        .all()
    )
    return consents
