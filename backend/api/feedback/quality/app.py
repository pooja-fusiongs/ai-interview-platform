from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from api.auth.jwt_handler import get_current_active_user, require_any_role, require_role
from models import User, UserRole, QualityMetric
from schemas import QualityDashboardResponse, QualityMetricResponse
from services.quality_metrics_service import (
    get_dashboard_data,
    compute_all_metrics,
    compute_score_correlation,
)

router = APIRouter(tags=["Quality Metrics"])


# ------------------------------------------------------------------
# GET  /api/feedback/quality/dashboard  -  Dashboard overview
# ------------------------------------------------------------------
@router.get(
    "/api/feedback/quality/dashboard",
    response_model=QualityDashboardResponse,
)
def quality_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
):
    """Get the quality-metrics dashboard data."""
    return get_dashboard_data(db)


# ------------------------------------------------------------------
# POST  /api/feedback/quality/compute  -  Trigger metric computation
# ------------------------------------------------------------------
@router.post("/api/feedback/quality/compute")
def trigger_quality_computation(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role([UserRole.RECRUITER, UserRole.ADMIN])),
):
    """Trigger a full recomputation of all quality metrics. Admin only."""
    metrics = compute_all_metrics(db)
    return {
        "detail": "Quality metrics computed successfully",
        "metrics_computed": len(metrics),
    }


# ------------------------------------------------------------------
# GET  /api/feedback/quality/metrics  -  List stored metrics
# ------------------------------------------------------------------
@router.get(
    "/api/feedback/quality/metrics",
    response_model=List[QualityMetricResponse],
)
def list_quality_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
):
    """List all computed quality-metric records, newest first."""
    metrics = (
        db.query(QualityMetric)
        .order_by(QualityMetric.computed_at.desc())
        .all()
    )
    return metrics


# ------------------------------------------------------------------
# GET  /api/feedback/quality/correlation  -  Score correlation
# ------------------------------------------------------------------
@router.get("/api/feedback/quality/correlation")
def quality_correlation(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
):
    """Get the Pearson correlation between interview scores and post-hire performance."""
    return compute_score_correlation(db)