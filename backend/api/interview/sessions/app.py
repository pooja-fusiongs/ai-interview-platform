"""
Interview Session API Endpoints
Handles interview execution: create session, submit answers, score, recommend.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

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
from services.answer_scorer import score_answer
from services.recommendation_engine import generate_recommendation

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
    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.candidate_id == current_user.id)
        .order_by(InterviewSession.started_at.desc())
        .all()
    )
    result = []
    for s in sessions:
        total_q = (
            db.query(InterviewQuestion)
            .filter(
                InterviewQuestion.job_id == s.job_id,
                InterviewQuestion.is_approved == True,
            )
            .count()
        )
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
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
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

    # Score each answer
    answers = (
        db.query(InterviewAnswer)
        .filter(InterviewAnswer.session_id == session_id)
        .all()
    )
    scored_list = []
    for answer in answers:
        question = answer.question
        if not question:
            continue
        result = score_answer(
            answer_text=answer.answer_text,
            sample_answer=question.sample_answer,
            question_text=question.question_text,
        )
        answer.score = result["score"]
        answer.relevance_score = result["relevance_score"]
        answer.completeness_score = result["completeness_score"]
        answer.accuracy_score = result["accuracy_score"]
        answer.clarity_score = result["clarity_score"]
        answer.feedback = result["feedback"]
        scored_list.append(result)

    # Generate recommendation
    rec = generate_recommendation(scored_list)

    session.status = InterviewSessionStatus.SCORED
    session.overall_score = rec["overall_score"]
    session.recommendation = Recommendation(rec["recommendation"])
    session.strengths = rec["strengths"]
    session.weaknesses = rec["weaknesses"]
    session.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(session)
    return _session_response(session)


# ─── GET /api/interview/sessions/{id}/results ──────────────────────────────────

@router.get("/api/interview/sessions/{session_id}/results", response_model=InterviewSessionResponse)
def get_session_results(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get scored results for a completed session."""
    session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
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
    query = db.query(InterviewSession)
    if current_user.role == UserRole.CANDIDATE:
        query = query.filter(InterviewSession.candidate_id == current_user.id)
    sessions = query.order_by(InterviewSession.started_at.desc()).all()

    result = []
    for s in sessions:
        total_q = (
            db.query(InterviewQuestion)
            .filter(
                InterviewQuestion.job_id == s.job_id,
                InterviewQuestion.is_approved == True,
            )
            .count()
        )
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
