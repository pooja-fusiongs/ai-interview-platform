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
from services.biometric_analyzer import run_real_analysis
from services.fraud_simulator import run_full_simulated_analysis

router = APIRouter(tags=["Fraud Detection"])


# ---------------------------------------------------------------------------
# POST /api/video/fraud/{video_interview_id}/face-events  -- Live face detection
# ---------------------------------------------------------------------------

from pydantic import BaseModel


class FaceEventPayload(BaseModel):
    total_detections: int = 0
    no_face_count: int = 0
    multiple_face_count: int = 0
    single_face_count: int = 0
    no_face_seconds: float = 0
    multiple_face_seconds: float = 0
    max_faces_detected: int = 0
    detection_interval_ms: int = 750


@router.post("/api/video/fraud/{video_interview_id}/face-events")
def submit_face_events(
    video_interview_id: int,
    payload: FaceEventPayload,
    db: Session = Depends(get_db),
):
    """
    Receive real-time face detection summary from the candidate's browser.
    No auth required — guest candidates call this during interviews.
    Validates by checking the interview exists and is active.
    """
    vi = (
        db.query(VideoInterview)
        .filter(VideoInterview.id == video_interview_id)
        .first()
    )
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Only allow face events for active interviews
    vi_status = vi.status.value if hasattr(vi.status, "value") else vi.status
    if vi_status in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Interview is no longer active")

    # Calculate face detection score (0-1, higher = better/more trustworthy)
    total = payload.total_detections or 1
    single_ratio = payload.single_face_count / total
    no_face_ratio = payload.no_face_count / total
    multi_face_ratio = payload.multiple_face_count / total

    # Score: penalize no_face and multiple_faces heavily
    face_score = max(0.0, min(1.0, single_ratio - (no_face_ratio * 0.5) - (multi_face_ratio * 1.0)))

    details = json.dumps({
        "total_detections": payload.total_detections,
        "single_face_count": payload.single_face_count,
        "no_face_count": payload.no_face_count,
        "multiple_face_count": payload.multiple_face_count,
        "single_face_pct": round(single_ratio * 100, 1),
        "no_face_pct": round(no_face_ratio * 100, 1),
        "multiple_face_pct": round(multi_face_ratio * 100, 1),
        "no_face_seconds": round(payload.no_face_seconds, 1),
        "multiple_face_seconds": round(payload.multiple_face_seconds, 1),
        "max_faces_detected": payload.max_faces_detected,
    })

    # Build face detection flags based on absolute counts (not just ratios)
    # Flags should persist once triggered — use both ratio and absolute thresholds
    face_flags = []
    if no_face_ratio > 0.2 or payload.no_face_seconds > 15:
        face_flags.append({
            "flag_type": "face_not_visible",
            "severity": "high" if no_face_ratio > 0.5 or payload.no_face_seconds > 60 else "medium",
            "description": f"Face not visible {round(no_face_ratio * 100)}% of interview ({round(payload.no_face_seconds)}s)",
            "confidence": round(no_face_ratio, 2),
            "timestamp_seconds": 0,
        })
    if payload.multiple_face_count > 0:
        face_flags.append({
            "flag_type": "multiple_faces",
            "severity": "high" if payload.multiple_face_count > 10 or multi_face_ratio > 0.1 else "medium",
            "description": f"Multiple faces detected {payload.multiple_face_count} times (max {payload.max_faces_detected} faces)",
            "confidence": round(multi_face_ratio, 2),
            "timestamp_seconds": 0,
        })

    # Upsert FraudAnalysis
    existing = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.video_interview_id == video_interview_id)
        .first()
    )

    now = datetime.utcnow()

    if existing:
        # Keep the WORST (lowest) face detection score — don't let good periods erase bad ones
        if existing.face_detection_score is not None:
            existing.face_detection_score = round(min(face_score, existing.face_detection_score), 3)
        else:
            existing.face_detection_score = round(face_score, 3)
        existing.face_detection_details = details
        # Merge flags: keep existing non-face flags, and keep the WORST face flags
        existing_flags = []
        old_face_flags = []
        if existing.flags:
            try:
                parsed = json.loads(existing.flags)
                existing_flags = [f for f in parsed if f.get("flag_type") not in ("face_not_visible", "multiple_faces")]
                old_face_flags = [f for f in parsed if f.get("flag_type") in ("face_not_visible", "multiple_faces")]
            except (json.JSONDecodeError, TypeError):
                existing_flags = []
        # For each face flag type, keep whichever has higher severity/confidence
        merged_face_flags = {}
        for f in old_face_flags + face_flags:
            ft = f["flag_type"]
            if ft not in merged_face_flags:
                merged_face_flags[ft] = f
            else:
                # Keep the one with higher severity, or higher confidence if same severity
                sev_order = {"high": 3, "medium": 2, "low": 1}
                old_sev = sev_order.get(merged_face_flags[ft].get("severity", "low"), 0)
                new_sev = sev_order.get(f.get("severity", "low"), 0)
                if new_sev > old_sev or (new_sev == old_sev and f.get("confidence", 0) > merged_face_flags[ft].get("confidence", 0)):
                    merged_face_flags[ft] = f
        all_flags = existing_flags + list(merged_face_flags.values())
        existing.flags = json.dumps(all_flags)
        existing.flag_count = len(all_flags)
        # Recalculate overall trust score using the stored (worst) face detection score
        scores = [s for s in [
            existing.voice_consistency_score,
            existing.lip_sync_score,
            existing.body_movement_score,
            existing.face_detection_score,
        ] if s is not None]
        if scores:
            existing.overall_trust_score = round(sum(scores) / len(scores), 3)
        if existing.analysis_status == "pending":
            existing.analysis_status = "completed"
            existing.analyzed_at = now
        db.commit()
        db.refresh(existing)
        return {"status": "updated", "face_detection_score": round(face_score, 3), "flags": len(face_flags)}
    else:
        fraud = FraudAnalysis(
            video_interview_id=video_interview_id,
            face_detection_score=round(face_score, 3),
            face_detection_details=details,
            overall_trust_score=round(face_score, 3),
            flags=json.dumps(face_flags),
            flag_count=len(face_flags),
            analysis_status="completed",
            analyzed_at=now,
        )
        db.add(fraud)
        db.commit()
        db.refresh(fraud)
        return {"status": "created", "face_detection_score": round(face_score, 3), "flags": len(face_flags)}


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

    # Resolve recording file path and run real analysis (falls back to simulator)
    recording_path = None
    if vi.recording_url:
        base_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..")
        recording_path = os.path.join(base_dir, vi.recording_url.lstrip("/"))
        recording_path = os.path.normpath(recording_path)
    results = run_real_analysis(video_interview_id, recording_path)

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

        # Merge flags: keep existing face detection flags, add new analysis flags
        new_flags = []
        try:
            new_flags = json.loads(results["flags"]) if results["flags"] else []
        except (json.JSONDecodeError, TypeError):
            new_flags = []
        existing_face_flags = []
        if existing.flags:
            try:
                existing_face_flags = [
                    f for f in json.loads(existing.flags)
                    if f.get("flag_type") in ("face_not_visible", "multiple_faces")
                ]
            except (json.JSONDecodeError, TypeError):
                existing_face_flags = []
        all_flags = new_flags + existing_face_flags
        existing.flags = json.dumps(all_flags)
        existing.flag_count = len(all_flags)

        # Recalculate overall trust score including face detection if available
        scores = [s for s in [
            results["voice_consistency_score"],
            results["lip_sync_score"],
            results["body_movement_score"],
            existing.face_detection_score,
        ] if s is not None]
        existing.overall_trust_score = round(sum(scores) / len(scores), 3) if scores else results["overall_trust_score"]

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
        face_detection_score=fraud.face_detection_score,
        face_detection_details=fraud.face_detection_details,
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
    Auto-analyzes completed interviews that haven't been analyzed yet.
    """
    # Auto-analyze completed interviews with recordings but no analysis
    unanalyzed = (
        db.query(VideoInterview)
        .filter(
            VideoInterview.status == "completed",
            VideoInterview.recording_url.isnot(None),
            ~VideoInterview.id.in_(
                db.query(FraudAnalysis.video_interview_id)
            ),
        )
        .all()
    )
    for vi in unanalyzed:
        try:
            base_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..")
            recording_path = os.path.join(base_dir, vi.recording_url.lstrip("/"))
            recording_path = os.path.normpath(recording_path)
            results = run_real_analysis(vi.id, recording_path)
            fraud = FraudAnalysis(
                video_interview_id=vi.id,
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
        except Exception as e:
            db.rollback()
            print(f"[FraudDashboard] Auto-analysis failed for VI {vi.id}: {e}")

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
    cleared_count = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.analysis_status == "completed")
        .filter(FraudAnalysis.flag_count == 0)
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
        cleared_count=cleared_count,
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
# GET /api/video/fraud/all  -- All analyses for live monitor
# ---------------------------------------------------------------------------

@router.get("/api/video/fraud/all")
def list_all_analyses(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """All completed fraud analyses with interview context."""
    analyses = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.analysis_status == "completed")
        .order_by(FraudAnalysis.analyzed_at.desc())
        .all()
    )
    results = []
    for fa in analyses:
        vi = fa.video_interview
        candidate_name = ""
        job_title = ""
        if vi:
            if vi.candidate:
                candidate_name = vi.candidate.full_name or vi.candidate.username or ""
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
            "face_detection_score": fa.face_detection_score,
            "face_detection_details": fa.face_detection_details,
            "analysis_status": fa.analysis_status,
            "analyzed_at": fa.analyzed_at.isoformat() if fa.analyzed_at else None,
        })
    return {"analyses": results, "total": len(results)}


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
        face_detection_score=fraud.face_detection_score,
        face_detection_details=fraud.face_detection_details,
        overall_trust_score=fraud.overall_trust_score,
        flags=fraud.flags,
        flag_count=fraud.flag_count,
        analysis_status=fraud.analysis_status,
        consent_granted=fraud.consent_granted,
        analyzed_at=fraud.analyzed_at,
    )
