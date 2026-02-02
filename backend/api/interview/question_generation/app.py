"""
Question Generation API Endpoints
Handles AI question generation and expert review workflow
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from database import get_db
from models import User, Job, JobApplication, InterviewQuestion, QuestionGenerationSession, UserRole
from schemas import (
    QuestionGenerateRequest, 
    InterviewQuestionResponse, 
    QuestionGenerationSessionResponse,
    ExpertReviewRequest,
    InterviewQuestionUpdate
)
from api.auth.jwt_handler import get_current_active_user
from api.auth.role_manager import RoleManager
from services.ai_question_generator import get_question_generator

router = APIRouter(prefix="/api/interview", tags=["Question Generation"])

@router.post("/generate-questions", response_model=dict)
def generate_questions(
    request: QuestionGenerateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Generate AI questions for a job candidate
    Accessible by: Domain Experts, Recruiters, Admins
    """
    # Check permissions
    if not RoleManager.has_permission(current_user, "create_questions"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to generate questions"
        )
    
    # Validate job and candidate exist
    job = db.query(Job).filter(Job.id == request.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    candidate = db.query(JobApplication).filter(JobApplication.id == request.candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    # Check if questions already generated
    existing_session = db.query(QuestionGenerationSession).filter(
        QuestionGenerationSession.job_id == request.job_id,
        QuestionGenerationSession.candidate_id == request.candidate_id
    ).first()
    
    if existing_session and existing_session.status == "generated":
        return {
            "message": "Questions already generated for this candidate",
            "session_id": existing_session.id,
            "status": "already_exists"
        }
    
    try:
        # Generate questions
        generator = get_question_generator()
        result = generator.generate_questions(
            db=db,
            job_id=request.job_id,
            candidate_id=request.candidate_id,
            total_questions=request.total_questions
        )
        
        return {
            "message": f"Successfully generated {result['total_questions']} questions in {result['mode']} mode",
            "session_id": result["session_id"],
            "mode": result["mode"],
            "total_questions": result["total_questions"],
            "status": "success",
            "preview_mode": result["mode"] == "preview"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate questions: {str(e)}"
        )

@router.get("/sessions/{session_id}", response_model=QuestionGenerationSessionResponse)
def get_generation_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get question generation session with questions
    """
    session = db.query(QuestionGenerationSession).filter(
        QuestionGenerationSession.id == session_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get questions for this session
    questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == session.job_id,
        InterviewQuestion.candidate_id == session.candidate_id
    ).all()
    
    return QuestionGenerationSessionResponse(
        id=session.id,
        job_id=session.job_id,
        candidate_id=session.candidate_id,
        generation_mode=session.generation_mode.value,
        total_questions=session.total_questions,
        approved_questions=session.approved_questions,
        status=session.status,
        expert_review_status=session.expert_review_status,
        generated_at=session.generated_at,
        created_at=session.created_at,
        questions=[
            InterviewQuestionResponse(
                id=q.id,
                question_text=q.question_text,
                sample_answer=q.sample_answer,
                question_type=q.question_type.value,
                difficulty=q.difficulty.value,
                skill_focus=q.skill_focus,
                job_id=q.job_id,
                candidate_id=q.candidate_id,
                generation_mode=q.generation_mode.value,
                is_approved=q.is_approved,
                expert_reviewed=q.expert_reviewed,
                expert_notes=q.expert_notes,
                reviewed_by=q.reviewed_by,
                reviewed_at=q.reviewed_at,
                created_at=q.created_at
            ) for q in questions
        ]
    )

@router.get("/job/{job_id}/candidate/{candidate_id}/questions", response_model=List[InterviewQuestionResponse])
def get_candidate_questions(
    job_id: int,
    candidate_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all questions for a specific job-candidate combination
    """
    questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == job_id,
        InterviewQuestion.candidate_id == candidate_id
    ).all()
    
    return [
        InterviewQuestionResponse(
            id=q.id,
            question_text=q.question_text,
            sample_answer=q.sample_answer,
            question_type=q.question_type.value,
            difficulty=q.difficulty.value,
            skill_focus=q.skill_focus,
            job_id=q.job_id,
            candidate_id=q.candidate_id,
            generation_mode=q.generation_mode.value,
            is_approved=q.is_approved,
            expert_reviewed=q.expert_reviewed,
            expert_notes=q.expert_notes,
            reviewed_by=q.reviewed_by,
            reviewed_at=q.reviewed_at,
            created_at=q.created_at
        ) for q in questions
    ]

@router.put("/questions/{question_id}", response_model=InterviewQuestionResponse)
def update_question(
    question_id: int,
    update_data: InterviewQuestionUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Update a question (for expert review)
    Accessible by: Domain Experts, Admins
    """
    # Check permissions
    if not RoleManager.has_permission(current_user, "review_interviews"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to update questions"
        )
    
    question = db.query(InterviewQuestion).filter(InterviewQuestion.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Update fields
    for field, value in update_data.dict(exclude_unset=True).items():
        setattr(question, field, value)
    
    question.expert_reviewed = True
    question.reviewed_by = current_user.id
    question.reviewed_at = datetime.utcnow()
    
    db.commit()
    db.refresh(question)
    
    return InterviewQuestionResponse(
        id=question.id,
        question_text=question.question_text,
        sample_answer=question.sample_answer,
        question_type=question.question_type.value,
        difficulty=question.difficulty.value,
        skill_focus=question.skill_focus,
        job_id=question.job_id,
        candidate_id=question.candidate_id,
        generation_mode=question.generation_mode.value,
        is_approved=question.is_approved,
        expert_reviewed=question.expert_reviewed,
        expert_notes=question.expert_notes,
        reviewed_by=question.reviewed_by,
        reviewed_at=question.reviewed_at,
        created_at=question.created_at
    )

@router.post("/expert-review")
def expert_review_question(
    review: ExpertReviewRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Expert review and approval of questions
    Accessible by: Domain Experts, Admins
    """
    # Check permissions
    if not RoleManager.has_permission(current_user, "review_interviews"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to review questions"
        )
    
    question = db.query(InterviewQuestion).filter(InterviewQuestion.id == review.question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Update question with review
    question.is_approved = review.is_approved
    question.expert_reviewed = True
    question.expert_notes = review.expert_notes
    question.reviewed_by = current_user.id
    question.reviewed_at = datetime.utcnow()
    
    # Update question text and answer if provided
    if review.updated_question:
        question.question_text = review.updated_question
    if review.updated_answer:
        question.sample_answer = review.updated_answer
    
    db.commit()
    
    # Update session approved count
    session = db.query(QuestionGenerationSession).filter(
        QuestionGenerationSession.job_id == question.job_id,
        QuestionGenerationSession.candidate_id == question.candidate_id
    ).first()
    
    if session:
        approved_count = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == question.job_id,
            InterviewQuestion.candidate_id == question.candidate_id,
            InterviewQuestion.is_approved == True
        ).count()
        
        session.approved_questions = approved_count
        
        # Check if all questions are reviewed
        total_questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == question.job_id,
            InterviewQuestion.candidate_id == question.candidate_id
        ).count()
        
        reviewed_questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == question.job_id,
            InterviewQuestion.candidate_id == question.candidate_id,
            InterviewQuestion.expert_reviewed == True
        ).count()
        
        if reviewed_questions == total_questions:
            session.expert_review_status = "completed"
        else:
            session.expert_review_status = "in_review"
        
        db.commit()
    
    return {
        "message": "Question review completed successfully",
        "question_id": question.id,
        "approved": review.is_approved,
        "reviewer": current_user.username
    }

@router.get("/pending-reviews", response_model=List[QuestionGenerationSessionResponse])
def get_pending_reviews(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all sessions pending expert review
    Accessible by: Domain Experts, Admins
    """
    # Check permissions
    if not RoleManager.has_permission(current_user, "review_interviews"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to view pending reviews"
        )
    
    sessions = db.query(QuestionGenerationSession).filter(
        QuestionGenerationSession.expert_review_status.in_(["pending", "in_review"])
    ).all()
    
    result = []
    for session in sessions:
        questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == session.job_id,
            InterviewQuestion.candidate_id == session.candidate_id
        ).all()
        
        result.append(QuestionGenerationSessionResponse(
            id=session.id,
            job_id=session.job_id,
            candidate_id=session.candidate_id,
            generation_mode=session.generation_mode.value,
            total_questions=session.total_questions,
            approved_questions=session.approved_questions,
            status=session.status,
            expert_review_status=session.expert_review_status,
            generated_at=session.generated_at,
            created_at=session.created_at,
            questions=[
                InterviewQuestionResponse(
                    id=q.id,
                    question_text=q.question_text,
                    sample_answer=q.sample_answer,
                    question_type=q.question_type.value,
                    difficulty=q.difficulty.value,
                    skill_focus=q.skill_focus,
                    job_id=q.job_id,
                    candidate_id=q.candidate_id,
                    generation_mode=q.generation_mode.value,
                    is_approved=q.is_approved,
                    expert_reviewed=q.expert_reviewed,
                    expert_notes=q.expert_notes,
                    reviewed_by=q.reviewed_by,
                    reviewed_at=q.reviewed_at,
                    created_at=q.created_at
                ) for q in questions
            ]
        ))
    
    return result

@router.get("/question-sets", response_model=List[dict])
def get_question_sets(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all question sets for review (simplified endpoint for frontend)
    """
    sessions = db.query(QuestionGenerationSession).all()
    
    result = []
    for session in sessions:
        # Get job and candidate information
        job = db.query(Job).filter(Job.id == session.job_id).first()
        candidate = db.query(JobApplication).filter(JobApplication.id == session.candidate_id).first()
        
        questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == session.job_id,
            InterviewQuestion.candidate_id == session.candidate_id
        ).all()
        
        # Convert to simplified format for frontend
        question_data = []
        for q in questions:
            question_data.append({
                "id": str(q.id),
                "question": q.question_text,
                "sample_answer": q.sample_answer,
                "difficulty": q.difficulty.value,
                "category": q.question_type.value,
                "skills_tested": [q.skill_focus] if q.skill_focus else []
            })
        
        # Determine main topics from questions
        main_topics = list(set([q.skill_focus for q in questions if q.skill_focus]))
        
        result.append({
            "id": str(session.id),
            "job_id": session.job_id,
            "application_id": session.candidate_id,
            "job_title": job.title if job else "Unknown Position",
            "candidate_name": candidate.applicant_name if candidate else "Unknown Candidate",
            "candidate_email": candidate.applicant_email if candidate else "No email provided",
            "questions": question_data,
            "status": session.expert_review_status,
            "generated_at": session.generated_at.isoformat() if session.generated_at else None,
            "mode": session.generation_mode.value,
            "main_topics": main_topics,
            "total_questions": len(questions),
            "experience": f"{candidate.experience_years}+ years" if candidate and candidate.experience_years else "2+ years"
        })
    
    return result
@router.get("/question-sets-test")
def get_question_sets_test(db: Session = Depends(get_db)):
    """
    Test endpoint to get all question sets for review (no auth required)
    """
    sessions = db.query(QuestionGenerationSession).all()
    
    result = []
    for session in sessions:
        # Get job and candidate information
        job = db.query(Job).filter(Job.id == session.job_id).first()
        candidate = db.query(JobApplication).filter(JobApplication.id == session.candidate_id).first()
        
        questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == session.job_id,
            InterviewQuestion.candidate_id == session.candidate_id
        ).all()
        
        # Convert to simplified format for frontend
        question_data = []
        for q in questions:
            question_data.append({
                "id": str(q.id),
                "question": q.question_text,
                "sample_answer": q.sample_answer,
                "difficulty": q.difficulty.value,
                "category": q.question_type.value,
                "skills_tested": [q.skill_focus] if q.skill_focus else []
            })
        
        # Determine main topics from questions
        main_topics = list(set([q.skill_focus for q in questions if q.skill_focus]))
        
        result.append({
            "id": str(session.id),
            "job_id": session.job_id,
            "application_id": session.candidate_id,
            "job_title": job.title if job else "Unknown Position",
            "candidate_name": candidate.applicant_name if candidate else "Unknown Candidate",
            "candidate_email": candidate.applicant_email if candidate else "No email provided",
            "questions": question_data,
            "status": session.expert_review_status,
            "generated_at": session.generated_at.isoformat() if session.generated_at else None,
            "mode": session.generation_mode.value,
            "main_topics": main_topics,
            "total_questions": len(questions),
            "experience": f"{candidate.experience_years}+ years" if candidate and candidate.experience_years else "2+ years"
        })
    
    return result