from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List

from database import get_db
from api.auth.jwt_handler import get_current_active_user
from models import User, UserRole, DataRetentionPolicy
from schemas import DataRetentionPolicyCreate, DataRetentionPolicyResponse
from services.data_retention_service import run_retention_cleanup

router = APIRouter(tags=["GDPR Retention"])


@router.get("/api/gdpr/retention-policies", response_model=List[DataRetentionPolicyResponse])
def list_retention_policies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all data retention policies. Admin or Recruiter only."""
    if current_user.role not in [UserRole.ADMIN, UserRole.RECRUITER]:
        raise HTTPException(
            status_code=403,
            detail="Only admins and recruiters can view retention policies",
        )

    policies = (
        db.query(DataRetentionPolicy)
        .order_by(DataRetentionPolicy.created_at.desc())
        .all()
    )
    return policies


@router.post("/api/gdpr/retention-policies", response_model=DataRetentionPolicyResponse)
def create_retention_policy(
    policy_data: DataRetentionPolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Admin only: Create a new data retention policy."""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(
            status_code=403, detail="Only admins can create retention policies"
        )

    # Check if a policy for this data category already exists
    existing = (
        db.query(DataRetentionPolicy)
        .filter(DataRetentionPolicy.data_category == policy_data.data_category)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"A retention policy for '{policy_data.data_category}' already exists",
        )

    policy = DataRetentionPolicy(
        data_category=policy_data.data_category,
        retention_days=policy_data.retention_days,
        auto_delete=policy_data.auto_delete,
        description=policy_data.description,
        created_by=current_user.id,
    )
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.put(
    "/api/gdpr/retention-policies/{policy_id}",
    response_model=DataRetentionPolicyResponse,
)
def update_retention_policy(
    policy_id: int,
    policy_data: DataRetentionPolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Admin only: Update an existing data retention policy."""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(
            status_code=403, detail="Only admins can update retention policies"
        )

    policy = (
        db.query(DataRetentionPolicy)
        .filter(DataRetentionPolicy.id == policy_id)
        .first()
    )
    if not policy:
        raise HTTPException(status_code=404, detail="Retention policy not found")

    policy.data_category = policy_data.data_category
    policy.retention_days = policy_data.retention_days
    policy.auto_delete = policy_data.auto_delete
    policy.description = policy_data.description
    db.commit()
    db.refresh(policy)
    return policy


@router.post("/api/gdpr/retention/run-cleanup")
def trigger_retention_cleanup(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Admin only: Trigger a manual data retention cleanup."""
    if current_user.role not in [UserRole.ADMIN]:
        raise HTTPException(
            status_code=403, detail="Only admins can trigger retention cleanup"
        )

    result = run_retention_cleanup(db=db)
    return {"message": "Retention cleanup completed", "details": result}
