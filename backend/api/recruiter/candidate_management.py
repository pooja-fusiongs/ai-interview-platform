"""
Recruiter Candidate Management API
Handles the recruiter-driven interview flow:
  Add candidate → Generate questions → Upload transcript → LLM score
"""

import os
import uuid
import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db
from models import (
    User, UserRole, Job, JobApplication, CandidateResume,
    InterviewQuestion, QuestionGenerationSession,
    InterviewSession, InterviewSessionStatus, InterviewAnswer, Recommendation
)
from schemas import TranscriptSubmit, RecruiterCandidateResponse
from api.auth.jwt_handler import get_current_active_user

router = APIRouter(tags=["Recruiter Flow"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "resumes")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _require_recruiter(user: User):
    """Ensure user is recruiter or admin."""
    if user.role not in (UserRole.RECRUITER, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Recruiter or admin access required")


from services.resume_parser import parse_resume as _parse_resume_full


# ─────────────────────────────────────────────
# POST /api/recruiter/job/{job_id}/add-candidate
# ─────────────────────────────────────────────
@router.post("/api/recruiter/job/{job_id}/add-candidate")
async def add_candidate_to_job(
    job_id: int,
    name: str = Form(...),
    email: str = Form(...),
    phone: str = Form(""),
    experience_years: int = Form(0),
    current_position: str = Form(""),
    resume: UploadFile = File(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Add a candidate under a job (recruiter uploads their resume)."""
    _require_recruiter(current_user)

    job = db.query(Job).filter(Job.id == job_id, Job.is_active == True).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Check duplicate
    existing = db.query(JobApplication).filter(
        JobApplication.job_id == job_id,
        JobApplication.applicant_email == email
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Candidate with this email already added to this job")

    # Create application record
    from services.encryption_service import encrypt_pii
    application = JobApplication(
        job_id=job_id,
        applicant_name=name,
        applicant_email=email,
        applicant_phone=encrypt_pii(phone) if phone else phone,
        experience_years=experience_years,
        current_position=current_position,
        status="Added by Recruiter"
    )
    db.add(application)
    db.flush()  # get application.id

    resume_info = None
    if resume and resume.filename:
        # Save file
        ext = resume.filename.rsplit(".", 1)[-1] if "." in resume.filename else "pdf"
        unique_name = f"{application.id}_{uuid.uuid4().hex[:8]}.{ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_name)

        content = await resume.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Parse resume: extract text, skills, experience level
        job_skills_list = []
        if job.skills_required:
            try:
                job_skills_list = json.loads(job.skills_required) if isinstance(job.skills_required, str) else job.skills_required
            except Exception:
                pass

        parse_result = _parse_resume_full(file_path, resume.filename, job_skills_list, experience_years)
        parsed_text = parse_result["parsed_text"]
        parsed_skills = parse_result["skills"]

        candidate_resume = CandidateResume(
            candidate_id=application.id,
            job_id=job_id,
            resume_path=file_path,
            original_filename=resume.filename,
            file_size=len(content),
            parsed_text=parsed_text,
            skills=json.dumps(parsed_skills),
            experience_years=experience_years,
            experience_level=parse_result["experience_level"],
            parsing_status=parse_result["parsing_status"]
        )
        db.add(candidate_resume)
        resume_info = {
            "resume_id": None,  # will be set after commit
            "parsed_text_length": len(parsed_text),
            "parsed_skills": parsed_skills
        }

    db.commit()
    db.refresh(application)

    return {
        "id": application.id,
        "applicant_name": application.applicant_name,
        "applicant_email": application.applicant_email,
        "status": application.status,
        "resume_uploaded": resume_info is not None,
        "resume_info": resume_info
    }


# ─────────────────────────────────────────────
# GET /api/recruiter/job/{job_id}/candidates
# ─────────────────────────────────────────────
@router.get("/api/recruiter/job/{job_id}/candidates", response_model=List[RecruiterCandidateResponse])
def get_job_candidates(
    job_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all candidates added under a job with their pipeline status."""
    _require_recruiter(current_user)

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    applications = db.query(JobApplication).filter(
        JobApplication.job_id == job_id
    ).order_by(JobApplication.applied_at.desc()).all()

    if not applications:
        return []

    app_ids = [app.id for app in applications]

    # --- BULK PRE-FETCH all related data (avoid N+1 queries) ---

    # 1. All resumes for this job's candidates
    all_resumes = db.query(CandidateResume).filter(
        CandidateResume.candidate_id.in_(app_ids),
        CandidateResume.job_id == job_id
    ).all()
    resume_map = {r.candidate_id: r for r in all_resumes}

    # 2. All question generation sessions for this job
    all_q_sessions = db.query(QuestionGenerationSession).filter(
        QuestionGenerationSession.job_id == job_id,
        QuestionGenerationSession.candidate_id.in_(app_ids)
    ).all()
    q_session_map = {qs.candidate_id: qs for qs in all_q_sessions}

    # 3. Question counts per candidate (single query with GROUP BY)
    from sqlalchemy import func
    q_counts = db.query(
        InterviewQuestion.candidate_id,
        func.count(InterviewQuestion.id)
    ).filter(
        InterviewQuestion.job_id == job_id,
        InterviewQuestion.candidate_id.in_(app_ids)
    ).group_by(InterviewQuestion.candidate_id).all()
    q_count_map = {cid: cnt for cid, cnt in q_counts}

    # 4. All interview sessions for these candidates
    all_interviews = db.query(InterviewSession).filter(
        InterviewSession.application_id.in_(app_ids),
        InterviewSession.interview_mode == "recruiter_driven"
    ).all()
    interview_map = {iv.application_id: iv for iv in all_interviews}

    # --- Build response using pre-fetched data ---
    result = []
    for app in applications:
        # Resume status
        resume = resume_map.get(app.id)
        has_resume = resume is not None
        resume_parsed = has_resume and resume.parsing_status == "completed"
        parsed_skills = []
        if resume and resume.skills:
            try:
                parsed_skills = json.loads(resume.skills) if isinstance(resume.skills, str) else resume.skills
            except Exception:
                pass

        # Question generation status
        q_session = q_session_map.get(app.id)
        actual_questions_count = q_count_map.get(app.id, 0)

        has_questions = actual_questions_count > 0
        questions_status = "none"
        question_session_id = None
        if q_session and has_questions:
            question_session_id = q_session.id
            if q_session.expert_review_status == "completed":
                questions_status = "approved"
            elif q_session.status in ("generated", "reviewed"):
                questions_status = "generated"
            else:
                questions_status = "pending"
        elif q_session and not has_questions:
            questions_status = "failed"

        # Interview/transcript/scoring status
        interview = interview_map.get(app.id)
        has_transcript = interview is not None and interview.transcript_text is not None
        has_scores = interview is not None and interview.status == InterviewSessionStatus.SCORED
        overall_score = interview.overall_score if has_scores else None
        recommendation = interview.recommendation.value if has_scores and interview.recommendation else None
        session_id = interview.id if interview else None

        from services.encryption_service import safe_decrypt
        result.append(RecruiterCandidateResponse(
            id=app.id,
            applicant_name=app.applicant_name,
            applicant_email=app.applicant_email,
            applicant_phone=safe_decrypt(app.applicant_phone) if app.applicant_phone else app.applicant_phone,
            experience_years=app.experience_years,
            current_position=app.current_position,
            status=app.status,
            applied_at=app.applied_at,
            has_resume=has_resume,
            resume_parsed=resume_parsed,
            parsed_skills=parsed_skills,
            has_questions=has_questions,
            questions_status=questions_status,
            question_session_id=question_session_id,
            has_transcript=has_transcript,
            has_scores=has_scores,
            overall_score=overall_score,
            recommendation=recommendation,
            session_id=session_id
        ))

    return result


# ─────────────────────────────────────────────
# POST /api/recruiter/job/{job_id}/candidate/{application_id}/transcript
# ─────────────────────────────────────────────
@router.post("/api/recruiter/job/{job_id}/candidate/{application_id}/transcript")
def submit_transcript_and_score(
    job_id: int,
    application_id: int,
    body: TranscriptSubmit,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Upload interview transcript and score it using LLM."""
    _require_recruiter(current_user)

    # Validate application
    application = db.query(JobApplication).filter(
        JobApplication.id == application_id,
        JobApplication.job_id == job_id
    ).first()
    if not application:
        raise HTTPException(status_code=404, detail="Candidate not found for this job")

    # Get approved questions
    approved_questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == job_id,
        InterviewQuestion.candidate_id == application_id,
        InterviewQuestion.is_approved == True
    ).all()

    if not approved_questions:
        raise HTTPException(status_code=400, detail="No approved questions found. Generate and approve questions first.")

    # Check for existing scored session
    existing = db.query(InterviewSession).filter(
        InterviewSession.application_id == application_id,
        InterviewSession.interview_mode == "recruiter_driven"
    ).first()
    if existing and existing.status == InterviewSessionStatus.SCORED:
        raise HTTPException(status_code=400, detail="Transcript already scored for this candidate. View results instead.")

    # Create or reuse session
    if existing:
        session = existing
    else:
        session = InterviewSession(
            job_id=job_id,
            candidate_id=current_user.id,  # recruiter's user ID
            application_id=application_id,
            status=InterviewSessionStatus.IN_PROGRESS,
            interview_mode="recruiter_driven"
        )
        db.add(session)
        db.flush()

    session.transcript_text = body.transcript_text

    # Prepare questions for LLM scoring
    questions_for_scoring = [
        {
            "question_id": q.id,
            "question_text": q.question_text,
            "sample_answer": q.sample_answer or ""
        }
        for q in approved_questions
    ]

    # Score with Groq (primary - free, fast), Gemini (fallback)
    llm_result = None
    try:
        from services.groq_service import score_transcript_with_groq
        import config
        if config.GROQ_API_KEY:
            llm_result = score_transcript_with_groq(body.transcript_text, questions_for_scoring)
    except Exception as e:
        print(f"[WARN] Groq scoring failed: {e}")

    if not llm_result:
        try:
            from services.gemini_service import score_transcript_with_gemini
            llm_result = score_transcript_with_gemini(body.transcript_text, questions_for_scoring)
        except Exception as e:
            print(f"[WARN] Gemini scoring also failed: {e}")

    if llm_result:
        # Save per-question scores
        q_id_map = {q.id: q for q in approved_questions}
        for pq in llm_result.get("per_question", []):
            q_id = pq.get("question_id")
            if q_id not in q_id_map:
                continue

            # Upsert answer
            existing_answer = db.query(InterviewAnswer).filter(
                InterviewAnswer.session_id == session.id,
                InterviewAnswer.question_id == q_id
            ).first()

            if existing_answer:
                answer = existing_answer
            else:
                answer = InterviewAnswer(session_id=session.id, question_id=q_id)
                db.add(answer)

            answer.answer_text = pq.get("extracted_answer", "")
            answer.score = float(pq.get("score", 0))
            answer.relevance_score = float(pq.get("relevance_score", 0))
            answer.completeness_score = float(pq.get("completeness_score", 0))
            answer.accuracy_score = float(pq.get("accuracy_score", 0))
            answer.clarity_score = float(pq.get("clarity_score", 0))
            answer.feedback = pq.get("feedback", "")

        session.overall_score = float(llm_result.get("overall_score", 0))
        rec_str = llm_result.get("recommendation", "reject")
        session.recommendation = Recommendation(rec_str) if rec_str in ("select", "next_round", "reject") else Recommendation.REJECT
        session.strengths = llm_result.get("strengths", "")
        session.weaknesses = llm_result.get("weaknesses", "")
        session.status = InterviewSessionStatus.SCORED
        session.completed_at = datetime.utcnow()
    else:
        # Fallback: use rule-based scoring
        from services.answer_scorer import score_answer
        from services.recommendation_engine import generate_recommendation

        scores_list = []
        for q in approved_questions:
            # Without transcript parsing, give a generic score
            existing_answer = db.query(InterviewAnswer).filter(
                InterviewAnswer.session_id == session.id,
                InterviewAnswer.question_id == q.id
            ).first()
            if not existing_answer:
                answer = InterviewAnswer(
                    session_id=session.id,
                    question_id=q.id,
                    answer_text=body.transcript_text[:500]  # use transcript excerpt
                )
                db.add(answer)
            else:
                answer = existing_answer
                answer.answer_text = body.transcript_text[:500]

            scored = score_answer(answer.answer_text, q.sample_answer or "", q.question_text)
            answer.score = scored["score"]
            answer.relevance_score = scored["relevance_score"]
            answer.completeness_score = scored["completeness_score"]
            answer.accuracy_score = scored["accuracy_score"]
            answer.clarity_score = scored["clarity_score"]
            answer.feedback = scored["feedback"]
            scores_list.append(scored)

        rec = generate_recommendation(scores_list)
        session.overall_score = rec["overall_score"]
        session.recommendation = Recommendation(rec["recommendation"])
        session.strengths = rec["strengths"]
        session.weaknesses = rec["weaknesses"]
        session.status = InterviewSessionStatus.SCORED
        session.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(session)
    
    # Update nested transcript data in candidate object
    _update_candidate_nested_transcripts(db, application_id, job_id)

    # Build response - pre-fetch all questions in one query
    answer_question_ids = [a.question_id for a in session.answers]
    all_answer_questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.id.in_(answer_question_ids)
    ).all() if answer_question_ids else []
    answer_q_map = {q.id: q for q in all_answer_questions}

    answers_data = []
    for a in session.answers:
        q = answer_q_map.get(a.question_id)
        answers_data.append({
            "id": a.id,
            "question_id": a.question_id,
            "question_text": q.question_text if q else None,
            "sample_answer": q.sample_answer if q else None,
            "answer_text": a.answer_text,
            "score": a.score,
            "relevance_score": a.relevance_score,
            "completeness_score": a.completeness_score,
            "accuracy_score": a.accuracy_score,
            "clarity_score": a.clarity_score,
            "feedback": a.feedback
        })

    return {
        "session_id": session.id,
        "status": session.status.value if hasattr(session.status, 'value') else str(session.status),
        "overall_score": session.overall_score,
        "recommendation": session.recommendation.value if session.recommendation else None,
        "strengths": session.strengths,
        "weaknesses": session.weaknesses,
        "candidate_name": application.applicant_name,
        "job_title": db.query(Job).filter(Job.id == job_id).first().title if True else None,
        "answers": answers_data
    }


# ─────────────────────────────────────────────
# GET /api/recruiter/job/{job_id}/results
# ─────────────────────────────────────────────
@router.get("/api/recruiter/job/{job_id}/results")
def get_job_results(
    job_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all scored interview results for a job."""
    _require_recruiter(current_user)

    sessions = db.query(InterviewSession).filter(
        InterviewSession.job_id == job_id,
        InterviewSession.interview_mode == "recruiter_driven",
        InterviewSession.status == InterviewSessionStatus.SCORED
    ).all()

    results = []
    for s in sessions:
        app = db.query(JobApplication).filter(JobApplication.id == s.application_id).first()
        results.append({
            "session_id": s.id,
            "candidate_name": app.applicant_name if app else "Unknown",
            "candidate_email": app.applicant_email if app else "",
            "overall_score": s.overall_score,
            "recommendation": s.recommendation.value if s.recommendation else None,
            "strengths": s.strengths,
            "weaknesses": s.weaknesses,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None
        })

    return results


def _update_candidate_nested_transcripts(db: Session, application_id: int, job_id: int):
    """Update nested transcripts in candidate object"""
    # Get candidate user via job application
    application = db.query(JobApplication).filter(JobApplication.id == application_id).first()
    if not application:
        return
        
    candidate_user = db.query(User).filter(User.email == application.applicant_email).first()
    if not candidate_user:
        return
    
    # Get all interview sessions with transcripts for this candidate
    sessions = db.query(InterviewSession).filter(
        InterviewSession.application_id == application_id,
        InterviewSession.job_id == job_id,
        InterviewSession.transcript_text.isnot(None)
    ).all()
    
    # Convert to nested format
    nested_transcripts = []
    for session in sessions:
        nested_transcripts.append({
            "id": session.id,
            "job_id": session.job_id,
            "session_id": session.id,
            "transcript_text": session.transcript_text,
            "score": session.overall_score,
            "interview_mode": session.interview_mode,
            "status": session.status.value if hasattr(session.status, 'value') else str(session.status),
            "created_at": session.created_at.isoformat() if session.created_at else None
        })
    
    # Update candidate's nested transcripts
    candidate_user.interview_transcripts = json.dumps(nested_transcripts)
    candidate_user.has_transcript = len(nested_transcripts) > 0
    if nested_transcripts:
        # Update overall score with latest transcript score
        candidate_user.score = nested_transcripts[-1]["score"]
    db.commit()
