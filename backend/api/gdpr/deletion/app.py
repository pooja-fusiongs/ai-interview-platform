from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List
import json

from database import get_db
from api.auth.jwt_handler import get_current_active_user
from models import User, UserRole, DeletionRequest
from schemas import DeletionRequestCreate, DeletionRequestResponse
from services.data_retention_service import delete_user_data, anonymize_user

router = APIRouter(tags=["GDPR Deletion"])


@router.post("/api/gdpr/deletion-request", response_model=DeletionRequestResponse)
def create_deletion_request(
    request_data: DeletionRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a data deletion request (Right to Erasure)."""
    deletion_request = DeletionRequest(
        user_id=current_user.id,
        request_type=request_data.request_type,
        data_categories=json.dumps(request_data.data_categories) if request_data.data_categories else None,
        reason=request_data.reason,
        status="pending",
    )
    db.add(deletion_request)
    db.commit()
    db.refresh(deletion_request)
    return deletion_request


@router.get("/api/gdpr/deletion-requests/me", response_model=List[DeletionRequestResponse])
def get_my_deletion_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get all deletion requests for the current user."""
    requests = (
        db.query(DeletionRequest)
        .filter(DeletionRequest.user_id == current_user.id)
        .order_by(DeletionRequest.requested_at.desc())
        .all()
    )
    return requests


@router.get("/api/gdpr/deletion-requests", response_model=List[DeletionRequestResponse])
def list_all_deletion_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Admin only: List all deletion requests."""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(
            status_code=403, detail="Only admins can view all deletion requests"
        )

    requests = (
        db.query(DeletionRequest)
        .order_by(DeletionRequest.requested_at.desc())
        .all()
    )
    return requests


@router.post(
    "/api/gdpr/deletion-requests/{request_id}/process",
    response_model=DeletionRequestResponse,
)
def process_deletion_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Admin only: Process a deletion request by deleting and anonymizing user data."""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(
            status_code=403, detail="Only admins can process deletion requests"
        )

    deletion_request = (
        db.query(DeletionRequest)
        .filter(DeletionRequest.id == request_id)
        .first()
    )
    if not deletion_request:
        raise HTTPException(status_code=404, detail="Deletion request not found")

    if deletion_request.status == "completed":
        raise HTTPException(
            status_code=400, detail="This deletion request has already been processed"
        )

    # Perform data deletion and anonymization
    deletion_summary = delete_user_data(db=db, user_id=deletion_request.user_id)
    anonymize_user(db=db, user_id=deletion_request.user_id)

    # Update the deletion request record
    deletion_request.status = "completed"
    deletion_request.processed_by = current_user.id
    deletion_request.processed_at = datetime.now(timezone.utc)
    deletion_request.completion_summary = (
        f"Data deletion and anonymization completed. {deletion_summary}"
    )
    db.commit()
    db.refresh(deletion_request)

    return deletion_request
