from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from api.auth.jwt_handler import get_current_active_user, require_any_role, require_role
from models import User, UserRole, PostHireFeedback, Job, InterviewSession
from schemas import PostHireFeedbackCreate, PostHireFeedbackResponse, PostHireFeedbackUpdate
from services.audit_service import log_action

router = APIRouter(tags=["Post-Hire Feedback"])


def _enrich_feedback(fb: PostHireFeedback, db: Session) -> dict:
    """Attach candidate_name, job_title, and submitter_name to a feedback row."""
    candidate = db.query(User).filter(User.id == fb.candidate_id).first()
    job = db.query(Job).filter(Job.id == fb.job_id).first()
    submitter = db.query(User).filter(User.id == fb.submitted_by).first()

    data = {c.name: getattr(fb, c.name) for c in fb.__table__.columns}
    data["candidate_name"] = (candidate.full_name or candidate.username) if candidate else None
    data["job_title"] = job.title if job else None
    data["submitter_name"] = (submitter.full_name or submitter.username) if submitter else None
    return data


# ------------------------------------------------------------------
# POST  /api/feedback/post-hire  -  Submit feedback
# ------------------------------------------------------------------
@router.post("/api/feedback/post-hire", response_model=PostHireFeedbackResponse)
def submit_post_hire_feedback(
    payload: PostHireFeedbackCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
):
    """Submit post-hire performance feedback for a candidate."""
    # Validate that the candidate exists
    candidate = db.query(User).filter(User.id == payload.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Validate that the job exists
    job = db.query(Job).filter(Job.id == payload.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Validate session if provided
    if payload.session_id is not None:
        session = db.query(InterviewSession).filter(
            InterviewSession.id == payload.session_id
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Interview session not found")

    feedback = PostHireFeedback(
        candidate_id=payload.candidate_id,
        job_id=payload.job_id,
        session_id=payload.session_id,
        submitted_by=current_user.id,
        hire_date=payload.hire_date,
        overall_performance_score=payload.overall_performance_score,
        technical_competence_score=payload.technical_competence_score,
        cultural_fit_score=payload.cultural_fit_score,
        communication_score=payload.communication_score,
        initiative_score=payload.initiative_score,
        strengths_observed=payload.strengths_observed,
        areas_for_improvement=payload.areas_for_improvement,
        comments=payload.comments,
        still_employed=payload.still_employed,
        left_reason=payload.left_reason,
        would_rehire=payload.would_rehire,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    ip_address = request.client.host if request.client else None
    log_action(
        db=db,
        user_id=current_user.id,
        action="post_hire_feedback_submitted",
        resource_type="post_hire_feedback",
        resource_id=feedback.id,
        details=f"Feedback submitted for candidate {payload.candidate_id} on job {payload.job_id}",
        ip_address=ip_address,
    )

    return _enrich_feedback(feedback, db)


# ------------------------------------------------------------------
# GET  /api/feedback/post-hire  -  List all feedback
# ------------------------------------------------------------------
@router.get("/api/feedback/post-hire", response_model=List[PostHireFeedbackResponse])
def list_post_hire_feedback(
    job_id: Optional[int] = None,
    candidate_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
):
    """List all post-hire feedback records with optional filters."""
    query = db.query(PostHireFeedback)
    if job_id is not None:
        query = query.filter(PostHireFeedback.job_id == job_id)
    if candidate_id is not None:
        query = query.filter(PostHireFeedback.candidate_id == candidate_id)

    feedbacks = query.order_by(PostHireFeedback.created_at.desc()).all()
    return [_enrich_feedback(fb, db) for fb in feedbacks]


# ------------------------------------------------------------------
# GET  /api/feedback/post-hire/{feedback_id}  -  Get one
# ------------------------------------------------------------------
@router.get(
    "/api/feedback/post-hire/{feedback_id}",
    response_model=PostHireFeedbackResponse,
)
def get_post_hire_feedback(
    feedback_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
):
    """Get a single post-hire feedback record by ID."""
    feedback = (
        db.query(PostHireFeedback)
        .filter(PostHireFeedback.id == feedback_id)
        .first()
    )
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    return _enrich_feedback(feedback, db)


# ------------------------------------------------------------------
# PUT  /api/feedback/post-hire/{feedback_id}  -  Update
# ------------------------------------------------------------------
@router.put(
    "/api/feedback/post-hire/{feedback_id}",
    response_model=PostHireFeedbackResponse,
)
def update_post_hire_feedback(
    feedback_id: int,
    payload: PostHireFeedbackUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
):
    """Update an existing post-hire feedback record. Only non-None fields are applied."""
    feedback = (
        db.query(PostHireFeedback)
        .filter(PostHireFeedback.id == feedback_id)
        .first()
    )
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(feedback, field, value)

    db.commit()
    db.refresh(feedback)

    ip_address = request.client.host if request.client else None
    log_action(
        db=db,
        user_id=current_user.id,
        action="post_hire_feedback_updated",
        resource_type="post_hire_feedback",
        resource_id=feedback.id,
        details=f"Feedback {feedback_id} updated. Fields: {list(update_data.keys())}",
        ip_address=ip_address,
    )

    return _enrich_feedback(feedback, db)


# ------------------------------------------------------------------
# DELETE  /api/feedback/post-hire/{feedback_id}  -  Admin only
# ------------------------------------------------------------------
@router.delete("/api/feedback/post-hire/{feedback_id}")
def delete_post_hire_feedback(
    feedback_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Delete a post-hire feedback record. Admin only."""
    feedback = (
        db.query(PostHireFeedback)
        .filter(PostHireFeedback.id == feedback_id)
        .first()
    )
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    db.delete(feedback)
    db.commit()

    ip_address = request.client.host if request.client else None
    log_action(
        db=db,
        user_id=current_user.id,
        action="post_hire_feedback_deleted",
        resource_type="post_hire_feedback",
        resource_id=feedback_id,
        details=f"Feedback {feedback_id} permanently deleted",
        ip_address=ip_address,
    )

    return {"detail": f"Feedback {feedback_id} deleted successfully"}


# ------------------------------------------------------------------
# GET  /api/feedback/post-hire/candidate/{candidate_id}
# ------------------------------------------------------------------
@router.get(
    "/api/feedback/post-hire/candidate/{candidate_id}",
    response_model=List[PostHireFeedbackResponse],
)
def get_feedback_by_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
):
    """Get all post-hire feedback records for a specific candidate."""
    feedbacks = (
        db.query(PostHireFeedback)
        .filter(PostHireFeedback.candidate_id == candidate_id)
        .order_by(PostHireFeedback.created_at.desc())
        .all()
    )
    return [_enrich_feedback(fb, db) for fb in feedbacks]


# ------------------------------------------------------------------
# GET  /api/feedback/post-hire/job/{job_id}
# ------------------------------------------------------------------
@router.get(
    "/api/feedback/post-hire/job/{job_id}",
    response_model=List[PostHireFeedbackResponse],
)
def get_feedback_by_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
):
    """Get all post-hire feedback records for a specific job."""
    feedbacks = (
        db.query(PostHireFeedback)
        .filter(PostHireFeedback.job_id == job_id)
        .order_by(PostHireFeedback.created_at.desc())
        .all()
    )
    return [_enrich_feedback(fb, db) for fb in feedbacks]
