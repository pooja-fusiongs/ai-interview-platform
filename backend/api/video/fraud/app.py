"""
Fraud Detection API Endpoints.

Provides endpoints for:
- Triggering simulated fraud analysis on a video interview
- Retrieving fraud analysis results
- Dashboard-level statistics
- Listing flagged interviews
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from typing import List, Optional
from datetime import datetime
import json

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from database import get_db
from models import (
    User,
    VideoInterview,
    FraudAnalysis,
    UserRole,
)
from schemas import (
    FraudAnalysisResponse,
    FraudDashboardStats,
    VideoInterviewListResponse,
)
from api.auth.jwt_handler import get_current_active_user, require_any_role
from services.fraud_simulator import run_full_simulated_analysis

router = APIRouter(tags=["Fraud Detection"])


# ---------------------------------------------------------------------------
# POST /api/video/fraud/{video_interview_id}/analyze  -- Trigger analysis
# ---------------------------------------------------------------------------

@router.post(
    "/api/video/fraud/{video_interview_id}/analyze",
    response_model=FraudAnalysisResponse,
)
def trigger_fraud_analysis(
    video_interview_id: int,
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
    db: Session = Depends(get_db),
):
    """
    Trigger a simulated fraud analysis for a video interview.
    Creates a new FraudAnalysis record or updates an existing one.
    Recruiter/Admin only.
    """
    # Verify the video interview exists
    vi = (
        db.query(VideoInterview)
        .filter(VideoInterview.id == video_interview_id)
        .first()
    )
    if not vi:
        raise HTTPException(
            status_code=404, detail="Video interview not found"
        )

    # Run simulated analysis
    results = run_full_simulated_analysis(video_interview_id)

    # Upsert: check for existing record
    existing = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.video_interview_id == video_interview_id)
        .first()
    )

    if existing:
        existing.voice_consistency_score = results["voice_consistency_score"]
        existing.voice_consistency_details = results["voice_consistency_details"]
        existing.lip_sync_score = results["lip_sync_score"]
        existing.lip_sync_details = results["lip_sync_details"]
        existing.body_movement_score = results["body_movement_score"]
        existing.body_movement_details = results["body_movement_details"]
        existing.overall_trust_score = results["overall_trust_score"]
        existing.flags = results["flags"]
        existing.flag_count = results["flag_count"]
        existing.analysis_status = "completed"
        existing.analyzed_at = results["analyzed_at"]
        db.commit()
        db.refresh(existing)
        fraud = existing
    else:
        fraud = FraudAnalysis(
            video_interview_id=video_interview_id,
            voice_consistency_score=results["voice_consistency_score"],
            voice_consistency_details=results["voice_consistency_details"],
            lip_sync_score=results["lip_sync_score"],
            lip_sync_details=results["lip_sync_details"],
            body_movement_score=results["body_movement_score"],
            body_movement_details=results["body_movement_details"],
            overall_trust_score=results["overall_trust_score"],
            flags=results["flags"],
            flag_count=results["flag_count"],
            analysis_status="completed",
            analyzed_at=results["analyzed_at"],
        )
        db.add(fraud)
        db.commit()
        db.refresh(fraud)

    return FraudAnalysisResponse(
        id=fraud.id,
        video_interview_id=fraud.video_interview_id,
        voice_consistency_score=fraud.voice_consistency_score,
        voice_consistency_details=fraud.voice_consistency_details,
        lip_sync_score=fraud.lip_sync_score,
        lip_sync_details=fraud.lip_sync_details,
        body_movement_score=fraud.body_movement_score,
        body_movement_details=fraud.body_movement_details,
        overall_trust_score=fraud.overall_trust_score,
        flags=fraud.flags,
        flag_count=fraud.flag_count,
        analysis_status=fraud.analysis_status,
        consent_granted=fraud.consent_granted,
        analyzed_at=fraud.analyzed_at,
    )


# ---------------------------------------------------------------------------
# GET /api/video/fraud/dashboard  -- Dashboard statistics
# ---------------------------------------------------------------------------

@router.get(
    "/api/video/fraud/dashboard",
    response_model=FraudDashboardStats,
)
def fraud_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Fraud detection dashboard stats: total interviews, analysed count,
    flagged count, average trust score, and severity breakdown.
    """
    total_interviews = db.query(VideoInterview).count()
    analyzed_count = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.analysis_status == "completed")
        .count()
    )
    flagged_count = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.flag_count > 0)
        .count()
    )

    avg_result = (
        db.query(sql_func.avg(FraudAnalysis.overall_trust_score))
        .filter(FraudAnalysis.analysis_status == "completed")
        .scalar()
    )
    average_trust_score = round(float(avg_result), 3) if avg_result else 0.0

    # Build severity breakdown from all completed analyses
    all_analyses = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.analysis_status == "completed")
        .all()
    )
    severity_counts = {"high": 0, "medium": 0, "low": 0}
    for analysis in all_analyses:
        if analysis.flags:
            try:
                flags_list = json.loads(analysis.flags)
                for flag in flags_list:
                    sev = flag.get("severity", "low")
                    if sev in severity_counts:
                        severity_counts[sev] += 1
            except (json.JSONDecodeError, TypeError):
                pass

    return FraudDashboardStats(
        total_interviews=total_interviews,
        analyzed_count=analyzed_count,
        flagged_count=flagged_count,
        average_trust_score=average_trust_score,
        flag_breakdown=severity_counts,
    )


# ---------------------------------------------------------------------------
# GET /api/video/fraud/flagged  -- List flagged interviews
# ---------------------------------------------------------------------------

@router.get("/api/video/fraud/flagged")
def list_flagged_interviews(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    List all fraud analyses with flag_count > 0, joined with
    video interview details for context.
    """
    flagged = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.flag_count > 0)
        .order_by(FraudAnalysis.overall_trust_score.asc())
        .all()
    )

    results = []
    for fa in flagged:
        vi = fa.video_interview
        candidate_name = ""
        job_title = ""
        if vi:
            if vi.candidate:
                candidate_name = (
                    vi.candidate.full_name or vi.candidate.username or ""
                )
            if vi.job:
                job_title = vi.job.title or ""

        results.append({
            "fraud_analysis_id": fa.id,
            "video_interview_id": fa.video_interview_id,
            "candidate_name": candidate_name,
            "job_title": job_title,
            "overall_trust_score": fa.overall_trust_score,
            "flag_count": fa.flag_count,
            "flags": fa.flags,
            "voice_consistency_score": fa.voice_consistency_score,
            "lip_sync_score": fa.lip_sync_score,
            "body_movement_score": fa.body_movement_score,
            "analysis_status": fa.analysis_status,
            "analyzed_at": fa.analyzed_at.isoformat() if fa.analyzed_at else None,
            "scheduled_at": vi.scheduled_at.isoformat() if vi and vi.scheduled_at else None,
            "interview_status": (
                vi.status.value if vi and hasattr(vi.status, "value") else (vi.status if vi else None)
            ),
        })

    return {"flagged_interviews": results, "total": len(results)}


# ---------------------------------------------------------------------------
# GET /api/video/fraud/{video_interview_id}  -- Get analysis for interview
# ---------------------------------------------------------------------------

@router.get(
    "/api/video/fraud/{video_interview_id}",
    response_model=FraudAnalysisResponse,
)
def get_fraud_analysis(
    video_interview_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get fraud analysis results for a specific video interview."""
    fraud = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.video_interview_id == video_interview_id)
        .first()
    )
    if not fraud:
        raise HTTPException(
            status_code=404, detail="Fraud analysis not found for this interview"
        )

    return FraudAnalysisResponse(
        id=fraud.id,
        video_interview_id=fraud.video_interview_id,
        voice_consistency_score=fraud.voice_consistency_score,
        voice_consistency_details=fraud.voice_consistency_details,
        lip_sync_score=fraud.lip_sync_score,
        lip_sync_details=fraud.lip_sync_details,
        body_movement_score=fraud.body_movement_score,
        body_movement_details=fraud.body_movement_details,
        overall_trust_score=fraud.overall_trust_score,
        flags=fraud.flags,
        flag_count=fraud.flag_count,
        analysis_status=fraud.analysis_status,
        consent_granted=fraud.consent_granted,
        analyzed_at=fraud.analyzed_at,
    )
