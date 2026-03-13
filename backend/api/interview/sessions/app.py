"""
Interview Session API Endpoints
Handles interview execution: create session, submit answers, score, recommend.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime
from pydantic import BaseModel as PydanticBase

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from database import get_db
from models import (
    User, Job, JobApplication, InterviewQuestion, InterviewSession,
    InterviewAnswer, InterviewSessionStatus, Recommendation, UserRole,
)
from schemas import (
    InterviewSessionCreate,
    InterviewSessionResponse,
    InterviewSessionListResponse,
    InterviewAnswerSubmit,
    InterviewAnswerResponse,
    InterviewQuestionResponse,
)
from api.auth.jwt_handler import get_current_active_user
from services.answer_scorer import score_answer, score_all_answers_with_ai
from services.recommendation_engine import generate_recommendation
from services.email_service import send_interview_result_notification

router = APIRouter(tags=["Interview Sessions"])


# ─── Helper to build an answer response ────────────────────────────────────────

def _answer_response(a: InterviewAnswer) -> InterviewAnswerResponse:
    q = a.question
    return InterviewAnswerResponse(
        id=a.id,
        session_id=a.session_id,
        question_id=a.question_id,
        answer_text=a.answer_text,
        score=a.score,
        relevance_score=a.relevance_score,
        completeness_score=a.completeness_score,
        accuracy_score=a.accuracy_score,
        clarity_score=a.clarity_score,
        feedback=a.feedback,
        question_text=q.question_text if q else None,
        sample_answer=q.sample_answer if q else None,
        created_at=a.created_at,
    )


def _session_response(s: InterviewSession, include_answers: bool = True) -> InterviewSessionResponse:
    # For recruiter-driven sessions, get name from application
    if hasattr(s, 'application') and s.application:
        candidate_name = s.application.applicant_name
    elif s.candidate:
        candidate_name = s.candidate.full_name or s.candidate.username
    else:
        candidate_name = None

    return InterviewSessionResponse(
        id=s.id,
        job_id=s.job_id,
        candidate_id=s.candidate_id,
        status=s.status.value if hasattr(s.status, "value") else s.status,
        overall_score=s.overall_score,
        recommendation=s.recommendation.value if s.recommendation and hasattr(s.recommendation, "value") else s.recommendation,
        strengths=s.strengths,
        weaknesses=s.weaknesses,
        started_at=s.started_at,
        completed_at=s.completed_at,
        job_title=s.job.title if s.job else None,
        candidate_name=candidate_name,
        answers=[_answer_response(a) for a in s.answers] if include_answers else [],
    )


# ─── GET /api/questions/approved/{job_id} ───────────────────────────────────────

@router.get("/api/questions/approved/{job_id}")
def get_approved_questions(
    job_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Return approved questions for a job (used by Interview page to start).

    For candidates: Returns questions generated specifically for their application.
    For recruiters/admins: Returns all approved questions for the job.
    """
    questions = []

    # For candidates, find their specific questions
    if current_user.role == UserRole.CANDIDATE:
        # Find the candidate's JobApplication for this job
        application = db.query(JobApplication).filter(
            JobApplication.job_id == job_id,
            JobApplication.applicant_email == current_user.email
        ).first()

        if application:
            # Get questions specific to this candidate
            questions = (
                db.query(InterviewQuestion)
                .filter(
                    InterviewQuestion.job_id == job_id,
                    InterviewQuestion.candidate_id == application.id,
                    InterviewQuestion.is_approved == True,
                )
                .all()
            )
            print(f"📝 Found {len(questions)} approved questions for candidate application_id={application.id}")

        # If no candidate-specific questions, try all approved questions for the job
        if not questions:
            print(f"⚠️ No candidate-specific questions found, fetching all approved questions for job")
            questions = (
                db.query(InterviewQuestion)
                .filter(
                    InterviewQuestion.job_id == job_id,
                    InterviewQuestion.is_approved == True,
                )
                .all()
            )
    else:
        # For recruiters/admins, return all approved questions
        questions = (
            db.query(InterviewQuestion)
            .filter(
                InterviewQuestion.job_id == job_id,
                InterviewQuestion.is_approved == True,
            )
            .all()
        )

    return {
        "questions": [
            {
                "id": q.id,
                "question": q.question_text,
                "question_text": q.question_text,
                "sample_answer": q.sample_answer,
                "goldStandard": q.sample_answer,
                "question_type": q.question_type.value if hasattr(q.question_type, "value") else q.question_type,
                "difficulty": q.difficulty.value if hasattr(q.difficulty, "value") else q.difficulty,
                "skill_focus": q.skill_focus,
            }
            for q in questions
        ],
        "total": len(questions),
    }


# ─── POST /api/interview/sessions ──────────────────────────────────────────────

@router.post("/api/interview/sessions", response_model=InterviewSessionResponse)
def create_interview_session(
    body: InterviewSessionCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a new interview session for the current candidate."""
    job = db.query(Job).filter(Job.id == body.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Check approved questions exist
    approved_count = (
        db.query(InterviewQuestion)
        .filter(
            InterviewQuestion.job_id == body.job_id,
            InterviewQuestion.is_approved == True,
        )
        .count()
    )
    if approved_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No approved questions available for this job. Questions must be generated and approved first.",
        )

    # Prevent duplicate active sessions
    existing = (
        db.query(InterviewSession)
        .filter(
            InterviewSession.job_id == body.job_id,
            InterviewSession.candidate_id == current_user.id,
            InterviewSession.status == InterviewSessionStatus.IN_PROGRESS,
        )
        .first()
    )
    if existing:
        return _session_response(existing)

    session = InterviewSession(
        job_id=body.job_id,
        candidate_id=current_user.id,
        status=InterviewSessionStatus.IN_PROGRESS,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_response(session)


# ─── GET /api/interview/sessions/candidate/me ──────────────────────────────────

@router.get("/api/interview/sessions/candidate/me", response_model=List[InterviewSessionListResponse])
def get_my_sessions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all interview sessions for the current candidate."""
    from sqlalchemy import func as sa_func

    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.candidate_id == current_user.id)
        .order_by(InterviewSession.started_at.desc())
        .all()
    )

    if not sessions:
        return []

    # Bulk pre-fetch question counts per job_id
    job_ids = list(set(s.job_id for s in sessions))
    q_counts = (
        db.query(InterviewQuestion.job_id, sa_func.count(InterviewQuestion.id))
        .filter(
            InterviewQuestion.job_id.in_(job_ids),
            InterviewQuestion.is_approved == True,
        )
        .group_by(InterviewQuestion.job_id)
        .all()
    )
    q_count_map = {jid: cnt for jid, cnt in q_counts}

    result = []
    for s in sessions:
        total_q = q_count_map.get(s.job_id, 0)
        answered = len(s.answers)
        result.append(
            InterviewSessionListResponse(
                id=s.id,
                job_id=s.job_id,
                candidate_id=s.candidate_id,
                status=s.status.value if hasattr(s.status, "value") else s.status,
                overall_score=s.overall_score,
                recommendation=s.recommendation.value if s.recommendation and hasattr(s.recommendation, "value") else s.recommendation,
                started_at=s.started_at,
                completed_at=s.completed_at,
                job_title=s.job.title if s.job else None,
                candidate_name=s.candidate.full_name or s.candidate.username if s.candidate else None,
                total_questions=total_q,
                answered_questions=answered,
            )
        )
    return result


# ─── GET /api/interview/sessions/{id} ──────────────────────────────────────────

@router.get("/api/interview/sessions/{session_id}", response_model=InterviewSessionResponse)
def get_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a single interview session with answers."""
    session = db.query(InterviewSession).options(
        joinedload(InterviewSession.job),
        joinedload(InterviewSession.candidate),
        joinedload(InterviewSession.answers).joinedload(InterviewAnswer.question),
    ).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    # Candidates can only see their own; recruiters/admins/experts can see all
    if (
        current_user.role == UserRole.CANDIDATE
        and session.candidate_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    return _session_response(session)


# ─── POST /api/interview/sessions/{id}/answers ─────────────────────────────────

@router.post("/api/interview/sessions/{session_id}/answers", response_model=InterviewAnswerResponse)
def submit_answer(
    session_id: int,
    body: InterviewAnswerSubmit,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Submit an answer for one question in the session."""
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.candidate_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if session.status != InterviewSessionStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Session is not in progress")

    question = db.query(InterviewQuestion).filter(InterviewQuestion.id == body.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Upsert: if an answer already exists for this question, update it
    existing = (
        db.query(InterviewAnswer)
        .filter(
            InterviewAnswer.session_id == session_id,
            InterviewAnswer.question_id == body.question_id,
        )
        .first()
    )
    if existing:
        existing.answer_text = body.answer_text
        db.commit()
        db.refresh(existing)
        return _answer_response(existing)

    answer = InterviewAnswer(
        session_id=session_id,
        question_id=body.question_id,
        answer_text=body.answer_text,
    )
    db.add(answer)
    db.commit()
    db.refresh(answer)
    return _answer_response(answer)


# ─── POST /api/interview/sessions/{id}/complete ────────────────────────────────

@router.post("/api/interview/sessions/{session_id}/complete", response_model=InterviewSessionResponse)
def complete_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Mark a session as completed, score all answers, and generate recommendation."""
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.candidate_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    if session.status != InterviewSessionStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Session is not in progress")

    # Score all answers using Groq AI (with rule-based fallback)
    answers = (
        db.query(InterviewAnswer)
        .filter(InterviewAnswer.session_id == session_id)
        .all()
    )

    # Count total questions for this job to account for unanswered ones
    total_questions = (
        db.query(InterviewQuestion)
        .filter(InterviewQuestion.job_id == session.job_id, InterviewQuestion.is_approved == True)
        .count()
    )

    # Build data for batch AI scoring
    answers_data = []
    valid_answers = []
    for answer in answers:
        question = answer.question
        if not question:
            continue
        answers_data.append({
            "answer_text": answer.answer_text or "",
            "sample_answer": question.sample_answer or "",
            "question_text": question.question_text or "",
        })
        valid_answers.append(answer)

    # Call AI batch scorer (scores all answers + generates recommendation in one call)
    ai_result = score_all_answers_with_ai(answers_data)

    # Apply scores to each answer
    scored_answers = ai_result.get("scored_answers", [])
    for i, answer in enumerate(valid_answers):
        if i < len(scored_answers):
            result = scored_answers[i]
            answer.score = result["score"]
            answer.relevance_score = result["relevance_score"]
            answer.completeness_score = result["completeness_score"]
            answer.accuracy_score = result["accuracy_score"]
            answer.clarity_score = result["clarity_score"]
            answer.feedback = result["feedback"]

    # Recompute overall_score: average over ALL questions (unanswered = 0)
    answered_scores = [s["score"] for s in scored_answers] if scored_answers else []
    total_q = max(total_questions, len(answered_scores))  # at least as many as answered
    score_sum = sum(answered_scores)
    computed_overall = round(score_sum / total_q, 1) if total_q > 0 else 0.0

    session.status = InterviewSessionStatus.SCORED
    session.overall_score = computed_overall
    # Recompute recommendation from actual overall score
    if computed_overall >= 75:
        session.recommendation = Recommendation("select")
    elif computed_overall >= 50:
        session.recommendation = Recommendation("next_round")
    else:
        session.recommendation = Recommendation("reject")
    session.strengths = ai_result["strengths"]
    session.weaknesses = ai_result["weaknesses"]
    session.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(session)

    # Send result email to candidate
    try:
        candidate = session.candidate
        job = session.job
        if candidate and candidate.email:
            rec_value = session.recommendation.value if hasattr(session.recommendation, "value") else str(session.recommendation)
            send_interview_result_notification(
                candidate_email=candidate.email,
                candidate_name=candidate.full_name or candidate.username,
                job_title=job.title if job else "Interview",
                overall_score=session.overall_score,
                recommendation=rec_value,
                strengths=session.strengths or "",
                weaknesses=session.weaknesses or "",
            )
    except Exception as email_err:
        print(f"[complete-session] ⚠️ Failed to send result email: {email_err}")

    return _session_response(session)


# ─── GET /api/interview/sessions/{id}/results ──────────────────────────────────

@router.get("/api/interview/sessions/{session_id}/results", response_model=InterviewSessionResponse)
def get_session_results(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get scored results for a completed session."""
    session = db.query(InterviewSession).options(
        joinedload(InterviewSession.job),
        joinedload(InterviewSession.candidate),
        joinedload(InterviewSession.answers).joinedload(InterviewAnswer.question),
    ).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if (
        current_user.role == UserRole.CANDIDATE
        and session.candidate_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Access denied")
    return _session_response(session)


# ─── GET /api/interviews ───────────────────────────────────────────────────────

@router.get("/api/interviews", response_model=List[InterviewSessionListResponse])
def list_interviews(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    List interview sessions.
    Candidates see their own; recruiters/admins/experts see all.
    """
    from sqlalchemy import func as sa_func

    query = db.query(InterviewSession).options(
        joinedload(InterviewSession.job),
        joinedload(InterviewSession.candidate),
        joinedload(InterviewSession.answers),
    )
    if current_user.role == UserRole.CANDIDATE:
        query = query.filter(InterviewSession.candidate_id == current_user.id)
    sessions = query.order_by(InterviewSession.started_at.desc()).all()

    if not sessions:
        return []

    # Bulk pre-fetch question counts per job_id
    job_ids = list(set(s.job_id for s in sessions))
    q_counts = (
        db.query(InterviewQuestion.job_id, sa_func.count(InterviewQuestion.id))
        .filter(
            InterviewQuestion.job_id.in_(job_ids),
            InterviewQuestion.is_approved == True,
        )
        .group_by(InterviewQuestion.job_id)
        .all()
    )
    q_count_map = {jid: cnt for jid, cnt in q_counts}

    result = []
    for s in sessions:
        total_q = q_count_map.get(s.job_id, 0)
        answered = len(s.answers)
        result.append(
            InterviewSessionListResponse(
                id=s.id,
                job_id=s.job_id,
                candidate_id=s.candidate_id,
                status=s.status.value if hasattr(s.status, "value") else s.status,
                overall_score=s.overall_score,
                recommendation=s.recommendation.value if s.recommendation and hasattr(s.recommendation, "value") else s.recommendation,
                started_at=s.started_at,
                completed_at=s.completed_at,
                job_title=s.job.title if s.job else None,
                candidate_name=s.candidate.full_name or s.candidate.username if s.candidate else None,
                total_questions=total_q,
                answered_questions=answered,
            )
        )
    return result

class HiringDecisionRequest(PydanticBase):
    decision: str  # "hire" or "reject"

@router.post("/api/interview/sessions/{session_id}/hiring-decision")
def update_hiring_decision(
    session_id: int,
    body: HiringDecisionRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update candidate's application status to Hired/Rejected based on interview results."""
    role = current_user.role.value if hasattr(current_user.role, "value") else current_user.role
    if role not in ("recruiter", "admin"):
        raise HTTPException(status_code=403, detail="Only recruiters/admins can make hiring decisions")

    if body.decision not in ("hire", "reject"):
        raise HTTPException(status_code=400, detail="Decision must be 'hire' or 'reject'")

    session = db.query(InterviewSession).options(
        joinedload(InterviewSession.candidate),
    ).filter(InterviewSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    new_status = "Hired" if body.decision == "hire" else "Rejected"

    # Try to update linked application first
    updated = False
    if session.application_id:
        app = db.query(JobApplication).filter(JobApplication.id == session.application_id).first()
        if app:
            app.status = new_status
            updated = True

    # Fallback: find application by candidate email + job_id
    if not updated and session.candidate:
        app = db.query(JobApplication).filter(
            JobApplication.job_id == session.job_id,
            JobApplication.applicant_email == session.candidate.email,
        ).first()
        if app:
            app.status = new_status
            updated = True

    db.commit()

    return {
        "success": True,
        "session_id": session_id,
        "candidate_id": session.candidate_id,
        "decision": body.decision,
        "status": new_status,
        "application_updated": updated,
    }
