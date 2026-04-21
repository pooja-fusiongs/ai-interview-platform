"""
Interview Ratings API - Merged from client's iHire codebase.
Provides per-question rating (1-10), transcript AI scoring, and report card generation.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from typing import Optional
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor

from database import get_db
from models import (
    User, Job, JobApplication, InterviewQuestion, InterviewRating
)
from schemas import (
    RatingCreate, RatingUpdate, RatingResponse,
    TranscriptScoreResponse, InterviewSummaryResponse
)
from api.auth.jwt_handler import get_current_active_user
from services.ihire_ai_service import score_transcript, generate_report_card
from services.file_service import save_upload_file, validate_file, extract_text_from_file

router = APIRouter(
    prefix="/api/jobs/{job_id}/candidates/{candidate_id}",
    tags=["Interview Ratings"]
)


def get_candidate_with_auth(job_id: int, candidate_id: int, user: User, db: Session):
    """Ensures job exists and candidate belongs to it. Recruiters and admins can access any job."""
    role = user.role.value if user.role else ""
    if role in ("admin", "recruiter"):
        job = db.query(Job).filter(Job.id == job_id).first()
    else:
        job = db.query(Job).filter(
        Job.id == job_id,
        Job.created_by == user.id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    candidate = db.query(JobApplication).filter(
        JobApplication.id == candidate_id,
        JobApplication.job_id == job.id
    ).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    return job, candidate


@router.post("/questions/{question_id}/rate", response_model=RatingResponse)
async def rate_question(
    job_id: int,
    candidate_id: int,
    question_id: int,
    rating_data: RatingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create or update a rating for a question (1-10 scale)."""
    job, candidate = get_candidate_with_auth(job_id, candidate_id, current_user, db)

    # Validate rating range
    if rating_data.rating < 1 or rating_data.rating > 10:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 10")

    question = db.query(InterviewQuestion).filter(
        InterviewQuestion.id == question_id,
        InterviewQuestion.candidate_id == candidate.id
    ).first()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Check if rating already exists for this (question, source, video_interview) triple.
    # Lookup must include video_interview_id so each interview can independently rate
    # the same question without stomping on rows from other interviews.
    source = rating_data.source or "ai_questions"
    video_interview_id = rating_data.video_interview_id if source == "video_interview" else None

    existing_filter = [
        InterviewRating.question_id == question.id,
        InterviewRating.source == source,
    ]
    if video_interview_id is not None:
        existing_filter.append(InterviewRating.video_interview_id == video_interview_id)
    else:
        # Legacy/ai_questions flow (no video_interview_id) — match only rows where it's also NULL
        existing_filter.append(InterviewRating.video_interview_id.is_(None))

    existing_rating = db.query(InterviewRating).filter(*existing_filter).first()

    if existing_rating:
        existing_rating.rating = rating_data.rating
        existing_rating.notes = rating_data.notes
        # Bump created_at so downstream queries still have a reasonable temporal signal
        # (video_interview_id is the authoritative isolation, but created_at is kept fresh too).
        from datetime import datetime as _dt, timezone as _tz
        existing_rating.created_at = _dt.now(_tz.utc)
        db.commit()
        db.refresh(existing_rating)
        return existing_rating

    new_rating = InterviewRating(
        question_id=question.id,
        rating=rating_data.rating,
        notes=rating_data.notes,
        source=source,
        video_interview_id=video_interview_id,
    )
    db.add(new_rating)
    db.commit()
    db.refresh(new_rating)

    return new_rating


@router.delete("/questions/{question_id}/rate")
async def delete_rating(
    job_id: int,
    candidate_id: int,
    question_id: int,
    source: str = "ai_questions",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a rating (unselect score)."""
    job, candidate = get_candidate_with_auth(job_id, candidate_id, current_user, db)

    question = db.query(InterviewQuestion).filter(
        InterviewQuestion.id == question_id,
        InterviewQuestion.candidate_id == candidate.id
    ).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    rating = db.query(InterviewRating).filter(
        InterviewRating.question_id == question.id,
        InterviewRating.source == source,
    ).first()
    if not rating:
        return {"status": "ok", "message": "No rating to delete"}

    db.delete(rating)
    _update_overall_score(candidate, db)
    db.commit()
    return {"status": "ok", "message": "Rating deleted"}


@router.put("/questions/{question_id}/rate", response_model=RatingResponse)
async def update_rating(
    job_id: int,
    candidate_id: int,
    question_id: int,
    rating_data: RatingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update an existing rating."""
    job, candidate = get_candidate_with_auth(job_id, candidate_id, current_user, db)

    question = db.query(InterviewQuestion).filter(
        InterviewQuestion.id == question_id,
        InterviewQuestion.candidate_id == candidate.id
    ).first()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    rating = db.query(InterviewRating).filter(
        InterviewRating.question_id == question.id
    ).first()

    if not rating:
        raise HTTPException(status_code=404, detail="Rating not found")

    if rating_data.rating is not None:
        if rating_data.rating < 1 or rating_data.rating > 10:
            raise HTTPException(status_code=400, detail="Rating must be between 1 and 10")
        rating.rating = rating_data.rating
    if rating_data.notes is not None:
        rating.notes = rating_data.notes

    # Bump created_at so time-scoped "this interview only" queries pick up this update
    from datetime import datetime as _dt, timezone as _tz
    rating.created_at = _dt.now(_tz.utc)

    _update_overall_score(candidate, db)
    db.commit()
    db.refresh(rating)

    return rating


@router.post("/transcript", response_model=TranscriptScoreResponse)
async def submit_transcript(
    job_id: int,
    candidate_id: int,
    transcript_text: Optional[str] = Form(None),
    transcript_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Submit interview transcript (text or file) for AI scoring."""
    job, candidate = get_candidate_with_auth(job_id, candidate_id, current_user, db)

    final_transcript = ""

    if transcript_file and transcript_file.filename:
        if not validate_file(transcript_file):
            raise HTTPException(status_code=400, detail="Invalid file type. Allowed: .pdf, .docx, .txt")
        file_path = await save_upload_file(transcript_file, f"transcripts/{job_id}/{candidate_id}")
        candidate.transcript_path = file_path
        final_transcript = extract_text_from_file(file_path)

    if transcript_text and transcript_text.strip():
        final_transcript = transcript_text.strip()

    if not final_transcript:
        raise HTTPException(status_code=400, detail="Please provide a transcript (text or file)")

    # Always save the final transcript text (whether from paste or file)
    candidate.transcript_text = final_transcript

    # Get questions and answers for context
    questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.candidate_id == candidate.id
    ).order_by(InterviewQuestion.order_number).all()

    questions_and_answers = []
    for q in questions:
        questions_and_answers.append({
            "question": q.question_text,
            "suggested_answer": q.suggested_answer or q.sample_answer or ""
        })

    job_description = job.description or ""
    if job.description_file_path:
        jd_text = extract_text_from_file(job.description_file_path)
        if jd_text:
            job_description = jd_text

    # Prepare report card data upfront (DB queries before LLM calls)
    # Include ratings from both sources for scoring/report generation
    all_ratings = (
        db.query(InterviewRating)
        .join(InterviewQuestion, InterviewRating.question_id == InterviewQuestion.id)
        .filter(InterviewQuestion.candidate_id == candidate.id)
        .all()
    )
    rating_lookup = {r.question_id: r for r in all_ratings}

    questions_data = []
    for q in questions:
        rating_row = rating_lookup.get(q.id)
        questions_data.append({
            "question_text": q.question_text,
            "category": q.category or q.skill_focus,
            "rating": rating_row.rating if rating_row else None,
            "notes": rating_row.notes if rating_row else "",
        })

    # Build strengths/improvements context for report card (no LLM needed)
    strengths_context = []
    improvements_context = []
    for qd in questions_data:
        category = qd.get("category") or "General"
        if qd.get("rating") is not None:
            score_val = float(qd["rating"])
            if score_val >= 8:
                strengths_context.append(f"Strong in {category}: {qd.get('question_text', '')[:120]}")
            elif score_val <= 5:
                improvements_context.append(f"Weak in {category}: {qd.get('question_text', '')[:120]}")

    recruiter_score = float(candidate.overall_score) if candidate.overall_score is not None else None
    score_breakdown = [
        {"label": "Overall Rating", "score": None},
        {"label": "iHire Rating", "score": None},
        {"label": "Recruiter Rating", "score": recruiter_score},
    ]

    # Run BOTH LLM calls in parallel (scoring + report card)
    loop = asyncio.get_event_loop()

    with ThreadPoolExecutor(max_workers=2) as executor:
        score_future = loop.run_in_executor(executor, lambda: score_transcript(
            transcript=final_transcript,
            job_title=job.title,
            job_description=job_description,
            candidate_name=candidate.applicant_name,
            questions_and_answers=questions_and_answers
        ))

        report_future = loop.run_in_executor(executor, lambda: generate_report_card(
            candidate_name=candidate.applicant_name,
            job_title=job.title,
            score_breakdown=score_breakdown,
            strengths_context=strengths_context[:6],
            improvements_context=improvements_context[:6],
            transcript_feedback="",  # Not available yet, but transcript text is
            transcript_text=final_transcript,
        ))

        ai_result, report_card = await asyncio.gather(score_future, report_future)

    ai_score = ai_result["score"]
    candidate.ai_score = ai_score

    # Final score = 80% AI + 20% recruiter
    if candidate.overall_score is not None:
        candidate.final_score = round((ai_score * 0.8) + (candidate.overall_score * 0.2), 1)
    else:
        candidate.final_score = ai_score

    # Update report card with final scores
    report_card["scores"] = [
        {"label": "Overall Rating", "score": float(candidate.final_score)},
        {"label": "iHire Rating", "score": float(ai_score)},
        {"label": "Recruiter Rating", "score": recruiter_score},
    ]

    candidate.report_card_json = json.dumps(report_card)
    db.commit()
    db.refresh(candidate)

    return {
        "ai_score": candidate.ai_score,
        "final_score": candidate.final_score,
        "ai_feedback": ai_result["feedback"],
        "report_card": _get_saved_report_card(candidate),
    }


@router.get("/summary", response_model=InterviewSummaryResponse)
async def get_interview_summary(
    job_id: int,
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get complete interview summary with all ratings and scores."""
    job, candidate = get_candidate_with_auth(job_id, candidate_id, current_user, db)

    questions = (
        db.query(InterviewQuestion)
        .filter(InterviewQuestion.candidate_id == candidate.id)
        .order_by(InterviewQuestion.order_number)
        .all()
    )

    # Only show AI Questions page ratings in summary (not video interview ratings)
    all_ratings = (
        db.query(InterviewRating)
        .join(InterviewQuestion, InterviewRating.question_id == InterviewQuestion.id)
        .filter(
            InterviewQuestion.candidate_id == candidate.id,
            InterviewRating.source == "ai_questions",
        )
        .all()
    )
    rating_map = {r.question_id: r for r in all_ratings}

    total_questions = len(questions)
    rated_questions = 0
    total_score = 0
    questions_data = []

    for q in questions:
        rating = rating_map.get(q.id)
        q_data = {
            "id": q.id,
            "question_text": q.question_text,
            "suggested_answer": q.suggested_answer or q.sample_answer,
            "category": q.category or q.skill_focus,
            "difficulty": str(q.difficulty.value) if q.difficulty else None,
            "order_number": q.order_number or 0,
            "rating": None,
            "notes": None
        }

        if rating:
            rated_questions += 1
            total_score += rating.rating
            q_data["rating"] = rating.rating
            q_data["notes"] = rating.notes

        questions_data.append(q_data)

    average_score = round(total_score / rated_questions, 1) if rated_questions > 0 else None

    report_card = _get_saved_report_card(candidate)

    if report_card is None and candidate.ai_score is not None and candidate.transcript_text:
        report_card = _build_report_card(
            job, candidate, questions_data, "", candidate.transcript_text or ""
        )
        candidate.report_card_json = json.dumps(report_card)
        db.commit()

    return {
        "candidate_id": candidate.id,
        "candidate_name": candidate.applicant_name,
        "candidate_email": candidate.applicant_email,
        "position_title": job.title,
        "position_company": job.company,
        "interview_datetime": candidate.interview_datetime.isoformat() if candidate.interview_datetime else None,
        "duration_minutes": candidate.duration_minutes,
        "total_questions": total_questions,
        "rated_questions": rated_questions,
        "average_score": average_score,
        "overall_score": candidate.overall_score,
        "ai_score": candidate.ai_score,
        "final_score": candidate.final_score,
        "has_transcript": bool(candidate.transcript_text or candidate.transcript_path),
        "report_card": report_card,
        "questions": questions_data
    }


def _build_report_card(
    job: Job,
    candidate: JobApplication,
    questions_data: list[dict],
    ai_feedback: str = "",
    transcript_text: str = "",
    fraud_scores: dict = None,
) -> dict:
    """Build report card with strengths/improvements context from ratings + fraud analysis."""
    strengths_context = []
    improvements_context = []

    for q in questions_data:
        category = q.get("category") or "General"
        if q.get("rating") is not None:
            score = float(q["rating"])
            if score >= 8:
                strengths_context.append(f"Strong in {category}: {q.get('question_text', '')[:120]}")
            elif score <= 5:
                improvements_context.append(f"Weak in {category}: {q.get('question_text', '')[:120]}")

    recruiter_score = float(candidate.overall_score) if candidate.overall_score is not None else None
    ai_score = float(candidate.ai_score) if candidate.ai_score is not None else None
    overall_score = float(candidate.final_score) if candidate.final_score is not None else None

    scores = [
        {"label": "Overall Rating", "score": overall_score},
        {"label": "iHire Rating", "score": ai_score},
        {"label": "Recruiter Rating", "score": recruiter_score},
    ]

    # Add fraud/trust scores if available
    if fraud_scores:
        scores.append({"label": "Trust Score", "score": fraud_scores.get("overall_trust_score")})

    report = generate_report_card(
        candidate_name=candidate.applicant_name,
        job_title=job.title,
        score_breakdown=scores,
        strengths_context=strengths_context[:6],
        improvements_context=improvements_context[:6],
        transcript_feedback=ai_feedback,
        transcript_text=transcript_text,
    )

    # Attach fraud analysis breakdown to report card
    if fraud_scores:
        report["fraud_analysis"] = fraud_scores

    return report


def _get_saved_report_card(candidate: JobApplication) -> Optional[dict]:
    """Retrieve cached report card from candidate JSON field."""
    if not candidate.report_card_json:
        return None
    try:
        return json.loads(candidate.report_card_json)
    except json.JSONDecodeError:
        return None


def _update_overall_score(candidate: JobApplication, db: Session):
    """Recalculate overall + final scores."""
    result = db.query(
        sa_func.count(InterviewRating.id),
        sa_func.coalesce(sa_func.sum(InterviewRating.rating), 0),
    ).join(
        InterviewQuestion, InterviewRating.question_id == InterviewQuestion.id
    ).filter(
        InterviewQuestion.candidate_id == candidate.id
    ).first()

    rated_count = result[0] if result else 0
    total_score = result[1] if result else 0

    if rated_count > 0:
        candidate.overall_score = round(total_score / rated_count)
    else:
        candidate.overall_score = None

    if candidate.ai_score is not None and candidate.overall_score is not None:
        candidate.final_score = round((candidate.ai_score * 0.8) + (candidate.overall_score * 0.2), 1)
    elif candidate.ai_score is not None:
        candidate.final_score = candidate.ai_score
    elif candidate.overall_score is not None:
        candidate.final_score = float(candidate.overall_score)
    else:
        candidate.final_score = None


@router.post("/finalize-report")
async def finalize_interview_report(
    job_id: int,
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Auto-generate report card from recruiter ratings after interview ends.
    Final score = 80% AI (transcript) + 20% recruiter, scoped to rated questions only.
    Biometric/integrity (lip-sync, body movement, face) stays separate as Trust Score."""
    job, candidate = get_candidate_with_auth(job_id, candidate_id, current_user, db)

    # Recalculate overall score from all ratings (partial-interview aware: avg over rated count only)
    _update_overall_score(candidate, db)
    db.commit()
    db.refresh(candidate)

    if candidate.overall_score is None:
        return {
            "status": "no_ratings",
            "message": "No ratings found. Rate questions before generating report.",
            "recruiter_score": None,
            "final_score": None,
            "report_card": None,
        }

    # Get questions with ratings for report card
    questions = (
        db.query(InterviewQuestion)
        .filter(InterviewQuestion.candidate_id == candidate.id)
        .order_by(InterviewQuestion.order_number)
        .all()
    )
    all_ratings = (
        db.query(InterviewRating)
        .join(InterviewQuestion, InterviewRating.question_id == InterviewQuestion.id)
        .filter(InterviewQuestion.candidate_id == candidate.id)
        .all()
    )
    rating_map = {r.question_id: r for r in all_ratings}

    questions_data = []
    for q in questions:
        rating = rating_map.get(q.id)
        questions_data.append({
            "question_text": q.question_text,
            "category": q.category or q.skill_focus or "General",
            "difficulty": str(q.difficulty.value) if q.difficulty else None,
            "rating": rating.rating if rating else None,
            "notes": rating.notes if rating else None,
        })

    # Fetch fraud analysis scores if available (via VideoInterview link)
    fraud_scores = None
    transcript_for_ai = None
    try:
        from models import VideoInterview, FraudAnalysis
        # Find video interview for this job + candidate
        vi = db.query(VideoInterview).filter(
            VideoInterview.job_id == job_id,
        ).order_by(VideoInterview.created_at.desc()).first()
        if vi and vi.transcript:
            transcript_for_ai = vi.transcript
        if vi:
            fraud = db.query(FraudAnalysis).filter(
                FraudAnalysis.video_interview_id == vi.id
            ).first()
            if fraud and fraud.overall_trust_score is not None:
                fraud_scores = {
                    "overall_trust_score": round(fraud.overall_trust_score, 1) if fraud.overall_trust_score else None,
                    "face_detection_score": round(fraud.face_detection_score, 2) if fraud.face_detection_score else None,
                    "voice_consistency_score": round(fraud.voice_consistency_score, 2) if fraud.voice_consistency_score else None,
                    "lip_sync_score": round(fraud.lip_sync_score, 2) if fraud.lip_sync_score else None,
                    "body_movement_score": round(fraud.body_movement_score, 2) if fraud.body_movement_score else None,
                }
    except Exception as e:
        print(f"⚠️ Could not fetch fraud scores: {e}")

    # NOTE: AI transcript scoring is NOT done here — it would add a 20-40s OpenAI call
    # and trip the frontend's axios timeout. The `/api/video/interviews/{id}/upload-transcript`
    # endpoint already runs Groq/Gemini scoring + 80/20 blend for the video interview flow,
    # and the `/transcript` endpoint handles it for the AI-questions flow. If `candidate.ai_score`
    # is already populated (by the /transcript endpoint), `_update_overall_score` above has already
    # applied the 80/20 weighting to `candidate.final_score`.

    # Build and save report card — wrapped in try/except so a slow/failed OpenAI call
    # on report card generation doesn't break finalization. Recruiter score remains saved.
    report_card = None
    try:
        report_card = _build_report_card(
            job, candidate, questions_data, "", transcript_for_ai or "", fraud_scores=fraud_scores
        )
        candidate.report_card_json = json.dumps(report_card)
    except Exception as e:
        print(f"⚠️ Report card generation failed (recruiter score still saved): {e}")
    db.commit()

    return {
        "status": "success",
        "recruiter_score": candidate.overall_score,
        "ai_score": candidate.ai_score,
        "final_score": candidate.final_score,
        "report_card": report_card,
    }
