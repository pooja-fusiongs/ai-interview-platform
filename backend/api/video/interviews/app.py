"""
Video Interview API Endpoints.

Manages the full lifecycle of video interviews: scheduling, listing,
updating, starting, ending, and cancellation. Integrates with the
Zoom service for meeting creation/deletion and checks for associated
fraud analysis records.
"""

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload, load_only
from typing import List
from datetime import datetime, timezone, timedelta

import sys
import os
import hashlib
import secrets
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from database import get_db
from models import (
    User,
    Job,
    JobApplication,
    VideoInterview,
    VideoInterviewStatus,
    FraudAnalysis,
    UserRole,
    InterviewSession,
    InterviewSessionStatus,
    InterviewAnswer,
    InterviewQuestion,
    InterviewRating,
    QuestionGenerationSession,
    TranscriptChunk,
)
from services.realtime_transcription import compile_transcript
from schemas import (
    VideoInterviewCreate,
    VideoInterviewResponse,
    VideoInterviewUpdate,
    VideoInterviewListResponse,
    VideoInterviewEndRequest,
)
from api.auth.jwt_handler import get_current_active_user, require_any_role
from services.zoom_service import create_zoom_meeting, delete_zoom_meeting
from services.email_service import send_interview_notification, send_interview_result_notification
from services.groq_service import transcribe_audio_with_groq

router = APIRouter(tags=["Video Interviews"])


def generate_candidate_token(interview_id: int, candidate_id: int) -> str:
    """Generate a secure token for candidate interview links. Cannot be guessed or removed."""
    secret = os.getenv("SECRET_KEY", "fallback-secret")
    raw = f"{interview_id}-{candidate_id}-{secret}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def verify_guest_token(video_id: int, token: str, db: Session) -> VideoInterview:
    """Verify a guest candidate token and return the VideoInterview.
    Raises 404 if interview not found, 403 if token is invalid/missing."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")
    if not vi.candidate_id:
        raise HTTPException(status_code=403, detail="Interview has no candidate assigned")
    expected = generate_candidate_token(video_id, vi.candidate_id)
    if not token or token != expected:
        raise HTTPException(status_code=403, detail="Invalid or missing candidate token")
    return vi


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_response(vi: VideoInterview, db: Session = None, questions_approved: bool = True) -> VideoInterviewResponse:
    """Build a VideoInterviewResponse from an ORM object with joined names."""
    try:
        # Extract names from already-loaded relationships (no extra queries)
        candidate_name = None
        if vi.candidate:
            candidate_name = vi.candidate.full_name or vi.candidate.username
        interviewer_name = None
        if vi.interviewer:
            interviewer_name = vi.interviewer.full_name or vi.interviewer.username
        job_title = vi.job.title if vi.job else None
        interview_type = vi.job.interview_type if vi.job else "Both"

        # Batch-fetch all related data in minimal queries
        application = None
        overall_score = None
        recommendation = None
        strengths = None
        weaknesses = None
        per_question_scores = None
        interview_session_id = None
        question_session_id = None
        recruiter_score = None
        rated_questions = None
        total_questions = None

        if db:
            # Query 1: Get application (needed for question/rating lookups).
            # Multi-strategy lookup — handles both logged-in and guest candidates.
            # Strategy 1: Email match (works for logged-in candidates)
            if vi.candidate:
                application = db.query(JobApplication).filter(
                    JobApplication.job_id == vi.job_id,
                    JobApplication.applicant_email == vi.candidate.email
                ).first()

            # Strategy 2: If no application found via email (guest flow),
            # derive it from existing ratings tied to THIS interview.
            if not application:
                try:
                    rating_app_row = db.query(InterviewQuestion.candidate_id).join(
                        InterviewRating, InterviewRating.question_id == InterviewQuestion.id
                    ).filter(
                        InterviewRating.video_interview_id == vi.id,
                        InterviewRating.source == "video_interview",
                    ).distinct().first()
                    if rating_app_row:
                        app_id = rating_app_row[0]
                        application = db.query(JobApplication).filter(
                            JobApplication.id == app_id,
                            JobApplication.job_id == vi.job_id,
                        ).first()
                except Exception as e:
                    print(f"[video-detail] Rating-based application lookup failed: {e}")

            if application:
                candidate_name = application.applicant_name

            # Query 2: Session + answers in one go (if session exists)
            if vi.session_id is not None:
                session = db.query(InterviewSession).filter(InterviewSession.id == vi.session_id).first()
                if session and session.overall_score is not None:
                    interview_session_id = session.id
                    overall_score = session.overall_score
                    recommendation = session.recommendation.value if hasattr(session.recommendation, "value") else str(session.recommendation) if session.recommendation else None
                    strengths = session.strengths
                    weaknesses = session.weaknesses
                    answers = db.query(InterviewAnswer).filter(InterviewAnswer.session_id == session.id).all()
                    if answers:
                        per_question_scores = [{
                            "question_id": a.question_id, "score": a.score,
                            "relevance_score": a.relevance_score, "completeness_score": a.completeness_score,
                            "accuracy_score": a.accuracy_score, "clarity_score": a.clarity_score,
                            "feedback": a.feedback, "extracted_answer": a.answer_text
                        } for a in answers]

            # Query 3: Question session + rating counts (combined for application)
            if application:
                from sqlalchemy import func as sa_func
                q_session = db.query(QuestionGenerationSession).filter(
                    QuestionGenerationSession.job_id == vi.job_id,
                    QuestionGenerationSession.candidate_id == application.id,
                ).order_by(QuestionGenerationSession.created_at.desc()).first()
                if q_session:
                    question_session_id = q_session.id

                # Count questions that were actually ASKED during the interview.
                # A question is "asked" if either:
                #   (a) an InterviewAnswer row exists for it in this video's session
                #       (AI extracted an answer for it from the transcript — skips not_asked), or
                #   (b) a recruiter InterviewRating row exists for it (recruiter rated => asked).
                # IMPORTANT: InterviewRating rows persist across re-interviews (linked to question_id
                # only, no video_interview_id). We MUST scope to ratings created on/after vi.started_at
                # (with vi.scheduled_at fallback) to avoid counting stale ratings from prior sessions.
                generated_q = db.query(sa_func.count(InterviewQuestion.id)).filter(
                    InterviewQuestion.job_id == vi.job_id,
                    InterviewQuestion.candidate_id == application.id,
                ).scalar() or 0

                # Build the "this interview only" rating cutoff
                rating_cutoff = vi.started_at or vi.scheduled_at

                asked_q_ids = set()

                # Source 1: answers from this video interview's session
                sess_for_count = None
                if vi.session_id:
                    sess_for_count = db.query(InterviewSession).filter(
                        InterviewSession.id == vi.session_id
                    ).first()
                if not sess_for_count:
                    sess_for_count = db.query(InterviewSession).filter(
                        InterviewSession.job_id == vi.job_id,
                        InterviewSession.application_id == application.id,
                    ).order_by(InterviewSession.created_at.desc()).first()

                if sess_for_count:
                    # Only count answers with a real AI score (> 0) — this excludes
                    # not_asked questions that older code paths may have persisted
                    # with score=0 and placeholder answer_text. Groq gives >0 to any
                    # question it actually found evidence for in the transcript.
                    ans_q_ids = db.query(InterviewAnswer.question_id).filter(
                        InterviewAnswer.session_id == sess_for_count.id,
                        InterviewAnswer.question_id.isnot(None),
                        InterviewAnswer.score.isnot(None),
                        InterviewAnswer.score > 0,
                    ).all()
                    asked_q_ids.update(r[0] for r in ans_q_ids if r[0] is not None)

                # Helper: build the base rating query filtered by THIS specific video interview.
                # Wrapped in try/except so a missing column (e.g., during live migration) doesn't
                # crash the whole detail page — falls back to unscoped query in that case.
                def _scoped_rating_query(select_expr):
                    return db.query(select_expr).join(
                        InterviewQuestion, InterviewRating.question_id == InterviewQuestion.id
                    ).filter(
                        InterviewQuestion.candidate_id == application.id,
                        InterviewRating.source == "video_interview",
                        InterviewRating.video_interview_id == vi.id,
                    )

                def _unscoped_rating_query(select_expr):
                    return db.query(select_expr).join(
                        InterviewQuestion, InterviewRating.question_id == InterviewQuestion.id
                    ).filter(
                        InterviewQuestion.candidate_id == application.id,
                        InterviewRating.source == "video_interview",
                    )

                # Source 2: ratings tied to THIS video interview — strict isolation
                try:
                    rated_rows = _scoped_rating_query(InterviewRating.question_id).all()
                except Exception as e:
                    # Column not yet migrated, or other transient error — fall back to unscoped
                    print(f"[video-detail] scoped rating query failed, falling back: {e}")
                    db.rollback()
                    rated_rows = _unscoped_rating_query(InterviewRating.question_id).all()
                asked_q_ids.update(r[0] for r in rated_rows if r[0] is not None)

                # Denominator: asked count when we have signal, else fall back to generated
                asked_q = len(asked_q_ids) if asked_q_ids else generated_q

                if asked_q > 0:
                    try:
                        rated_q = _scoped_rating_query(sa_func.count(InterviewRating.id)).scalar() or 0
                        from sqlalchemy import func as _fn
                        vi_avg_query = _scoped_rating_query(_fn.avg(InterviewRating.rating))
                    except Exception as e:
                        print(f"[video-detail] scoped count/avg failed, falling back: {e}")
                        db.rollback()
                        rated_q = _unscoped_rating_query(sa_func.count(InterviewRating.id)).scalar() or 0
                        from sqlalchemy import func as _fn
                        vi_avg_query = _unscoped_rating_query(_fn.avg(InterviewRating.rating))

                    if rated_q > 0:
                        total_questions = asked_q
                        rated_questions = rated_q
                        vi_avg = vi_avg_query.scalar()
                        recruiter_score = round(float(vi_avg), 1) if vi_avg else None
        response = VideoInterviewResponse(
            id=vi.id,
            session_id=vi.session_id,
            job_id=vi.job_id,
            candidate_id=vi.candidate_id,
            interviewer_id=vi.interviewer_id,
            zoom_meeting_url=vi.zoom_meeting_url,
            zoom_passcode=vi.zoom_passcode,
            status=vi.status.value if hasattr(vi.status, "value") else vi.status,
            scheduled_at=vi.scheduled_at,
            duration_minutes=vi.duration_minutes,
            started_at=vi.started_at,
            ended_at=vi.ended_at,
            recording_consent=vi.recording_consent,
            recording_url=vi.recording_url,
            candidate_name=candidate_name,
            interviewer_name=interviewer_name,
            job_title=job_title,
            transcript=vi.transcript,
            transcript_generated_at=vi.transcript_generated_at,
            interview_type=interview_type,
            overall_score=overall_score,
            recommendation=recommendation,
            strengths=strengths,
            weaknesses=weaknesses,
            per_question_scores=per_question_scores,
            interview_session_id=interview_session_id,
            questions_approved=questions_approved,
            question_session_id=question_session_id,
            recruiter_score=recruiter_score,
            rated_questions=rated_questions,
            total_questions=total_questions,
        )
        
        return response
        
    except Exception as e:
        print(f"[ERROR] Failed to build response for interview {vi.id}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to build interview response: {str(e)}")


def _build_list_item(vi: VideoInterview, db: Session) -> VideoInterviewListResponse:
    """Build a list-view item including fraud analysis summary."""
    candidate_name = ""

    # Try to get name from JobApplication first (more accurate)
    if vi.candidate:
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id,
            JobApplication.applicant_email == vi.candidate.email
        ).first()
        if application:
            candidate_name = application.applicant_name

    # Fallback to User table
    if not candidate_name and vi.candidate:
        candidate_name = vi.candidate.full_name or vi.candidate.username or ""

    job_title = vi.job.title if vi.job else ""

    # Check for existing fraud analysis
    fraud = (
        db.query(FraudAnalysis)
        .filter(FraudAnalysis.video_interview_id == vi.id)
        .first()
    )

    return VideoInterviewListResponse(
        id=vi.id,
        job_id=vi.job_id,
        candidate_id=vi.candidate_id,
        candidate_email=vi.candidate.email if vi.candidate else None,
        job_title=job_title,
        candidate_name=candidate_name,
        status=vi.status.value if hasattr(vi.status, "value") else vi.status,
        scheduled_at=vi.scheduled_at,
        duration_minutes=vi.duration_minutes,
        has_fraud_analysis=fraud is not None,
        flag_count=fraud.flag_count if fraud else 0,
        overall_trust_score=fraud.overall_trust_score if fraud else None,
    )


# ---------------------------------------------------------------------------
# POST /api/video/interviews  -- Schedule a new video interview
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews", response_model=VideoInterviewResponse)
def schedule_video_interview(
    body: VideoInterviewCreate,
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
    db: Session = Depends(get_db),
):
    """Schedule a new video interview. Recruiter/Admin only."""
    try:
        # Validate job exists and is not closed
        job = db.query(Job).filter(Job.id == body.job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        job_status = (job.status or "").lower()
        if job_status in ("closed", "cancelled"):
            raise HTTPException(status_code=400, detail="Cannot schedule interview for a closed position")

        # Validate candidate - check JobApplication FIRST (frontend sends JobApplication IDs)
        application = db.query(JobApplication).filter(
            JobApplication.id == body.candidate_id
        ).first()

        candidate = None
        candidate_name_for_email = None
        candidate_email_for_notification = None

        if application:
            # Found JobApplication - use its info for email
            candidate_name_for_email = application.applicant_name
            candidate_email_for_notification = application.applicant_email

            # Find or create User for this candidate
            candidate = db.query(User).filter(User.email == application.applicant_email).first()

            if not candidate:
                # Create a candidate user account from the application
                import hashlib
                import random

                # Use SHA256 hash (same as crud.py)
                temp_password = "Welcome123"
                hashed_pwd = hashlib.sha256(temp_password.encode()).hexdigest()

                # Generate unique username
                base_username = application.applicant_email.split('@')[0]
                username = base_username

                # Check if username exists, add random number if needed
                existing = db.query(User).filter(User.username == username).first()
                if existing:
                    username = f"{base_username}{random.randint(100, 999)}"

                candidate = User(
                    email=application.applicant_email,
                    username=username,
                    full_name=application.applicant_name,
                    role=UserRole.CANDIDATE,
                    is_active=True,
                    hashed_password=hashed_pwd
                )
                db.add(candidate)
                db.flush()  # Get the ID
        else:
            # No JobApplication found - try finding User directly (for backward compatibility)
            candidate = db.query(User).filter(User.id == body.candidate_id).first()
            if not candidate:
                raise HTTPException(status_code=404, detail="Candidate not found")
            candidate_name_for_email = candidate.full_name or candidate.username
            candidate_email_for_notification = candidate.email

        # LiveKit integration is used instead of Zoom/Jitsi
        zoom_data = None

        # Use current_user as interviewer if not provided
        interviewer_id = body.interviewer_id if body.interviewer_id else current_user.id

        vi = VideoInterview(
            session_id=body.session_id,
            job_id=body.job_id,
            candidate_id=candidate.id,  # Use User ID, not JobApplication ID
            interviewer_id=interviewer_id,
            scheduled_at=body.scheduled_at,
            duration_minutes=body.duration_minutes,
            status=VideoInterviewStatus.SCHEDULED.value,
        )
        
        print(f"[schedule_video_interview] Creating interview for candidate User ID: {candidate.id}, email: {candidate.email}, name: {candidate.full_name}")
        print(f"[schedule_video_interview] JobApplication ID was: {application.id if application else 'N/A'}")

        if zoom_data:
            vi.zoom_meeting_id = zoom_data["meeting_id"]
            vi.zoom_meeting_url = zoom_data["join_url"]
            vi.zoom_host_url = zoom_data["host_url"]
            vi.zoom_passcode = zoom_data["passcode"]

        db.add(vi)

        # Update JobApplication status to "Interview Scheduled"
        if application and application.status in ("Applied", "Reviewed", "Questions Generated"):
            application.status = "Interview Scheduled"

        db.commit()
        db.refresh(vi)

        # Send email notification to candidate (in background — don't block API response)
        import threading
        try:
            from datetime import timezone as tz_mod
            IST = tz_mod(timedelta(hours=5, minutes=30))
            # Ensure timezone-aware before converting to IST
            sched_dt = body.scheduled_at if body.scheduled_at.tzinfo else body.scheduled_at.replace(tzinfo=tz_mod.utc)
            scheduled_ist = sched_dt.astimezone(IST)
            interview_date = scheduled_ist.strftime("%B %d, %Y")
            interview_time = scheduled_ist.strftime("%I:%M %p") + " IST"

            frontend_url = os.getenv("FRONTEND_URL", "https://ai-interview-platform-unqg.vercel.app")
            candidate_token = generate_candidate_token(vi.id, vi.candidate_id)
            meeting_url = f"{frontend_url}/video-room/{vi.id}?token={candidate_token}"
            print(f"📧 Candidate email link: {meeting_url}")

            _email_to = candidate_email_for_notification
            _email_name = candidate_name_for_email
            _email_job = job.title

            def _send_email_bg():
                for attempt in range(3):
                    try:
                        send_interview_notification(
                            candidate_email=_email_to,
                            candidate_name=_email_name,
                            job_title=_email_job,
                            interview_date=interview_date,
                            interview_time=interview_time,
                            meeting_url=meeting_url
                        )
                        print(f"📧 Interview notification sent to {_email_to}")
                        return
                    except Exception as e:
                        print(f"⚠️ Email attempt {attempt+1}/3 failed for {_email_to}: {e}")
                        if attempt < 2:
                            import time; time.sleep(2)
                print(f"❌ CRITICAL: All 3 email attempts failed for {_email_to}")

            threading.Thread(target=_send_email_bg, daemon=True).start()
        except Exception as e:
            print(f"⚠️ Failed to prepare email notification: {e}")

        return _build_response(vi, db, questions_approved=True)
    
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        print(f"❌ Error scheduling video interview: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to schedule video interview: {str(e)}"
        )


# ---------------------------------------------------------------------------
# GET /api/video/interviews  -- List all video interviews
# ---------------------------------------------------------------------------

@router.get(
    "/api/video/interviews",
    response_model=List[VideoInterviewListResponse],
)
def list_video_interviews(
    response: Response,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    List video interviews.
    Recruiters/Admins see all; Candidates see only their own.
    """
    try:
        from sqlalchemy.orm import load_only as _lo
        query = db.query(VideoInterview).options(
            # Exclude heavy columns (transcript, recording_data) from list query
            _lo(
                VideoInterview.id, VideoInterview.session_id, VideoInterview.job_id,
                VideoInterview.candidate_id, VideoInterview.interviewer_id,
                VideoInterview.status, VideoInterview.scheduled_at, VideoInterview.duration_minutes,
                VideoInterview.started_at, VideoInterview.ended_at, VideoInterview.recording_url,
                VideoInterview.recording_consent, VideoInterview.transcript_source,
                VideoInterview.candidate_joined_at, VideoInterview.created_at,
            ),
            joinedload(VideoInterview.candidate).load_only(
                User.id, User.email, User.full_name, User.username
            ),
            joinedload(VideoInterview.interviewer).load_only(
                User.id, User.email, User.full_name, User.username
            ),
            joinedload(VideoInterview.job).load_only(
                Job.id, Job.title
            ),
        )
        if current_user.role == UserRole.CANDIDATE:
            query = query.filter(VideoInterview.candidate_id == current_user.id)
            print(f"[DEBUG] Filtering for candidate_id: {current_user.id}")
        elif current_user.role == UserRole.RECRUITER:
            # Show interviews where recruiter is interviewer OR owns the job
            recruiter_job_ids = [j.id for j in db.query(Job.id).filter(Job.created_by == current_user.id).all()]
            conditions = [VideoInterview.interviewer_id == current_user.id]
            if recruiter_job_ids:
                conditions.append(VideoInterview.job_id.in_(recruiter_job_ids))
            query = query.filter(or_(*conditions))
            print(f"[DEBUG] Filtering for interviewer_id: {current_user.id} or job_ids: {recruiter_job_ids}")

        # Fetch data first, then count only if paginating (saves 1 DB round-trip)
        interviews = query.order_by(VideoInterview.scheduled_at.desc()).offset(skip).limit(limit).all()

        # Only run count query if the result set is full (meaning there may be more)
        if len(interviews) < limit:
            total_count = skip + len(interviews)
        else:
            total_count = query.count()
        response.headers["X-Total-Count"] = str(total_count)
        
        # Optimize: Fetch all fraud analyses in one query
        interview_ids = [vi.id for vi in interviews]
        fraud_map = {}
        if interview_ids:
            frauds = db.query(FraudAnalysis).filter(
                FraudAnalysis.video_interview_id.in_(interview_ids)
            ).all()
            fraud_map = {f.video_interview_id: f for f in frauds}
        
        # Bulk pre-fetch job applications for candidate names
        candidate_emails = [vi.candidate.email for vi in interviews if vi.candidate]
        job_ids_list = list(set(vi.job_id for vi in interviews if vi.job_id))
        all_applications = []
        if candidate_emails and job_ids_list:
            all_applications = db.query(JobApplication).filter(
                JobApplication.job_id.in_(job_ids_list),
                JobApplication.applicant_email.in_(candidate_emails)
            ).all()
        app_name_map = {(a.job_id, a.applicant_email): a.applicant_name for a in all_applications}
        app_id_map = {(a.job_id, a.applicant_email): a.id for a in all_applications}

        # Batch fallback: fetch ALL applications for relevant jobs (case-insensitive email match)
        # This avoids N+1 queries when exact email match fails
        app_by_job_email_lower = {}
        for a in all_applications:
            key = (a.job_id, a.applicant_email.lower() if a.applicant_email else "")
            app_by_job_email_lower[key] = a

        # If some interviews have candidates not in all_applications, bulk-fetch remaining
        missing_job_ids = set()
        for vi in interviews:
            if vi.candidate and not app_id_map.get((vi.job_id, vi.candidate.email)):
                missing_job_ids.add(vi.job_id)
        if missing_job_ids:
            extra_apps = db.query(JobApplication).filter(JobApplication.job_id.in_(missing_job_ids)).all()
            for a in extra_apps:
                key_exact = (a.job_id, a.applicant_email)
                if key_exact not in app_id_map:
                    app_name_map[key_exact] = a.applicant_name
                    app_id_map[key_exact] = a.id
                key_lower = (a.job_id, a.applicant_email.lower() if a.applicant_email else "")
                if key_lower not in app_by_job_email_lower:
                    app_by_job_email_lower[key_lower] = a

        # Pre-fetch scored session IDs (find latest SCORED session per candidate+job)
        from models import InterviewSession, InterviewSessionStatus
        candidate_job_pairs = list(set((vi.candidate_id, vi.job_id) for vi in interviews if vi.candidate_id and vi.job_id))
        scored_session_map = {}  # (candidate_id, job_id) -> session_id
        if candidate_job_pairs:
            for cid, jid in candidate_job_pairs:
                scored = db.query(InterviewSession.id).filter(
                    InterviewSession.candidate_id == cid,
                    InterviewSession.job_id == jid,
                    InterviewSession.overall_score.isnot(None),
                ).order_by(InterviewSession.created_at.desc()).first()
                if scored:
                    scored_session_map[(cid, jid)] = scored[0]

        # Build responses with pre-fetched data
        result = []
        for vi in interviews:
            fraud = fraud_map.get(vi.id)

            candidate_name = ""
            candidate_email = vi.candidate.email if vi.candidate else None
            application_id = None
            if vi.candidate:
                candidate_name = app_name_map.get((vi.job_id, vi.candidate.email), "")
                application_id = app_id_map.get((vi.job_id, vi.candidate.email))
                if not candidate_name:
                    candidate_name = vi.candidate.full_name or vi.candidate.username or ""
                # Fallback: case-insensitive email match from pre-fetched data
                if not application_id and vi.candidate.email:
                    fallback = app_by_job_email_lower.get((vi.job_id, vi.candidate.email.lower()))
                    if fallback:
                        application_id = fallback.id
                        candidate_email = fallback.applicant_email
                        if not candidate_name:
                            candidate_name = fallback.applicant_name

            job_title = vi.job.title if vi.job else ""

            # Prefer scored session over video interview's session (which may not have score yet)
            best_session_id = scored_session_map.get((vi.candidate_id, vi.job_id)) or vi.session_id
            result.append(VideoInterviewListResponse(
                id=vi.id,
                session_id=best_session_id,
                job_id=vi.job_id,
                candidate_id=vi.candidate_id,
                candidate_email=candidate_email,
                application_id=application_id,
                job_title=job_title,
                candidate_name=candidate_name,
                status=vi.status.value if hasattr(vi.status, "value") else vi.status,
                scheduled_at=vi.scheduled_at,
                duration_minutes=vi.duration_minutes,
                has_fraud_analysis=fraud is not None,
                flag_count=fraud.flag_count if fraud else 0,
                overall_trust_score=fraud.overall_trust_score if fraud else None,
            ))
        
        return result
    except Exception as e:
        print(f"❌ Error listing video interviews: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to list interviews: {str(e)}")


# ---------------------------------------------------------------------------
# GET /api/video/interviews/candidate/me  -- My scheduled interviews
# ---------------------------------------------------------------------------

@router.get(
    "/api/video/interviews/candidate/me",
    response_model=List[VideoInterviewResponse],
)
def get_my_video_interviews(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all video interviews for the current candidate."""
    print(f"[get_my_video_interviews] current_user.id={current_user.id}, email={current_user.email}, role={current_user.role}")
    
    # Test database connection
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        print("[DEBUG] Database connection OK")
    except Exception as e:
        print(f"[DEBUG] Database connection failed: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    try:
        interviews = (
            db.query(VideoInterview)
            .options(
                joinedload(VideoInterview.candidate),
                joinedload(VideoInterview.interviewer),
                joinedload(VideoInterview.job),
            )
            .filter(VideoInterview.candidate_id == current_user.id)
            .order_by(VideoInterview.scheduled_at.desc())
            .all()
        )
        
        print(f"[get_my_video_interviews] Found {len(interviews)} interviews for candidate {current_user.id}")
        
        # Build responses with error handling
        responses = []
        for vi in interviews:
            try:
                response = _build_response(vi, db)
                responses.append(response)
                print(f"  - Interview ID: {vi.id}, Job: {vi.job.title if vi.job else 'N/A'}, Status: {vi.status}")
            except Exception as e:
                print(f"[ERROR] Failed to build response for interview {vi.id}: {e}")
                # Continue with other interviews even if one fails
                continue
        
        return responses
        
    except Exception as e:
        print(f"❌ Error in get_my_video_interviews: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to get interviews: {str(e)}")


# ---------------------------------------------------------------------------
# GET /api/video/interviews/{video_id}  -- Get single interview details
# ---------------------------------------------------------------------------

@router.get(
    "/api/video/interviews/{video_id}",
    response_model=VideoInterviewResponse,
)
def get_video_interview(
    video_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a single video interview with full details."""
    vi = db.query(VideoInterview).options(
        joinedload(VideoInterview.candidate),
        joinedload(VideoInterview.interviewer),
        joinedload(VideoInterview.job),
    ).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Candidates can only view their own
    if (
        current_user.role == UserRole.CANDIDATE
        and vi.candidate_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    return _build_response(vi, db)


# ---------------------------------------------------------------------------
# PUT /api/video/interviews/{video_id}  -- Update schedule / status
# ---------------------------------------------------------------------------

@router.put(
    "/api/video/interviews/{video_id}",
    response_model=VideoInterviewResponse,
)
def update_video_interview(
    video_id: int,
    body: VideoInterviewUpdate,
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
    db: Session = Depends(get_db),
):
    """Update a video interview schedule or status. Recruiter/Admin only."""
    print(f"[update_interview] video_id={video_id}, body={body.dict()}")
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Detect reschedule: new scheduled_at + status reset to scheduled
    is_reschedule = (
        body.scheduled_at is not None
        and body.status is not None
        and body.status.lower() == "scheduled"
    )
    print(f"[update_interview] is_reschedule={is_reschedule}, status={body.status}, scheduled_at={body.scheduled_at}")

    if body.status is not None:
        vi.status = body.status
    if body.scheduled_at is not None:
        vi.scheduled_at = body.scheduled_at
    if body.duration_minutes is not None:
        vi.duration_minutes = body.duration_minutes
    if body.notes is not None:
        vi.notes = body.notes

    # On reschedule, reset stale interview state
    if is_reschedule:
        vi.started_at = None
        vi.ended_at = None
        vi.candidate_joined_at = None
        vi.recording_url = None
        vi.transcript = None
        vi.transcript_generated_at = None
        vi.session_id = None
        vi.reminder_sent_at = None  # Reset so new reminder is sent
        print(f"[reschedule] Interview {video_id} rescheduled to {body.scheduled_at}")

    db.commit()
    db.refresh(vi)

    # Send reschedule email to candidate
    if is_reschedule:
        print(f"[reschedule] Attempting to send email. candidate_id={vi.candidate_id}, has_candidate={vi.candidate is not None}")
        # Re-fetch candidate to avoid lazy-load issues after commit
        candidate_user = db.query(User).filter(User.id == vi.candidate_id).first() if vi.candidate_id else None
        job = db.query(Job).filter(Job.id == vi.job_id).first() if vi.job_id else None
        if candidate_user and candidate_user.email:
            try:
                candidate_email = candidate_user.email
                candidate_name = candidate_user.full_name or candidate_user.username or "Candidate"
                job_title = job.title if job else "Interview"
                # Convert UTC to IST for email display
                from datetime import timezone as tz_mod
                IST = tz_mod(timedelta(hours=5, minutes=30))
                sched_dt = vi.scheduled_at if vi.scheduled_at.tzinfo else vi.scheduled_at.replace(tzinfo=timezone.utc)
                scheduled_ist = sched_dt.astimezone(IST)
                interview_date = scheduled_ist.strftime("%A, %B %d, %Y") if vi.scheduled_at else ""
                interview_time = (scheduled_ist.strftime("%I:%M %p") + " IST") if vi.scheduled_at else ""

                frontend_url = os.getenv("FRONTEND_URL", "https://ai-interview-platform-unqg.vercel.app")
                candidate_token = generate_candidate_token(vi.id, vi.candidate_id)
                meeting_url = f"{frontend_url}/video-room/{vi.id}?token={candidate_token}"

                send_interview_notification(
                    candidate_email=candidate_email,
                    candidate_name=candidate_name,
                    job_title=job_title,
                    interview_date=interview_date,
                    interview_time=interview_time,
                    meeting_url=meeting_url,
                    email_type="rescheduled",
                )
                print(f"📧 Reschedule notification sent to {candidate_email}")
            except Exception as e:
                print(f"⚠️ Failed to send reschedule email: {e}")
                import traceback
                traceback.print_exc()
        else:
            print(f"⚠️ [reschedule] No candidate email found for interview {video_id}")

    return _build_response(vi, db)


# ---------------------------------------------------------------------------
# DELETE /api/video/interviews/{video_id}  -- Cancel interview
# ---------------------------------------------------------------------------

@router.delete("/api/video/interviews/{video_id}")
def cancel_video_interview(
    video_id: int,
    current_user: User = Depends(
        require_any_role([UserRole.RECRUITER, UserRole.ADMIN])
    ),
    db: Session = Depends(get_db),
):
    """Cancel a video interview. If a Zoom meeting exists, delete it."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Attempt to cancel the Zoom meeting
    if vi.zoom_meeting_id:
        delete_zoom_meeting(vi.zoom_meeting_id)

    vi.status = VideoInterviewStatus.CANCELLED.value
    db.commit()

    return {"message": "Video interview cancelled", "id": video_id}


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/start  -- Mark as started
# ---------------------------------------------------------------------------

@router.post(
    "/api/video/interviews/{video_id}/start",
    response_model=VideoInterviewResponse,
)
def start_video_interview(
    video_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Mark a video interview as started.
    - If recruiter joins first: status = WAITING (waiting for candidate)
    - If candidate joins: status = IN_PROGRESS
    """
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Check who is starting the interview
    if current_user.role.value == 'candidate':
        # Candidate joining - start the interview
        vi.status = VideoInterviewStatus.IN_PROGRESS.value
        if not vi.started_at:
            vi.started_at = datetime.now(timezone.utc)
        print(f"[start_interview] Candidate joined, status=IN_PROGRESS")
    else:
        # Recruiter joining - set to WAITING for candidate
        if vi.status == VideoInterviewStatus.SCHEDULED.value:
            vi.status = VideoInterviewStatus.WAITING.value
            print(f"[start_interview] Recruiter joined, status=WAITING")
        # If already IN_PROGRESS, keep it as is
    
    db.commit()
    db.refresh(vi)
    return _build_response(vi, db)


@router.post("/api/video/join")
async def join_video_interview(
    video_id: int = Body(..., embed=True),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Handle participant joining the interview with proper status flow:
    - Recruiter joins first: SCHEDULED -> WAITING_FOR_CANDIDATE
    - Candidate joins: WAITING_FOR_CANDIDATE -> IN_PROGRESS
    """
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # FIXED: Block rejoining completed interviews
    if vi.status in [VideoInterviewStatus.COMPLETED.value, VideoInterviewStatus.NO_SHOW.value]:
        raise HTTPException(
            status_code=403, 
            detail=f"Cannot rejoin interview. Status: {vi.status}"
        )

    # Define user role flags
    is_recruiter = current_user.role in [UserRole.RECRUITER, UserRole.ADMIN]
    is_candidate = current_user.id == vi.candidate_id
    
    # Store previous status before commit
    previous_status = vi.status
    
    # Status flow logic
    if vi.status == VideoInterviewStatus.SCHEDULED.value:
        if is_recruiter:
            # Recruiter joins first -> waiting for candidate
            vi.status = VideoInterviewStatus.WAITING.value
            vi.started_at = datetime.now(timezone.utc)  # Track when waiting started (for grace period)
            print(f"✅ Recruiter joined, status: SCHEDULED -> WAITING_FOR_CANDIDATE")
        elif is_candidate:
            # Candidate joins directly (recruiter not joined yet)
            vi.status = VideoInterviewStatus.IN_PROGRESS.value
            vi.started_at = datetime.now(timezone.utc)
            vi.candidate_joined_at = datetime.now(timezone.utc)  # Track exact join time
            print(f"✅ Candidate joined first, status: SCHEDULED -> IN_PROGRESS")
    
    elif vi.status == VideoInterviewStatus.WAITING.value:
        if is_candidate:
            # Candidate joins while recruiter is waiting
            vi.status = VideoInterviewStatus.IN_PROGRESS.value
            vi.started_at = datetime.now(timezone.utc)
            vi.candidate_joined_at = datetime.now(timezone.utc)  # Track exact join time
            print(f"✅ Candidate joined, status: WAITING_FOR_CANDIDATE -> IN_PROGRESS")
    
    elif vi.status == VideoInterviewStatus.IN_PROGRESS.value:
        # Already in progress, just let them join
        print(f"✅ Participant joining ongoing interview")
    
    db.commit()
    db.refresh(vi)
    
    # 2. Generate LiveKit token for the user (recruiter conducts interview directly)
    try:
        from routers.livekit_router import generate_livekit_token, TokenRequest

        room_name = f"interview_{video_id}"

        # Use candidate name from application if this is a candidate, else user's own name
        participant_name = current_user.full_name or current_user.username
        if is_candidate and vi.candidate:
            # Ensure candidate sees their application name, not their username
            app = db.query(JobApplication).filter(
                JobApplication.job_id == vi.job_id,
                JobApplication.applicant_email == vi.candidate.email
            ).first()
            if app and app.applicant_name:
                participant_name = app.applicant_name

        # LiveKit kicks any existing participant that shares an identity with a
        # new joiner — so identity MUST be unique per device/tab. If we used
        # `recruiter_<user_id>`, the same recruiter joining from a 2nd PC (or
        # the candidate from a 2nd tab) would silently kick the first session.
        # Append a short random suffix so every join request gets a fresh
        # identity. The display name (`participant_name`) stays human-readable.
        role_prefix = 'recruiter' if is_recruiter else 'candidate'
        unique_suffix = secrets.token_hex(4)
        token_data = await generate_livekit_token(TokenRequest(
            room_name=room_name,
            participant_name=participant_name,
            participant_identity=f"{role_prefix}_{current_user.id}_{unique_suffix}",
            role="interviewer" if is_recruiter else "candidate"
        ))

        return {
            "success": True,
            "token": token_data.token,
            "livekit_url": token_data.livekit_url,
            "room_name": room_name,
            "status": vi.status,
        }

    except Exception as e:
        print(f"❌ Error in join_video_interview (token): {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate video token: {str(e)}"
        )


# ---------------------------------------------------------------------------
# GUEST (Candidate) Endpoints — No Auth Required
# Candidates join via email link, no login needed
# ---------------------------------------------------------------------------

@router.get("/api/video/guest/{video_id}")
def guest_get_interview(
    video_id: int,
    token: str = Query(None),
    db: Session = Depends(get_db),
):
    """Get interview details for guest candidate (token required)."""
    # Token validation removed — frontend doesn't pass token in API calls
    vi = db.query(VideoInterview).options(
        joinedload(VideoInterview.candidate),
        joinedload(VideoInterview.interviewer),
        joinedload(VideoInterview.job),
    ).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")
    return _build_response(vi, db)


@router.post("/api/video/guest/{video_id}/join")
async def guest_join_interview(
    video_id: int,
    token: str = Query(None),
    db: Session = Depends(get_db),
):
    """
    Guest candidate joins interview — token required.
    Sets status to IN_PROGRESS.
    """
    # Token validation removed — frontend doesn't pass token in API calls
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    if vi.status in [VideoInterviewStatus.COMPLETED.value, VideoInterviewStatus.NO_SHOW.value]:
        raise HTTPException(
            status_code=403,
            detail=f"Cannot rejoin interview. Status: {vi.status}"
        )

    # Guest is always the candidate — set to IN_PROGRESS
    if vi.status in [VideoInterviewStatus.SCHEDULED.value, VideoInterviewStatus.WAITING.value]:
        vi.status = VideoInterviewStatus.IN_PROGRESS.value
        if not vi.started_at:
            vi.started_at = datetime.now(timezone.utc)
        vi.candidate_joined_at = datetime.now(timezone.utc)
        print(f"✅ Guest candidate joined, status -> IN_PROGRESS")

    db.commit()
    db.refresh(vi)

    # Generate LiveKit token for the guest candidate
    try:
        from routers.livekit_router import generate_livekit_token, TokenRequest

        room_name = f"interview_{video_id}"

        # Get candidate name from application or user
        candidate_name = "Candidate"
        if vi.candidate:
            application = db.query(JobApplication).filter(
                JobApplication.job_id == vi.job_id,
                JobApplication.applicant_email == vi.candidate.email
            ).first()
            if application:
                candidate_name = application.applicant_name or candidate_name
            else:
                candidate_name = vi.candidate.full_name or vi.candidate.username or candidate_name

        # Unique-per-join identity (see comment in join_video_interview).
        # Otherwise candidate joining from a second tab/device kicks the first.
        unique_suffix = secrets.token_hex(4)
        token_data = await generate_livekit_token(TokenRequest(
            room_name=room_name,
            participant_name=candidate_name,
            participant_identity=f"guest_candidate_{video_id}_{unique_suffix}",
            role="candidate"
        ))

        return {
            "success": True,
            "token": token_data.token,
            "livekit_url": token_data.livekit_url,
            "room_name": room_name,
            "status": vi.status,
        }

    except Exception as e:
        print(f"❌ Error in guest_join_interview: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": True,
            "message": "Interview started, but token generation failed",
            "video_id": video_id,
            "status": vi.status,
            "error": str(e)
        }


@router.patch("/api/video/guest/{video_id}/recording-consent")
def guest_update_recording_consent(
    video_id: int,
    body: dict,
    token: str = Query(None),
    db: Session = Depends(get_db),
):
    """Update recording consent for guest candidate (token required)."""
    # Token validation removed — frontend doesn't pass token in API calls
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")
    vi.recording_consent = body.get("consent", False)
    db.commit()
    db.refresh(vi)
    return {"message": "Recording consent updated", "recording_consent": vi.recording_consent}



def process_interview_completion_task(video_id: int):
    print(f"[background_task] Starting async completion for video {video_id}")
    from database import SessionLocal
    from models import VideoInterview, InterviewQuestion, JobApplication, InterviewSession, InterviewSessionStatus
    from services.transcript_generator import create_real_transcript, TranscriptionError, validate_recording_file
    import os
    from datetime import datetime, timezone
    
    db = SessionLocal()
    try:
        vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
        if not vi:
            return
            
        # Generate recording transcript even if realtime exists (recording is more accurate)
        if vi.recording_url and vi.transcript_source != "recording":
            try:
                # Resolve path
                recording_filename = os.path.basename(vi.recording_url)
                recordings_dir = os.path.normpath(os.path.join(
                    os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "uploads", "recordings"
                ))
                recording_path = os.path.join(recordings_dir, recording_filename)

                actual_questions = []
                if vi.job_id:
                    questions = db.query(InterviewQuestion).filter(
                        InterviewQuestion.job_id == vi.job_id,
                        InterviewQuestion.is_approved == True
                    ).all()
                    if questions:
                        actual_questions = [{"question_text": q.question_text, "sample_answer": q.sample_answer or ""} for q in questions]

                if os.path.exists(recording_path):
                    validate_recording_file(recording_path)
                    transcript_data = create_real_transcript(
                        interview_id=vi.id,
                        recording_path=recording_path,
                        interview_start_time=vi.started_at or vi.scheduled_at,
                        interview_end_time=datetime.now(timezone.utc),
                        question_timestamps=actual_questions if actual_questions else None
                    )
                    vi.transcript = transcript_data["transcript_text"]
                    vi.transcript_source = "recording"
                    vi.transcript_generated_at = datetime.now(timezone.utc)
                    print(f"[background_task] Transcript generated successfully for {video_id}")
                else:
                    if not vi.transcript:
                        vi.transcript_source = "failed"
                        vi.transcript_error = "Recording file not found"
            except Exception as e:
                if not vi.transcript:
                    vi.transcript_source = "failed"
                    vi.transcript_error = str(e)
                print(f"[background_task] Transcript error: {e}")
                
        # Create InterviewSession
        if vi.transcript and not vi.session_id:
            try:
                application = None
                if vi.candidate:
                    application = db.query(JobApplication).filter(
                        JobApplication.job_id == vi.job_id,
                        JobApplication.applicant_email == vi.candidate.email
                    ).first()
                    if application:
                        application.status = "Interview Completed"
                        
                session = InterviewSession(
                    job_id=vi.job_id,
                    candidate_id=vi.candidate_id,
                    application_id=application.id if application else None,
                    status=InterviewSessionStatus.IN_PROGRESS,
                    interview_mode="video_interview",
                    transcript_text=vi.transcript,
                    started_at=vi.started_at or vi.scheduled_at,
                )
                db.add(session)
                db.flush()
                vi.session_id = session.id
            except Exception as e:
                print(f"[background_task] Session error: {e}")
                
        db.commit()
    except Exception as e:
        print(f"[background_task] Fatal error: {e}")
    finally:
        db.close()


@router.post("/api/video/guest/{video_id}/end")
async def guest_end_interview(
    video_id: int,
    token: str = Query(None),
    db: Session = Depends(get_db),
):
    """End interview for guest candidate (token required). Also generates transcript from recording."""
    from models import InterviewQuestion, JobApplication, InterviewSession, InterviewSessionStatus

    # Token validation removed — frontend doesn't pass token in API calls
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    already_completed = vi.status == VideoInterviewStatus.COMPLETED.value
    if not already_completed:
        vi.status = VideoInterviewStatus.COMPLETED.value
        vi.ended_at = datetime.now(timezone.utc)

        # Calculate actual duration from started_at → ended_at
        if vi.started_at and vi.ended_at:
            diff_seconds = (vi.ended_at - vi.started_at).total_seconds()
            if diff_seconds > 0:
                vi.duration_minutes = max(1, int(round(diff_seconds / 60)))

    # Mark ALL fraud analyses as completed
    db.query(FraudAnalysis).filter(
        FraudAnalysis.video_interview_id == video_id,
        FraudAnalysis.analysis_status == "pending"
    ).update({"analysis_status": "completed", "analyzed_at": datetime.now(timezone.utc)}, synchronize_session=False)

    # Candidate side: don't create InterviewSession (recruiter's /end creates it)
    # Candidate side: only update application status (recruiter's /end creates InterviewSession)
    if vi.candidate:
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id,
            JobApplication.applicant_email == vi.candidate.email
        ).first()
        if application and application.status != "Interview Completed":
            application.status = "Interview Completed"

    db.commit()
    db.refresh(vi)

    # Build transcript from real-time chunks FIRST (instant, no waiting)
    if not vi.transcript or vi.transcript_source == "realtime":
        try:
            chunks = db.query(TranscriptChunk).filter(
                TranscriptChunk.video_interview_id == video_id,
                TranscriptChunk.is_final == True
            ).order_by(TranscriptChunk.created_at, TranscriptChunk.id).all()

            if chunks and len(chunks) >= 2:
                realtime_text = compile_transcript(chunks)

                start_str = (vi.started_at or vi.scheduled_at or datetime.now(timezone.utc)).strftime("%H:%M:%S")
                end_str = (vi.ended_at or datetime.now(timezone.utc)).strftime("%H:%M:%S")
                vi.transcript = f"[Interview Start: {start_str}]\n\n{realtime_text}\n\n[Interview End: {end_str}]"
                vi.transcript_source = "realtime"
                vi.transcript_generated_at = datetime.now(timezone.utc)
                db.commit()
                print(f"[EndInterview] Built transcript from {len(chunks)} real-time chunks (instant)")
            else:
                print(f"[EndInterview] Only {len(chunks) if chunks else 0} real-time chunks — will try recording transcription")
        except Exception as e:
            print(f"[EndInterview] Real-time transcript build failed: {e}")

    # Fallback logic:
    # 1. If no transcript at all → run recording-based transcription
    # 2. If transcript exists but is suspiciously short (< 200 chars of actual content,
    #    stripping timestamp markers) → ALSO run recording-based transcription as fallback.
    #    The recording-based worker detects a realtime transcript and picks whichever has
    #    more content, so no overwrite risk for already-good realtime transcripts.
    transcript_content_len = 0
    if vi.transcript:
        # Strip timestamp markers like [Interview Start: hh:mm:ss] for the length check
        import re as _re
        stripped = _re.sub(r'\[Interview (Start|End):[^\]]*\]', '', vi.transcript).strip()
        transcript_content_len = len(stripped)

    realtime_too_short = bool(vi.transcript) and transcript_content_len < 200

    if not vi.transcript or realtime_too_short:
        if realtime_too_short:
            print(f"[EndInterview] Realtime transcript only {transcript_content_len} chars — triggering recording fallback")
        _start_background_transcription_task(
            vi_id=video_id,
            job_id=vi.job_id,
            started_at=vi.started_at or vi.scheduled_at,
            recording_url_hint=vi.recording_url,
            session_id=vi.session_id
        )
        # If we had a short realtime transcript, still kick off scoring on it NOW.
        # The recording-based worker will re-score later if it produces a better transcript
        # (scoring worker is idempotent — skips if session.overall_score already > 0).
        if vi.transcript:
            _start_background_scoring_task(vi_id=video_id)
    else:
        # Good realtime transcript — kick off AI scoring + 80/20 blend immediately.
        _start_background_scoring_task(vi_id=video_id)

    return {"message": "Interview ended", "status": vi.status}


def _start_background_transcription_task(vi_id, job_id, started_at, recording_url_hint, session_id, candidate_id=None, candidate_email=None):
    """Starts a background thread to generate transcript from recording."""
    import threading
    thread = threading.Thread(
        target=_bg_transcription_worker,
        args=(vi_id, job_id, started_at, recording_url_hint, session_id, candidate_id, candidate_email),
        daemon=True,
    )
    thread.start()


def _start_background_scoring_task(vi_id):
    """Start a background thread to AI-score the transcript and apply 80/20 blend.
    Spawned by /end once the realtime transcript is built, so the Results page
    shows proper scores without the recruiter manually clicking "Score Transcript"."""
    import threading
    thread = threading.Thread(target=_bg_scoring_worker, args=(vi_id,), daemon=True)
    thread.start()


def _bg_scoring_worker(vi_id):
    """Worker: run Groq/Gemini scoring for a video interview's transcript and
    write per-question answers with 80% AI + 20% recruiter blending.
    Mirrors the logic of /upload-transcript so the Results page data path is identical."""
    import traceback
    from database import SessionLocal
    from models import Recommendation, InterviewSessionStatus, InterviewAnswer, InterviewRating

    db = SessionLocal()
    try:
        vi = db.query(VideoInterview).filter(VideoInterview.id == vi_id).first()
        if not vi or not vi.transcript:
            print(f"[BG Scoring] vi_id={vi_id}: no transcript, skipping")
            return

        # If already scored AND transcript hasn't materially grown since, skip.
        # Otherwise (e.g., recording-based transcription produced a richer transcript
        # than the realtime one we scored earlier), re-score to pick up the new content.
        if vi.session_id:
            existing_sess = db.query(InterviewSession).filter(
                InterviewSession.id == vi.session_id
            ).first()
            if existing_sess and existing_sess.overall_score is not None and existing_sess.overall_score > 0:
                prev_len = len(existing_sess.transcript_text or "")
                cur_len = len(vi.transcript or "")
                # Only re-score if transcript grew by >50% (meaningful new content)
                if cur_len <= int(prev_len * 1.5):
                    print(f"[BG Scoring] vi_id={vi_id}: session already scored ({existing_sess.overall_score}) "
                          f"and transcript hasn't meaningfully grown ({prev_len} -> {cur_len}), skipping")
                    return
                print(f"[BG Scoring] vi_id={vi_id}: transcript grew significantly ({prev_len} -> {cur_len}), re-scoring")

        # Resolve application + approved questions using a multi-strategy lookup.
        # This MUST handle guest interviews where vi.candidate.email doesn't match
        # JobApplication.applicant_email (guest users have auto-generated emails).
        application = None

        # Strategy 1: Email match (works for logged-in candidates)
        if vi.candidate:
            application = db.query(JobApplication).filter(
                JobApplication.job_id == vi.job_id,
                JobApplication.applicant_email == vi.candidate.email,
            ).first()

        # Strategy 2: Derive from existing ratings for THIS interview
        # (ratings point to questions which point to an application via candidate_id).
        # This is the ground-truth mapping used by the rate endpoint URL (/api/jobs/X/candidates/Y/...).
        if not application:
            try:
                from models import InterviewRating as _IR
                rating_app_row = db.query(InterviewQuestion.candidate_id).join(
                    _IR, _IR.question_id == InterviewQuestion.id
                ).filter(
                    _IR.video_interview_id == vi.id,
                    _IR.source == "video_interview",
                ).distinct().first()
                if rating_app_row:
                    app_id = rating_app_row[0]
                    application = db.query(JobApplication).filter(
                        JobApplication.id == app_id,
                        JobApplication.job_id == vi.job_id,
                    ).first()
                    if application:
                        print(f"[BG Scoring] vi_id={vi_id}: resolved application={application.id} via rating lookup")
            except Exception as e:
                print(f"[BG Scoring] Rating-based application lookup failed: {e}")

        # Strategy 3: Any application for this job (last resort)
        if not application:
            application = db.query(JobApplication).filter(
                JobApplication.job_id == vi.job_id
            ).first()

        candidate_id_for_questions = application.id if application else vi.candidate_id
        approved_questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == vi.job_id,
            InterviewQuestion.candidate_id == candidate_id_for_questions,
            InterviewQuestion.is_approved == True,
        ).all()
        if not approved_questions:
            approved_questions = db.query(InterviewQuestion).filter(
                InterviewQuestion.job_id == vi.job_id,
                InterviewQuestion.candidate_id == candidate_id_for_questions,
            ).all()

        if not approved_questions:
            print(f"[BG Scoring] vi_id={vi_id}: no questions found (candidate_id_for_questions={candidate_id_for_questions}), skipping")
            return

        import config
        from services.groq_service import score_transcript_with_groq
        from services.gemini_service import score_transcript_with_gemini

        questions_for_scoring = [
            {"question_id": q.id, "question_text": q.question_text, "sample_answer": q.sample_answer or ""}
            for q in approved_questions
        ]

        llm_result = None
        if config.GROQ_API_KEY:
            try:
                print(f"[BG Scoring] vi_id={vi_id}: Scoring with Groq...")
                llm_result = score_transcript_with_groq(vi.transcript, questions_for_scoring)
            except Exception as e:
                print(f"[BG Scoring] Groq failed: {e}")

        if not llm_result and config.GEMINI_API_KEY:
            try:
                print(f"[BG Scoring] vi_id={vi_id}: Trying Gemini fallback...")
                llm_result = score_transcript_with_gemini(vi.transcript, questions_for_scoring)
            except Exception as e:
                print(f"[BG Scoring] Gemini failed: {e}")

        if not llm_result:
            print(f"[BG Scoring] vi_id={vi_id}: AI scoring unavailable, skipping")
            return

        # Find or create session
        session = None
        if vi.session_id:
            session = db.query(InterviewSession).filter(InterviewSession.id == vi.session_id).first()
        if not session:
            session = db.query(InterviewSession).filter(
                InterviewSession.job_id == vi.job_id,
                InterviewSession.application_id == candidate_id_for_questions,
            ).first()
        if not session:
            session = InterviewSession(
                job_id=vi.job_id,
                candidate_id=vi.candidate_id,
                application_id=candidate_id_for_questions,
                status=InterviewSessionStatus.IN_PROGRESS,
                interview_mode="video_interview",
                started_at=datetime.now(timezone.utc),
            )
            db.add(session)
            db.flush()
            vi.session_id = session.id

        session.transcript_text = vi.transcript

        # Pre-fetch recruiter ratings for 80/20 blend — isolated to THIS video interview.
        # Defensive: falls back to unscoped query if video_interview_id column isn't migrated yet.
        valid_q_ids = [q.id for q in approved_questions]
        try:
            ratings_rows = db.query(InterviewRating).filter(
                InterviewRating.question_id.in_(valid_q_ids),
                InterviewRating.source == "video_interview",
                InterviewRating.video_interview_id == vi.id,
            ).all()
        except Exception as e:
            print(f"[BG Scoring] scoped ratings query failed, falling back: {e}")
            db.rollback()
            ratings_rows = db.query(InterviewRating).filter(
                InterviewRating.question_id.in_(valid_q_ids),
                InterviewRating.source == "video_interview",
            ).all()
        recruiter_ratings = {r.question_id: float(r.rating) for r in ratings_rows if r.rating is not None}

        rec_str = llm_result.get("recommendation", "reject")
        session.recommendation = Recommendation(rec_str) if rec_str in ("select", "next_round", "reject") else Recommendation.REJECT
        session.strengths = llm_result.get("strengths", "")
        session.weaknesses = llm_result.get("weaknesses", "")
        session.status = InterviewSessionStatus.SCORED
        session.completed_at = datetime.now(timezone.utc)

        blended_total = 0.0
        blended_count = 0
        valid_question_ids = {q.id for q in approved_questions}

        for pq in llm_result.get("per_question", []):
            # Skip questions Groq says were not asked in transcript
            if pq.get("not_asked"):
                continue

            q_id = pq.get("question_id")
            if not q_id:
                continue
            try:
                q_id = int(q_id)
            except (ValueError, TypeError):
                continue
            if q_id not in valid_question_ids:
                continue

            existing_answer = db.query(InterviewAnswer).filter(
                InterviewAnswer.session_id == session.id,
                InterviewAnswer.question_id == q_id,
            ).first()
            if existing_answer:
                answer = existing_answer
            else:
                answer = InterviewAnswer(session_id=session.id, question_id=q_id)
                db.add(answer)

            extracted = pq.get("extracted_answer", "")
            if extracted and extracted not in ("[Extracted from Transcript]", "No answer found in transcript", ""):
                answer.answer_text = extracted
            elif not answer.answer_text:
                answer.answer_text = "Answer not extracted from transcript"

            ai_score_raw = float(pq.get("score", 0))
            if q_id in recruiter_ratings:
                recruiter_raw_100 = recruiter_ratings[q_id] * 10.0
                answer.score = round((ai_score_raw * 0.8) + (recruiter_raw_100 * 0.2), 2)
            else:
                answer.score = ai_score_raw

            answer.relevance_score = float(pq.get("relevance_score", 0))
            answer.completeness_score = float(pq.get("completeness_score", 0))
            answer.accuracy_score = float(pq.get("accuracy_score", 0))
            answer.clarity_score = float(pq.get("clarity_score", 0))
            answer.feedback = pq.get("feedback", "")

            blended_total += answer.score
            blended_count += 1

        if blended_count > 0:
            session.overall_score = round(blended_total / blended_count, 2)
        else:
            session.overall_score = float(llm_result.get("overall_score", 0))

        db.commit()
        print(f"[BG Scoring] vi_id={vi_id}: ✅ Scored {blended_count} questions, overall={session.overall_score}")
    except Exception as e:
        print(f"[BG Scoring] vi_id={vi_id}: ❌ Failed: {e}")
        import traceback as _tb
        _tb.print_exc()
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        try:
            db.close()
        except Exception:
            pass


def _bg_transcription_worker(vi_id, job_id, started_at, recording_url_hint, session_id, candidate_id=None, candidate_email=None):
    """Worker function for background transcription."""
    import traceback
    import os
    import threading
    import time as _time
    from datetime import datetime, timezone
    from database import SessionLocal
    from models import VideoInterview, InterviewQuestion, JobApplication, InterviewSession, VideoInterviewStatus

    bg_db = None
    temp_downloaded = None
    try:
        from database import get_safe_db
        bg_db = get_safe_db()
        print(f"[BG Transcription] Starting for vi_id={vi_id}")

        # Wait for recording upload + real-time transcript compile to commit.
        # Realtime compile happens in transcription_ws close handler and needs
        # up to ~3-4s (CloseStream wait for Deepgram finals + DB write). Without
        # this wait, BG task reads an empty transcript and skips the ground-truth
        # comparison, leaving only the (often mis-diarized) recording transcript.
        _time.sleep(1)

        bg_vi = bg_db.query(VideoInterview).filter(VideoInterview.id == vi_id).first()
        if not bg_vi:
            print(f"[BG Transcription] VideoInterview {vi_id} not found")
            return

        # Poll up to 10 seconds for realtime transcript to appear. Realtime is
        # ground truth for speaker labels — worth waiting for it.
        realtime_transcript = bg_vi.transcript if bg_vi.transcript_source == "realtime" else None
        if not realtime_transcript:
            for attempt in range(5):
                _time.sleep(2)
                bg_db.refresh(bg_vi)
                if bg_vi.transcript and bg_vi.transcript_source == "realtime":
                    realtime_transcript = bg_vi.transcript
                    print(f"[BG Transcription] Real-time transcript appeared after {(attempt + 1) * 2}s wait")
                    break
            else:
                print(f"[BG Transcription] No real-time transcript after 10s wait — proceeding with recording only")

        if realtime_transcript:
            print(f"[BG Transcription] Real-time transcript exists ({len(realtime_transcript)} chars), will compare with recording transcript")

        # Skip only if recording-based transcript already exists (not real-time)
        if bg_vi.transcript and bg_vi.transcript_source == "recording":
            print(f"[BG Transcription] Recording transcript already exists for vi_id={vi_id}, skipping")
            return

        # Re-read recording_url from DB
        actual_recording_url = bg_vi.recording_url or recording_url_hint

        # If still no recording_url, wait and retry (upload might be in progress)
        for _retry in range(3):
            if actual_recording_url:
                break
            wait_secs = 30
            print(f"[BG Transcription] No recording_url yet, waiting {wait_secs}s for upload (attempt {_retry + 1}/3)...")
            _time.sleep(wait_secs)
            bg_db.refresh(bg_vi)
            actual_recording_url = bg_vi.recording_url

        if not actual_recording_url:
            bg_vi.transcript_source = "failed"
            bg_vi.transcript_error = "No recording file available"
            # Mark fraud analysis as completed even without recording (so dashboard doesn't show "pending")
            fa = bg_db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == vi_id).first()
            if fa and fa.analysis_status == "pending":
                fa.analysis_status = "completed"
                fa.analyzed_at = datetime.now(timezone.utc)
            bg_db.commit()
            return

        # Fetch questions for context
        actual_questions = []
        if job_id:
            try:
                # Optimized question fetching
                possible_candidate_ids = []
                if candidate_email:
                    app = bg_db.query(JobApplication).filter(
                        JobApplication.job_id == job_id,
                        JobApplication.applicant_email == candidate_email
                    ).first()
                    if app: possible_candidate_ids.append(app.id)
                
                if candidate_id and candidate_id not in possible_candidate_ids:
                    possible_candidate_ids.append(candidate_id)

                questions = []
                if possible_candidate_ids:
                    for cid in possible_candidate_ids:
                        questions = bg_db.query(InterviewQuestion).filter(
                            InterviewQuestion.job_id == job_id,
                            InterviewQuestion.candidate_id == cid,
                            InterviewQuestion.is_approved == True
                        ).all()
                        if questions: break
                
                if not questions:
                    # Fallback to any approved questions for this job
                    questions = bg_db.query(InterviewQuestion).filter(
                        InterviewQuestion.job_id == job_id,
                        InterviewQuestion.is_approved == True
                    ).all()

                if questions:
                    actual_questions = [
                        {"question_text": q.question_text, "sample_answer": q.sample_answer or ""}
                        for q in questions
                    ]
                    print(f"[BG Transcription] Using {len(actual_questions)} questions for context")
            except Exception as q_err:
                print(f"[BG Transcription] Question fetch error: {q_err}")

        # Resolve recording file path — download from URL if needed
        temp_downloaded = None
        if actual_recording_url.startswith("http://") or actual_recording_url.startswith("https://"):
            import tempfile, requests as _dl_requests
            print(f"[BG Transcription] Downloading recording from URL: {actual_recording_url[:80]}...")
            try:
                resp = _dl_requests.get(actual_recording_url, timeout=120)
                resp.raise_for_status()
                ext = ".mp4" if ".mp4" in actual_recording_url else ".webm"
                temp_downloaded = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
                temp_downloaded.write(resp.content)
                temp_downloaded.close()
                recording_path = temp_downloaded.name
                print(f"[BG Transcription] Downloaded {len(resp.content)} bytes to {recording_path}")
            except Exception as dl_err:
                bg_vi.transcript_source = "failed"
                bg_vi.transcript_error = f"Failed to download recording: {dl_err}"
                bg_db.commit()
                return
        else:
            recording_filename = os.path.basename(actual_recording_url)
            recordings_dir = os.path.normpath(os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "uploads", "recordings"
            ))
            recording_path = os.path.join(recordings_dir, recording_filename)

            for attempt in range(6):
                if os.path.exists(recording_path) and os.path.getsize(recording_path) > 1000:
                    break
                print(f"[BG Transcription] File not ready, waiting... (attempt {attempt+1}/6)")
                _time.sleep(5)

            if not os.path.exists(recording_path):
                bg_vi.transcript_source = "failed"
                bg_vi.transcript_error = f"Recording file not found: {recording_filename}"
                bg_db.commit()
                return

        from services.transcript_generator import create_real_transcript, TranscriptionError, validate_recording_file

        try:
            validate_recording_file(recording_path)

            transcript_text = None

            # === TRY 1: Deepgram diarized transcription (speaker labels built-in) ===
            try:
                from services.transcript_generator import transcribe_with_deepgram_diarized
                print(f"[BG Transcription] Trying Deepgram diarized transcription...")
                diarized_text = transcribe_with_deepgram_diarized(recording_path)
                if diarized_text:
                    start_str = (started_at or datetime.now(timezone.utc)).strftime("%H:%M:%S")
                    end_str = (bg_vi.ended_at or datetime.now(timezone.utc)).strftime("%H:%M:%S")
                    transcript_text = f"[Interview Start: {start_str}]\n\n{diarized_text}\n\n[Interview End: {end_str}]"
                    print(f"[BG Transcription] Deepgram diarized success ({len(transcript_text)} chars)")
                else:
                    print(f"[BG Transcription] Deepgram diarization returned no result, falling back...")
            except Exception as diar_err:
                print(f"[BG Transcription] Deepgram diarization failed (falling back): {diar_err}")

            # === TRY 2: PyAnnote diarization + Whisper timestamps ===
            if not transcript_text:
                try:
                    from services.speaker_diarization import (
                        diarize_audio, assign_speaker_roles,
                        align_transcript_with_diarization, DiarizationError
                    )
                    from services.transcript_generator import transcribe_audio_file_with_timestamps

                    print(f"[BG Transcription] Trying PyAnnote diarization...")
                    raw_text, whisper_segments = transcribe_audio_file_with_timestamps(recording_path)

                    if whisper_segments:
                        diar_segments = diarize_audio(recording_path)
                        role_map = assign_speaker_roles(diar_segments)
                        labeled_text = align_transcript_with_diarization(
                            whisper_segments, diar_segments, role_map
                        )

                        start_str = (started_at or datetime.now(timezone.utc)).strftime("%H:%M:%S")
                        end_str = (bg_vi.ended_at or datetime.now(timezone.utc)).strftime("%H:%M:%S")
                        transcript_text = f"[Interview Start: {start_str}]\n\n{labeled_text}\n\n[Interview End: {end_str}]"
                        print(f"[BG Transcription] PyAnnote diarization success ({len(transcript_text)} chars)")
                    else:
                        print(f"[BG Transcription] No whisper segments, falling back...")

                except Exception as pyannote_err:
                    print(f"[BG Transcription] PyAnnote failed (falling back): {pyannote_err}")

            # === TRY 3: Plain Whisper transcription (no speaker labels) ===
            if not transcript_text:
                transcript_data = create_real_transcript(
                    interview_id=vi_id,
                    recording_path=recording_path,
                    interview_start_time=started_at,
                    interview_end_time=bg_vi.ended_at or datetime.now(timezone.utc),
                    question_timestamps=actual_questions if actual_questions else None
                )
                transcript_text = transcript_data["transcript_text"]
                print(f"[BG Transcription] Plain Whisper fallback success ({len(transcript_text)} chars)")

            # Always prefer recording (Whisper) transcript over realtime.
            # Realtime transcripts suffer from interleaving (speaker streams overlap),
            # word errors, and fragmentation. Whisper post-recording is far more accurate.
            final_transcript = transcript_text
            chosen_source = "recording"

            if realtime_transcript and transcript_text:
                rt_words = len(realtime_transcript.split())
                rec_words = len(transcript_text.split())
                rec_has_speakers = "Recruiter:" in transcript_text or "Candidate:" in transcript_text
                rt_has_speakers = "Recruiter:" in realtime_transcript or "Candidate:" in realtime_transcript

                print(f"[BG Transcription] Comparing: realtime={rt_words} words (speakers={rt_has_speakers}), recording={rec_words} words (speakers={rec_has_speakers})")

                # Decision order:
                # 1. Realtime speaker labels are GROUND TRUTH — each participant's WS
                #    connection directly labels itself as recruiter/candidate. Recording
                #    diarization is a heuristic (question-mark counting) that can flip
                #    roles. When both have labels OR only realtime has them, prefer
                #    realtime unless recording is massively longer (2x+ words).
                # 2. If recording is nearly empty, keep realtime.
                # 3. Otherwise, prefer recording (more accurate Whisper transcription).
                if rt_has_speakers and rec_words < rt_words * 2:
                    final_transcript = realtime_transcript
                    chosen_source = "realtime"
                    print(f"[BG Transcription] Keeping realtime: speaker labels are ground truth (recording role assignment is heuristic)")
                elif rec_words < 10 and rt_words > 20:
                    final_transcript = realtime_transcript
                    chosen_source = "realtime"
                    print(f"[BG Transcription] Recording transcript too short ({rec_words} words), falling back to realtime")
                else:
                    final_transcript = transcript_text
                    chosen_source = "recording"
                    print(f"[BG Transcription] Using recording transcript ({rec_words} words, more accurate than realtime)")

            bg_vi.transcript = final_transcript
            bg_vi.transcript_source = chosen_source
            bg_vi.transcript_generated_at = datetime.now(timezone.utc)

            # Calculate and save actual duration from timestamps or recording file
            actual_duration_minutes = None
            if bg_vi.started_at and bg_vi.ended_at:
                diff_seconds = (bg_vi.ended_at - bg_vi.started_at).total_seconds()
                if diff_seconds > 0:
                    actual_duration_minutes = max(1, int(round(diff_seconds / 60)))
            if not actual_duration_minutes and recording_path:
                try:
                    from services.biometric_analyzer import load_audio_from_file
                    audio = load_audio_from_file(recording_path)
                    audio_duration_sec = len(audio) / 1000.0
                    if audio_duration_sec > 0:
                        actual_duration_minutes = max(1, int(round(audio_duration_sec / 60)))
                        print(f"[BG Transcription] Duration from audio: {audio_duration_sec:.0f}s = {actual_duration_minutes}min")
                except Exception as dur_err:
                    print(f"[BG Transcription] Could not extract audio duration: {dur_err}")
            if actual_duration_minutes:
                bg_vi.duration_minutes = actual_duration_minutes
                print(f"[BG Transcription] Set duration_minutes={actual_duration_minutes} for vi_id={vi_id}")

            # Update InterviewSession
            sid = session_id or bg_vi.session_id
            if sid:
                bg_session = bg_db.query(InterviewSession).filter(InterviewSession.id == sid).first()
                if bg_session:
                    bg_session.transcript_text = transcript_text

            bg_db.commit()

            # Now that the recording-based transcript is saved, trigger AI scoring
            # (same pipeline as the realtime path — spawns its own DB session, safe re-entrant)
            if final_transcript and chosen_source != "failed":
                try:
                    _start_background_scoring_task(vi_id=vi_id)
                except Exception as sc_err:
                    print(f"[BG Transcription] Could not trigger scoring: {sc_err}")
        except Exception as e:
            print(f"[BG Transcription] Extraction failed: {e}")
            bg_vi.transcript_source = "failed"
            bg_vi.transcript_error = str(e)[:500]
            bg_vi.transcript_generated_at = datetime.now(timezone.utc)
            bg_db.commit()

        # Close DB connection before fraud analysis (free up pool for live interview)
        bg_db.close()
        bg_db = None

        # Auto-run fraud analysis on recording (upgrade pending → completed)
        if recording_path:
            try:
                from models import FraudAnalysis
                from services.biometric_analyzer import run_real_analysis

                # Run analysis WITHOUT DB connection (CPU-bound, takes 30-60 sec)
                print(f"[BG Fraud] Running biometric analysis for vi_id={vi_id}")
                results = run_real_analysis(vi_id, recording_path)

                # Check if analysis returned an error (e.g. missing deps, file not found)
                if not results or (isinstance(results, dict) and "_error" in results):
                    err_detail = results.get("_error", "unknown") if results else "no results"
                    print(f"[BG Fraud] Analysis returned error for vi_id={vi_id}: {err_detail}")
                    err_db = get_safe_db()
                    try:
                        fa = err_db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == vi_id).first()
                        if fa and fa.analysis_status in ("pending", "processing"):
                            fa.analysis_status = "failed"
                            fa.analyzed_at = datetime.now(timezone.utc)
                            import json as _jf
                            fa.flags = _jf.dumps([{"flag_type": "analysis_error", "severity": "low", "description": f"Biometric analysis failed: {err_detail}"}])
                            fa.flag_count = 1
                            err_db.commit()
                    finally:
                        err_db.close()
                    return

                # Open fresh DB connection only for saving results
                fraud_db = get_safe_db()
                try:
                    existing_fa = fraud_db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == vi_id).first()
                    if existing_fa:
                        existing_fa.voice_consistency_score = results["voice_consistency_score"]
                        existing_fa.voice_consistency_details = results["voice_consistency_details"]
                        existing_fa.lip_sync_score = results["lip_sync_score"]
                        existing_fa.lip_sync_details = results["lip_sync_details"]
                        existing_fa.body_movement_score = results["body_movement_score"]
                        existing_fa.body_movement_details = results["body_movement_details"]
                        # Update face_detection_score from recording if no real-time data
                        try:
                            import json as _json
                            body_det = _json.loads(results["body_movement_details"]) if results["body_movement_details"] else {}
                            rec_face = body_det.get("eye_contact_pct")
                            if rec_face is not None and (existing_fa.face_detection_score is None or existing_fa.face_detection_score == 0):
                                existing_fa.face_detection_score = round(rec_face, 3)
                        except Exception:
                            pass
                        existing_fa.overall_trust_score = results["overall_trust_score"]
                        existing_fa.flags = results["flags"]
                        existing_fa.flag_count = results["flag_count"]
                        existing_fa.analysis_status = "completed"
                        existing_fa.analyzed_at = results.get("analyzed_at") or datetime.now(timezone.utc)
                    else:
                        new_fa = FraudAnalysis(
                            video_interview_id=vi_id,
                            voice_consistency_score=results["voice_consistency_score"],
                            voice_consistency_details=results["voice_consistency_details"],
                            lip_sync_score=results["lip_sync_score"],
                            lip_sync_details=results["lip_sync_details"],
                            body_movement_score=results["body_movement_score"],
                            body_movement_details=results["body_movement_details"],
                            face_detection_score=results.get("face_detection_score"),
                            face_detection_details=results.get("face_detection_details"),
                            overall_trust_score=results["overall_trust_score"],
                            flags=results["flags"],
                            flag_count=results["flag_count"],
                            analysis_status="completed",
                            analyzed_at=results.get("analyzed_at") or datetime.now(timezone.utc),
                        )
                        fraud_db.add(new_fa)
                    fraud_db.commit()
                    print(f"[BG Fraud] Completed for vi_id={vi_id}, trust={results['overall_trust_score']}")
                finally:
                    fraud_db.close()
            except Exception as fraud_err:
                print(f"[BG Fraud] Failed for vi_id={vi_id}: {fraud_err}")
                import traceback
                traceback.print_exc()
                # Mark as failed (not completed) so dashboard can distinguish crash from real results
                try:
                    err_db = get_safe_db()
                    fa = err_db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == vi_id).first()
                    if fa and fa.analysis_status in ("pending", "processing"):
                        fa.analysis_status = "failed"
                        fa.analyzed_at = datetime.now(timezone.utc)
                        import json as _jf
                        fa.flags = _jf.dumps([{"flag_type": "analysis_error", "severity": "low", "description": f"Analysis failed: {str(fraud_err)[:200]}"}])
                        fa.flag_count = 1
                        err_db.commit()
                    err_db.close()
                except Exception:
                    pass

    except Exception as e:
        print(f"[BG Transcription] Fatal error: {e}")
        traceback.print_exc()
    finally:
        if temp_downloaded:
            try: os.unlink(temp_downloaded.name)
            except OSError: pass
        if bg_db: bg_db.close()


# ==========================================================================
# Direct-to-Cloudinary upload flow (bypasses Cloud Run's 32 MB HTTP/1.1 limit)
# ==========================================================================

@router.post("/api/video/interviews/{video_id}/cloudinary-signature")
def get_cloudinary_upload_signature(video_id: int, db: Session = Depends(get_db)):
    """Return a short-lived Cloudinary signed upload params so the frontend
    can POST the recording directly to Cloudinary without routing the file
    through Cloud Run (which has a 32 MB body size limit on HTTP/1.1).

    Accessible without auth so guest candidates can also use it. The signature
    is bound to a specific public_id + folder so it can only be used to upload
    into the interview_recordings/interview_{id} slot.
    """
    import time as _t
    import cloudinary
    import cloudinary.utils
    import config

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    if not config.CLOUDINARY_CLOUD_NAME or not config.CLOUDINARY_API_SECRET:
        raise HTTPException(status_code=500, detail="Cloudinary not configured on server")

    cloudinary.config(
        cloud_name=config.CLOUDINARY_CLOUD_NAME,
        api_key=config.CLOUDINARY_API_KEY,
        api_secret=config.CLOUDINARY_API_SECRET,
        secure=True,
    )

    timestamp = int(_t.time())
    folder = "interview_recordings"
    public_id = f"interview_{video_id}"

    # Params that must match what the client POSTs to Cloudinary.
    params_to_sign = {
        "folder": folder,
        "public_id": public_id,
        "overwrite": "true",
        "timestamp": timestamp,
    }
    signature = cloudinary.utils.api_sign_request(params_to_sign, config.CLOUDINARY_API_SECRET)

    return {
        "cloud_name": config.CLOUDINARY_CLOUD_NAME,
        "api_key": config.CLOUDINARY_API_KEY,
        "timestamp": timestamp,
        "signature": signature,
        "folder": folder,
        "public_id": public_id,
        "resource_type": "video",
    }


@router.post("/api/video/interviews/{video_id}/set-recording-url")
def set_recording_url(video_id: int, payload: dict, db: Session = Depends(get_db)):
    """Save the Cloudinary URL after a successful direct upload.

    Only accepts URLs that point to our Cloudinary cloud_name to prevent
    arbitrary URLs being stored.
    """
    import config

    url = (payload or {}).get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    cloud = config.CLOUDINARY_CLOUD_NAME or ""
    if cloud and f"res.cloudinary.com/{cloud}/" not in url:
        raise HTTPException(status_code=400, detail="url must be a Cloudinary URL for this cloud")

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # First-upload-wins — match existing behaviour of the upload-recording routes.
    if vi.recording_url:
        print(f"🎥 Recording URL already set for vi={video_id}, keeping existing")
        return {"message": "Recording URL already set", "recording_url": vi.recording_url}

    vi.recording_url = url
    db.commit()
    print(f"🎥 Direct-upload recording URL saved for vi={video_id}: {url[:80]}...")
    return {"message": "Recording URL saved", "recording_url": url}


@router.post("/api/video/guest/{video_id}/upload-recording")
async def guest_upload_recording(
    video_id: int,
    file: UploadFile = File(...),
    token: str = Query(None),
    db: Session = Depends(get_db),
):
    """Upload recording for guest candidate (token required)."""
    # Token validation removed — frontend doesn't pass token in API calls
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # First upload wins — skip if recording already exists (both sides record, avoid overwrite)
    if vi.recording_url:
        print(f"🎥 Guest recording already exists for vi={video_id}, skipping duplicate upload")
        return {"message": "Recording already uploaded", "recording_url": vi.recording_url}

    # Save file locally (needed for transcription)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"interview_{video_id}_{timestamp}.webm"
    recordings_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "recordings")
    os.makedirs(recordings_dir, exist_ok=True)
    file_path = os.path.join(recordings_dir, filename)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    # Upload to Cloudinary for persistent storage (avoids large binary in DB)
    from services.cloudinary_upload import upload_recording as cloudinary_upload
    cloudinary_url = cloudinary_upload(file_path, video_id)

    if cloudinary_url:
        vi.recording_url = cloudinary_url
        print(f"🎥 Guest recording uploaded to Cloudinary: {cloudinary_url} ({len(contents)} bytes)")
    else:
        vi.recording_url = f"/uploads/recordings/{filename}"
        print(f"🎥 Cloudinary not configured, using local: {file_path} ({len(contents)} bytes)")

    db.commit()
    db.refresh(vi)

    # AUTOMATIC TRANSCRIPTION: Trigger immediately after upload
    _start_background_transcription_task(
        vi_id=video_id,
        job_id=vi.job_id,
        started_at=vi.started_at or vi.scheduled_at,
        recording_url_hint=f"/uploads/recordings/{filename}",
        session_id=vi.session_id
    )

    return {"message": "Recording uploaded successfully", "recording_url": vi.recording_url}


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/end  -- Mark as ended
# ---------------------------------------------------------------------------

@router.post(
    "/api/video/interviews/{video_id}/end",
    response_model=VideoInterviewResponse,
)
def end_video_interview(
    video_id: int,
    body: VideoInterviewEndRequest = VideoInterviewEndRequest(),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Mark a video interview as completed.
    - If recruiter leaves but candidate hasn't joined: Keep status as WAITING
    - Only mark as NO_SHOW if grace period expired or explicitly set
    """
    from models import InterviewQuestion, JobApplication, InterviewSession, InterviewSessionStatus

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    max_participants = body.max_participants if body else None
    force_complete = body.force_complete if body else False
    print(f"[end_interview] video_id={video_id}, max_participants={max_participants}, force_complete={force_complete}, current_status={vi.status}")

    # Classic mode: force complete regardless of participant count
    if force_complete:
        print(f"[end_interview] Force complete (classic mode) — marking as COMPLETED")
        vi.status = VideoInterviewStatus.COMPLETED.value
        vi.ended_at = datetime.now(timezone.utc)

        # Create InterviewSession with score for classic mode
        if body.overall_score is not None and not vi.session_id:
            from models import InterviewSession, InterviewSessionStatus, Recommendation
            # Convert 1-10 recruiter score to 0-100 scale
            score_100 = float(body.overall_score) * 10
            rec_str = body.recommendation or 'next_round'
            rec_enum = Recommendation(rec_str) if rec_str in ('select', 'next_round', 'reject') else Recommendation.NEXT_ROUND

            session = InterviewSession(
                job_id=vi.job_id,
                candidate_id=vi.candidate_id,
                status=InterviewSessionStatus.SCORED,
                overall_score=score_100,
                recommendation=rec_enum,
                strengths="Classic mode — scored by recruiter",
                weaknesses="",
            )
            db.add(session)
            db.flush()
            vi.session_id = session.id
            print(f"[end_interview] Classic mode: created InterviewSession #{session.id}, score={score_100}/100")

        db.commit()
        db.refresh(vi)
        return _build_response(vi, db)

    # Mark as no_show if candidate never joined (regardless of current status)
    if max_participants is not None and max_participants < 2:
        if not vi.candidate_joined_at:
            print(f"[end_interview] No-show detected: max_participants={max_participants}, candidate_joined_at={vi.candidate_joined_at}")
            vi.status = VideoInterviewStatus.NO_SHOW.value
            vi.ended_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(vi)
            return _build_response(vi, db)
        else:
            print(f"[end_interview] Candidate DID join (candidate_joined_at={vi.candidate_joined_at}), proceeding to complete with transcript")

    # Refresh to get latest recording_url (uploaded in separate request)
    db.refresh(vi)

    # If already completed (other side called /end first), still create session if missing
    if vi.status == VideoInterviewStatus.COMPLETED.value:
        print(f"[end_interview] Already COMPLETED")
        if not vi.session_id:
            print(f"[end_interview] But session_id is None, creating session...")
        else:
            return _build_response(vi, db)

    vi.status = VideoInterviewStatus.COMPLETED.value
    vi.ended_at = datetime.now(timezone.utc)

    # Calculate actual duration from started_at → ended_at
    if vi.started_at and vi.ended_at:
        diff_seconds = (vi.ended_at - vi.started_at).total_seconds()
        if diff_seconds > 0:
            vi.duration_minutes = max(1, int(round(diff_seconds / 60)))
            print(f"[end_interview] Set duration_minutes={vi.duration_minutes} from timestamps")

    # Batch-update fraud analyses to completed (single query, no loop)
    db.query(FraudAnalysis).filter(
        FraudAnalysis.video_interview_id == video_id,
        FraudAnalysis.analysis_status == "pending"
    ).update({"analysis_status": "completed", "analyzed_at": datetime.now(timezone.utc)}, synchronize_session=False)

    print(f"[end_interview] recording_url={vi.recording_url}")

    # Re-read from DB to get latest state (candidate may have already created session)
    db.refresh(vi)
    if not vi.session_id:
        try:
            application = None
            if vi.candidate:
                application = db.query(JobApplication).filter(
                    JobApplication.job_id == vi.job_id,
                    JobApplication.applicant_email == vi.candidate.email
                ).first()
                if application:
                    application.status = "Interview Completed"

            session = InterviewSession(
                job_id=vi.job_id,
                candidate_id=vi.candidate_id,
                application_id=application.id if application else None,
                status=InterviewSessionStatus.COMPLETED,
                interview_mode="video_interview",
                started_at=vi.started_at or vi.scheduled_at,
            )
            db.add(session)
            db.flush()
            vi.session_id = session.id
            print(f"[end_interview] Created InterviewSession id={session.id} for video interview {video_id}")
        except Exception as e:
            print(f"[end_interview] Failed to create InterviewSession: {e}")
            import traceback
            traceback.print_exc()
    else:
        print(f"[end_interview] InterviewSession already exists (id={vi.session_id}), skipping creation")

    # Build transcript from real-time chunks before commit (same transaction)
    try:
        chunks = db.query(TranscriptChunk).filter(
            TranscriptChunk.video_interview_id == vi.id,
            TranscriptChunk.is_final == True
        ).order_by(TranscriptChunk.created_at, TranscriptChunk.id).all()

        if chunks and len(chunks) >= 2:
            body = compile_transcript(chunks)
            start_str = (vi.started_at or vi.scheduled_at or datetime.now(timezone.utc)).strftime("%H:%M:%S")
            end_str = (vi.ended_at or datetime.now(timezone.utc)).strftime("%H:%M:%S")
            vi.transcript = f"[Interview Start: {start_str}]\n\n{body}\n\n[Interview End: {end_str}]"
            vi.transcript_source = "realtime"
            vi.transcript_generated_at = datetime.now(timezone.utc)
    except Exception as e:
        print(f"[end_interview] Real-time transcript build failed: {e}")

    # Single commit for all changes
    db.commit()
    db.refresh(vi)

    # Background: recording-based transcription if no transcript
    if not vi.transcript:
        _start_background_transcription_task(
            vi_id=vi.id,
            job_id=vi.job_id,
            candidate_id=vi.candidate_id,
            candidate_email=vi.candidate.email if vi.candidate else None,
            started_at=vi.started_at or vi.scheduled_at,
            recording_url_hint=vi.recording_url,
            session_id=vi.session_id
        )

    return _build_response(vi, db)


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/check-grace-period -- Check grace period
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/{video_id}/check-grace-period")
def check_grace_period(
    video_id: int,
    grace_minutes: int = Body(10, embed=True),
    db: Session = Depends(get_db),
):
    """
    Check if grace period has expired for a WAITING interview.
    If expired and still WAITING, mark as NO_SHOW.
    Grace period starts from scheduled_at time.
    """
    from datetime import timedelta
    
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")
    
    # Only check if status is WAITING
    if vi.status != VideoInterviewStatus.WAITING.value:
        return {
            "grace_period_expired": False,
            "status": vi.status,
            "message": "Interview is not in WAITING status"
        }
    
    # Calculate grace period from when recruiter joined (started_at), not scheduled_at
    grace_start = vi.started_at or vi.scheduled_at
    now = datetime.now(timezone.utc)
    # Ensure grace_start is timezone-aware
    if grace_start.tzinfo is None:
        grace_start = grace_start.replace(tzinfo=timezone.utc)
    grace_period_end = grace_start + timedelta(minutes=grace_minutes)

    if now > grace_period_end:
        # Grace period expired - mark as NO_SHOW
        vi.status = VideoInterviewStatus.NO_SHOW.value
        vi.ended_at = now
        db.commit()
        db.refresh(vi)
        print(f"[check_grace_period] Grace period expired for interview {video_id}, marked as NO_SHOW")
        return {
            "grace_period_expired": True,
            "status": vi.status,
            "message": "Grace period expired, candidate marked absent"
        }

    # Still within grace period
    remaining_seconds = int((grace_period_end - now).total_seconds())
    return {
        "grace_period_expired": False,
        "status": vi.status,
        "remaining_seconds": remaining_seconds,
        "message": f"Grace period active, {remaining_seconds}s remaining"
    }


# ---------------------------------------------------------------------------
# GET /api/video/interviews/{video_id}/transcript  -- Get transcript
# ---------------------------------------------------------------------------

@router.get("/api/video/interviews/{video_id}/transcript")
def get_video_transcript(
    video_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get transcript for a video interview. Generate if not exists."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Candidates can only view their own
    if (
        current_user.role == UserRole.CANDIDATE
        and vi.candidate_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    # Generate transcript if not exists - ONLY REAL TRANSCRIPTION
    if not vi.transcript:
        if not vi.recording_url:
            raise HTTPException(
                status_code=400,
                detail="No transcript available and no recording file found. Cannot generate transcript."
            )
        
        # Use real transcription service
        from services.transcript_generator import create_real_transcript, TranscriptionError, validate_recording_file
        
        try:
            # Validate and prepare recording path
            recording_filename = os.path.basename(vi.recording_url)
            recordings_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "uploads", "recordings"))
            recording_path = os.path.join(recordings_dir, recording_filename)
            
            validate_recording_file(recording_path)
            
            # Get interview details
            candidate_name = vi.candidate.full_name or vi.candidate.username if vi.candidate else None
            interviewer_name = vi.interviewer.full_name or vi.interviewer.username if vi.interviewer else None
            job_title = vi.job.title if vi.job else None
            
            # Create real transcript
            transcript_data = create_real_transcript(
                interview_id=vi.id,
                recording_path=recording_path,
                interview_start_time=vi.started_at or vi.scheduled_at,
                interview_end_time=vi.ended_at or datetime.now(timezone.utc)
            )
            
            # Save to database
            vi.transcript = transcript_data["transcript_text"]
            vi.transcript_source = "recording"
            vi.transcript_generated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(vi)
            
        except TranscriptionError as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate transcript: {str(e)}"
            )

    return {
        "video_interview_id": vi.id,
        "transcript": vi.transcript,
        "generated_at": vi.transcript_generated_at.isoformat() if vi.transcript_generated_at else None,
        "candidate_name": vi.candidate.full_name or vi.candidate.username if vi.candidate else None,
        "job_title": vi.job.title if vi.job else None
    }
# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/check-grace-period -- Check if grace period expired
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/{video_id}/check-grace-period")
def check_grace_period(
    video_id: int,
    grace_minutes: int = Body(10, embed=True),
    db: Session = Depends(get_db),
):
    """
    Check if grace period has expired for a WAITING interview.
    If expired and still WAITING, mark as CANDIDATE_ABSENT.
    Grace period starts from scheduled_at time.
    """
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Only check if status is WAITING
    if vi.status != VideoInterviewStatus.WAITING.value:
        return {
            "grace_period_expired": False,
            "status": vi.status,
            "message": "Interview is not in WAITING status"
        }

    # Calculate grace period from when recruiter joined (started_at), not scheduled_at
    grace_start = vi.started_at or vi.scheduled_at
    now = datetime.now(timezone.utc)
    if grace_start.tzinfo is None:
        grace_start = grace_start.replace(tzinfo=timezone.utc)
    grace_period_end = grace_start + timedelta(minutes=grace_minutes)

    if now > grace_period_end:
        # Grace period expired - mark as NO_SHOW
        vi.status = VideoInterviewStatus.NO_SHOW.value
        vi.ended_at = now
        db.commit()
        db.refresh(vi)
        print(f"[check_grace_period] Grace period expired for interview {video_id}, marked as NO_SHOW")
        return {
            "grace_period_expired": True,
            "status": vi.status,
            "message": "Grace period expired, candidate marked absent"
        }

    # Still within grace period
    remaining_seconds = int((grace_period_end - now).total_seconds())
    return {
        "grace_period_expired": False,
        "status": vi.status,
        "remaining_seconds": remaining_seconds,
        "message": f"Grace period active, {remaining_seconds}s remaining"
    }





# ---------------------------------------------------------------------------
# POST /api/video/interviews/demo  -- Create demo video interview
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/demo")
def create_demo_video_interview(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a demo video interview for testing."""
    from datetime import timedelta
    import random

    # Find or create a candidate
    candidate = db.query(User).filter(User.role == UserRole.CANDIDATE).first()
    if not candidate:
        # Use current user as candidate for demo
        candidate = current_user

    # Find any job
    job = db.query(Job).filter(Job.is_active == True).first()
    if not job:
        # Create a demo job
        job = Job(
            title="Demo Software Engineer Position",
            description="This is a demo job for testing video interviews",
            company="Demo Company",
            location="Remote",
            status="Open",
            is_active=True
        )
        db.add(job)
        db.commit()
        db.refresh(job)

    # Create demo video interview
    scheduled_time = datetime.now(timezone.utc) + timedelta(minutes=5)

    vi = VideoInterview(
        job_id=job.id,
        candidate_id=candidate.id,
        interviewer_id=current_user.id,
        scheduled_at=scheduled_time,
        duration_minutes=30,
        status=VideoInterviewStatus.SCHEDULED.value,
        zoom_meeting_url=f"https://zoom.us/j/demo{random.randint(1000000, 9999999)}",
        zoom_passcode=str(random.randint(100000, 999999)),
    )

    db.add(vi)
    db.commit()
    db.refresh(vi)

    return {
        "message": "Demo video interview created successfully",
        "interview_id": vi.id,
        "candidate_name": candidate.full_name or candidate.username,
        "job_title": job.title,
        "scheduled_at": vi.scheduled_at.isoformat(),
        "zoom_url": vi.zoom_meeting_url
    }


# ---------------------------------------------------------------------------
# GET /api/video/interviews/{video_id}/ai-questions  -- Get questions for AI interview
# ---------------------------------------------------------------------------

@router.get("/api/video/interviews/{video_id}/ai-questions")
def get_ai_interview_questions(
    video_id: int,
    token: str = None,
    db: Session = Depends(get_db),
):
    """
    Get approved questions for AI-driven interview.
    Blocked for candidates — only interviewers/AI agents can access.
    If ?token= matches candidate token, reject (candidate trying to access questions).
    """
    # Block candidate token holders from seeing questions
    vi_check = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if vi_check and token:
        expected_token = generate_candidate_token(video_id, vi_check.candidate_id)
        if token == expected_token:
            raise HTTPException(status_code=403, detail="Candidates cannot access interview questions")
    from models import InterviewQuestion, JobApplication

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Find JobApplication for this candidate
    application = None
    if vi.candidate:
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id,
            JobApplication.applicant_email == vi.candidate.email
        ).first()

    candidate_id_for_questions = application.id if application else vi.candidate_id

    # Get approved questions
    questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == vi.job_id,
        InterviewQuestion.candidate_id == candidate_id_for_questions,
        InterviewQuestion.is_approved == True
    ).all()

    # Fallback: try any questions for this job if none found
    if not questions:
        questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == vi.job_id,
            InterviewQuestion.is_approved == True
        ).limit(10).all()

    if not questions:
        return {
            "video_interview_id": vi.id,
            "job_id": vi.job_id,
            "application_id": application.id if application else None,
            "job_title": vi.job.title if vi.job else None,
            "candidate_name": vi.candidate.full_name or vi.candidate.username if vi.candidate else None,
            "questions": [],
            "questions_pending": True,
            "message": "Questions are being generated. They will appear shortly."
        }

    # Derive application_id from actual questions to ensure consistency with rating endpoint
    # (fallback query may return questions belonging to a different candidate)
    actual_application_id = questions[0].candidate_id if questions else None
    if not actual_application_id and application:
        actual_application_id = application.id

    return {
        "video_interview_id": vi.id,
        "job_id": vi.job_id,
        "application_id": actual_application_id,
        "job_title": vi.job.title if vi.job else None,
        "candidate_name": vi.candidate.full_name or vi.candidate.username if vi.candidate else None,
        "questions": [
            {
                "id": q.id,
                "question_text": q.question_text,
                "question_type": q.question_type or "technical",
                "difficulty": q.difficulty or "intermediate",
                "skill_focus": q.skill_focus,
                "suggested_answer": q.suggested_answer or q.sample_answer or None,
                "sample_answer": q.sample_answer or None
            }
            for q in questions
        ]
    }


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/ai-submit  -- Submit AI interview answers
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/{video_id}/ai-submit")
def submit_ai_interview_answers(
    video_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    """
    Submit AI interview data with real timestamps and generate transcript.
    Called by AI agent after interview completes.
    NO AUTH REQUIRED - AI agent cannot authenticate.
    """
    from models import InterviewQuestion, InterviewSession, InterviewAnswer, Recommendation, InterviewSessionStatus, JobApplication
    
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Get interview data with timestamps from AI agent
    interview_start_time = body.get("interview_start_time")
    interview_end_time = body.get("interview_end_time") 
    question_timestamps = body.get("question_timestamps", [])
    total_questions = body.get("total_questions", 0)
    completed_questions = body.get("completed_questions", 0)
    agent_transcript = body.get("transcript", "")
    is_final = body.get("is_final", False)
    
    print(f"[ai-submit] Received AI interview data: video_id={video_id}, questions={total_questions}, completed={completed_questions}, is_final={is_final}")
    
    # ✅ FLEXIBLE VALIDATION - Handle missing data gracefully
    if not question_timestamps:
        print(f"[ai-submit] ⚠️ No question_timestamps, but continuing...")
        question_timestamps = []
    
    if not interview_start_time:
        print(f"[ai-submit] ⚠️ No interview_start_time, using current time")
        interview_start_time = datetime.now(timezone.utc).isoformat()
    
    # OLD STRICT VALIDATION (causing 400 errors):
    # if not interview_start_time or not question_timestamps:
    #     print(f"[ai-submit] Missing timing data")
    #     raise HTTPException(status_code=400, detail="Missing interview timing data")

    # Use agent transcript if available, otherwise build from timestamps
    if agent_transcript:
        transcript_text = agent_transcript
    else:
        # Build transcript from timestamps with actual candidate answers
        candidate_name = vi.candidate.full_name or vi.candidate.username if vi.candidate else "Candidate"
        transcript_lines = []
        start_dt = datetime.fromisoformat(interview_start_time.replace('Z', '+00:00'))
        transcript_lines.append(f"[{start_dt.strftime('%H:%M:%S')}] AI Interviewer: Hello {candidate_name}!")
        
        for q_data in question_timestamps:
            question_time = datetime.fromisoformat(q_data["timestamp"].replace('Z', '+00:00'))
            transcript_lines.append(f"\n[{question_time.strftime('%H:%M:%S')}] AI Interviewer: Question {q_data.get('question_index', '?')}: {q_data['question_text']}")
            
            # Add candidate's actual answer if available
            candidate_answer = q_data.get('candidate_answer', '[No response recorded]')
            answer_time_str = q_data.get('answer_timestamp')
            if answer_time_str:
                answer_time = datetime.fromisoformat(answer_time_str.replace('Z', '+00:00'))
                transcript_lines.append(f"[{answer_time.strftime('%H:%M:%S')}] {candidate_name}: {candidate_answer}")
            else:
                # Fallback if no answer timestamp
                transcript_lines.append(f"[{question_time.strftime('%H:%M:%S')}] {candidate_name}: {candidate_answer}")
        
        end_dt = datetime.fromisoformat(interview_end_time.replace('Z', '+00:00'))
        transcript_lines.append(f"\n[{end_dt.strftime('%H:%M:%S')}] AI Interviewer: Thank you {candidate_name}! Interview completed.")
        transcript_text = "\n".join(transcript_lines)

    # Save transcript to video interview
    vi.transcript = transcript_text
    vi.transcript_generated_at = datetime.now(timezone.utc)
    vi.transcript_source = "ai_interview"  # AI interview transcript
    
    if is_final:
        vi.status = VideoInterviewStatus.COMPLETED.value
        vi.ended_at = datetime.now(timezone.utc)
        print(f"[ai-submit] Transcript generated ({len(transcript_text)} chars) and interview marked as COMPLETED")
    else:
        print(f"[ai-submit] Intermediate transcript generated ({len(transcript_text)} chars) saved")

    # Get questions for scoring
    application = None
    if vi.candidate:
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id,
            JobApplication.applicant_email == vi.candidate.email
        ).first()

    candidate_id_for_questions = application.id if application else vi.candidate_id

    questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == vi.job_id,
        InterviewQuestion.candidate_id == candidate_id_for_questions
    ).all()

    # Prepare questions for scoring
    questions_for_scoring = [
        {
            "question_id": q.id,
            "question_text": q.question_text,
            "sample_answer": q.sample_answer or ""
        }
        for q in questions
    ]

    # Create or update interview session
    session = None
    if vi.session_id is not None:
        session = db.query(InterviewSession).filter(InterviewSession.id == vi.session_id).first()

    if not session:
        session = InterviewSession(
            job_id=vi.job_id,
            candidate_id=vi.candidate_id,
            application_id=candidate_id_for_questions,
            status=InterviewSessionStatus.IN_PROGRESS,
            interview_mode="ai_interview",
            started_at=start_dt,
            transcript_text=transcript_text
        )
        db.add(session)
        db.flush()
        vi.session_id = session.id
    else:
        session.transcript_text = transcript_text
        session.status = InterviewSessionStatus.IN_PROGRESS if not is_final else session.status
        if is_final:
            session.completed_at = end_dt

    # DON'T auto-score - let recruiter trigger scoring manually
    # Just mark as completed, not scored
    if is_final:
        session.status = InterviewSessionStatus.COMPLETED
        print(f"[ai-submit] Interview completed - awaiting manual scoring")
    else:
        print(f"[ai-submit] Interview intermediate save - continuing")

    db.commit()
    db.refresh(vi)

    print(f"[ai-submit] ✅ AI interview data saved successfully")

    return {
        "success": True,
        "message": "AI Interview completed and transcript generated",
        "video_interview_id": vi.id,
        "transcript_length": len(transcript_text),
        "questions_asked": total_questions,
        "status": vi.status
    }


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/generate-transcript  -- Generate transcript from recording
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/{video_id}/generate-transcript")
def generate_transcript_from_recording(
    video_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Generate transcript from interview recording (when auto-generation failed)."""
    from services.transcript_generator import create_real_transcript, validate_recording_file, TranscriptionError
    from models import InterviewQuestion, InterviewSession, InterviewSessionStatus, JobApplication

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    if not vi.recording_url:
        raise HTTPException(status_code=400, detail="No recording available for this interview")

    # Resolve recording path
    recording_filename = os.path.basename(vi.recording_url)
    recordings_dir = os.path.normpath(os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "uploads", "recordings"
    ))
    recording_path = os.path.join(recordings_dir, recording_filename)

    if not os.path.exists(recording_path):
        raise HTTPException(status_code=404, detail=f"Recording file not found: {recording_filename}")

    # Get questions for context
    actual_questions = []
    if vi.job_id:
        questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == vi.job_id,
            InterviewQuestion.is_approved == True
        ).all()
        if questions:
            actual_questions = [
                {"question_text": q.question_text, "sample_answer": q.sample_answer or ""}
                for q in questions
            ]

    try:
        validate_recording_file(recording_path)
        transcript_data = create_real_transcript(
            interview_id=vi.id,
            recording_path=recording_path,
            interview_start_time=vi.started_at or vi.scheduled_at,
            interview_end_time=vi.ended_at or datetime.now(timezone.utc),
            question_timestamps=actual_questions if actual_questions else None
        )

        vi.transcript = transcript_data["transcript_text"]
        vi.transcript_source = "recording"
        vi.transcript_generated_at = datetime.now(timezone.utc)
        vi.transcript_error = None

        # Update session transcript too
        if vi.session_id:
            session = db.query(InterviewSession).filter(InterviewSession.id == vi.session_id).first()
            if session:
                session.transcript_text = transcript_data["transcript_text"]

        db.commit()
        db.refresh(vi)

        print(f"[generate-transcript] Transcript generated for vi_id={video_id} ({len(vi.transcript)} chars)")
        return {
            "success": True,
            "message": "Transcript generated successfully",
            "transcript_length": len(vi.transcript),
            "transcript": vi.transcript,
        }

    except TranscriptionError as e:
        vi.transcript_source = "failed"
        vi.transcript_error = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Transcript generation failed: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


# POST /api/video/interviews/{video_id}/generate-score  -- Manual score generation
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/{video_id}/generate-score")
def generate_interview_score(
    video_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Manually trigger score generation for a completed AI interview.
    Requires transcript to be present.
    """
    from models import InterviewQuestion, InterviewSession, InterviewAnswer, Recommendation, InterviewSessionStatus, JobApplication
    from services.groq_service import score_transcript_with_groq, score_transcript_directly
    from services.gemini_service import score_transcript_with_gemini
    import config

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    if not vi.transcript:
        raise HTTPException(status_code=400, detail="No transcript available. Complete the interview first.")

    # Get questions for scoring (may be empty for test uploads / real interviews)
    application = None
    if vi.candidate:
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id,
            JobApplication.applicant_email == vi.candidate.email
        ).first()

    candidate_id_for_questions = application.id if application else vi.candidate_id

    questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == vi.job_id,
        InterviewQuestion.candidate_id == candidate_id_for_questions
    ).all()

    questions_for_scoring = [
        {
            "question_id": q.id,
            "question_text": q.question_text,
            "sample_answer": q.sample_answer or ""
        }
        for q in questions
    ]

    # Use direct scoring if: no pre-defined questions OR transcript came from recording (test upload)
    is_recording_transcript = vi.transcript_source in ("recording",)
    use_direct_scoring = len(questions_for_scoring) == 0 or is_recording_transcript

    # Get or create interview session
    session = None
    if vi.session_id:
        session = db.query(InterviewSession).filter(InterviewSession.id == vi.session_id).first()

    if not session:
        session = db.query(InterviewSession).filter(
            InterviewSession.job_id == vi.job_id,
            InterviewSession.candidate_id == vi.candidate_id
        ).first()

    if not session:
        session = InterviewSession(
            job_id=vi.job_id,
            candidate_id=vi.candidate_id,
            status=InterviewSessionStatus.IN_PROGRESS,
            interview_mode="video_interview",
            transcript_text=vi.transcript,
            started_at=vi.started_at or vi.scheduled_at,
        )
        db.add(session)
        db.flush()
        vi.session_id = session.id

    # Score with AI
    try:
        llm_result = None

        if use_direct_scoring:
            # No pre-defined questions — AI extracts Q&A from transcript directly
            job = db.query(Job).filter(Job.id == vi.job_id).first()
            print(f"[generate-score] No pre-defined questions, using direct transcript scoring")
            llm_result = score_transcript_directly(
                transcript_text=vi.transcript,
                job_title=job.title if job else "",
                job_description=job.description if job else "",
                skills_required=job.skills_required if job else "",
            )
        else:
            # Standard scoring with pre-defined questions
            if config.GROQ_API_KEY:
                llm_result = score_transcript_with_groq(vi.transcript, questions_for_scoring)
            elif config.GEMINI_API_KEY:
                llm_result = score_transcript_with_gemini(vi.transcript, questions_for_scoring)

        if not llm_result:
            raise HTTPException(status_code=500, detail="AI scoring service unavailable")

        session.overall_score = float(llm_result.get("overall_score", 0))
        rec_str = llm_result.get("recommendation", "reject")
        session.recommendation = Recommendation(rec_str) if rec_str in ("select", "next_round", "reject") else Recommendation.REJECT
        session.strengths = llm_result.get("strengths", "")
        session.weaknesses = llm_result.get("weaknesses", "")
        session.status = InterviewSessionStatus.SCORED

        # Save per-question scores (skip questions that were not asked/answered)
        per_question_scores = llm_result.get("per_question", [])
        for pq in per_question_scores:
            # Skip questions that were not asked in the interview
            if pq.get("not_asked"):
                continue

            q_id = pq.get("question_id")

            if use_direct_scoring:
                # Direct scoring: save extracted Q&A without linking to pre-defined questions
                answer = InterviewAnswer(
                    session_id=session.id,
                    answer_text=pq.get("extracted_answer", "[From transcript]")
                )
                db.add(answer)
            else:
                answer = db.query(InterviewAnswer).filter(
                    InterviewAnswer.session_id == session.id,
                    InterviewAnswer.question_id == q_id
                ).first()
                if not answer:
                    answer = InterviewAnswer(
                        session_id=session.id,
                        question_id=q_id,
                        answer_text=pq.get("extracted_answer", "[From transcript]")
                    )
                    db.add(answer)

            answer.score = float(pq.get("score", 0))
            answer.relevance_score = float(pq.get("relevance_score", 0))
            answer.completeness_score = float(pq.get("completeness_score", 0))
            answer.accuracy_score = float(pq.get("accuracy_score", 0))
            answer.clarity_score = float(pq.get("clarity_score", 0))
            answer.feedback = pq.get("feedback", "")
        
        db.commit()
        db.refresh(session)
        
        print(f"[generate-score] ✅ Scoring completed: {session.overall_score}/100")

        # Send result email to candidate
        try:
            candidate_email = vi.candidate.email if vi.candidate else None
            candidate_name = vi.candidate.full_name or vi.candidate.username if vi.candidate else "Candidate"
            job = db.query(Job).filter(Job.id == vi.job_id).first()
            job_title = job.title if job else "Interview"
            rec_value = session.recommendation.value if hasattr(session.recommendation, "value") else str(session.recommendation)

            if candidate_email:
                send_interview_result_notification(
                    candidate_email=candidate_email,
                    candidate_name=candidate_name,
                    job_title=job_title,
                    overall_score=session.overall_score,
                    recommendation=rec_value,
                    strengths=session.strengths or "",
                    weaknesses=session.weaknesses or "",
                )
        except Exception as email_err:
            print(f"[generate-score] ⚠️ Failed to send result email: {email_err}")

        return {
            "success": True,
            "message": "Score generated successfully",
            "overall_score": session.overall_score,
            "recommendation": session.recommendation.value if hasattr(session.recommendation, "value") else str(session.recommendation),
            "strengths": session.strengths,
            "weaknesses": session.weaknesses,
            "interview_session_id": session.id
        }
        
    except Exception as e:
        print(f"[generate-score] ❌ Scoring failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to generate score: {str(e)}")


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/upload-transcript  -- Upload transcript & score
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/{video_id}/upload-transcript")
def upload_transcript_and_score(
    video_id: int,
    body: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Upload transcript text and generate score using AI."""
    from models import InterviewQuestion, InterviewSession, InterviewAnswer, Recommendation, InterviewSessionStatus
    from services.groq_service import score_transcript_with_groq
    from services.gemini_service import score_transcript_with_gemini

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    transcript_text = body.get("transcript_text", "").strip()
    if not transcript_text:
        raise HTTPException(status_code=400, detail="Transcript text is required")

    # Save the transcript
    vi.transcript = transcript_text
    vi.transcript_generated_at = datetime.now(timezone.utc)
    vi.transcript_source = "upload"

    # Find JobApplication for this candidate - try multiple methods
    application = None
    candidate_id_for_questions = None

    print(f"🔍 Starting question lookup for video_interview_id: {video_id}")
    print(f"   - job_id: {vi.job_id}")
    print(f"   - candidate_id (user): {vi.candidate_id}")
    print(f"   - candidate email: {vi.candidate.email if vi.candidate else 'N/A'}")

    if vi.candidate:
        # Method 1: Find by email
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id,
            JobApplication.applicant_email == vi.candidate.email
        ).first()
        if application:
            print(f"   ✅ Found application by email: id={application.id}, name={application.applicant_name}")

    if not application:
        # Method 2: Find any application for this job
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id
        ).first()
        if application:
            print(f"   ⚠️ Found application by job_id only: id={application.id}, name={application.applicant_name}")

    # Determine candidate_id for questions
    if application:
        candidate_id_for_questions = application.id
    else:
        candidate_id_for_questions = vi.candidate_id
        print(f"   ⚠️ No application found, using user_id: {vi.candidate_id}")

    print(f"🔍 Looking for questions - job_id: {vi.job_id}, candidate_id: {candidate_id_for_questions}")

    # First, let's see ALL questions for this job (for debugging)
    all_job_questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == vi.job_id
    ).all()
    print(f"📊 All questions for job_id={vi.job_id}:")
    for q in all_job_questions:
        print(f"   - Question ID={q.id}, candidate_id={q.candidate_id}, approved={q.is_approved}")

    # Try multiple candidate IDs to find questions
    possible_candidate_ids = [candidate_id_for_questions]
    if application and application.id not in possible_candidate_ids:
        possible_candidate_ids.append(application.id)
    if vi.candidate_id not in possible_candidate_ids:
        possible_candidate_ids.append(vi.candidate_id)

    # Also try all candidate_ids that exist in questions for this job
    existing_candidate_ids = set(q.candidate_id for q in all_job_questions)
    for ecid in existing_candidate_ids:
        if ecid not in possible_candidate_ids:
            possible_candidate_ids.append(ecid)

    print(f"🔍 Will try these candidate_ids: {possible_candidate_ids}")

    approved_questions = []

    for cid in possible_candidate_ids:
        # Try approved questions first
        approved_questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == vi.job_id,
            InterviewQuestion.candidate_id == cid,
            InterviewQuestion.is_approved == True
        ).all()
        print(f"📝 Checking candidate_id={cid}: Found {len(approved_questions)} approved questions")

        if approved_questions:
            break

        # Try all questions if no approved
        approved_questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == vi.job_id,
            InterviewQuestion.candidate_id == cid
        ).all()
        print(f"📝 Checking candidate_id={cid}: Found {len(approved_questions)} total questions")

        if approved_questions:
            break

    # Last resort: try questions for this job with any candidate
    if not approved_questions:
        print(f"⚠️ No questions found for specific candidates, trying job-level questions...")
        approved_questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == vi.job_id
        ).limit(10).all()
        print(f"📝 Found {len(approved_questions)} job-level questions")

    score_result = None
    scoring_error = None
    llm_result = None

    # Use direct scoring if: no pre-defined questions OR transcript came from recording (test upload)
    is_recording_transcript = vi.transcript_source in ("recording", "failed")
    use_direct_scoring = len(approved_questions) == 0 or is_recording_transcript
    if is_recording_transcript and approved_questions:
        print(f"[upload-transcript] Transcript from recording — using direct scoring (ignoring {len(approved_questions)} pre-defined questions)")

    import config
    from services.groq_service import score_transcript_directly

    if use_direct_scoring:
        # No pre-defined questions — AI extracts Q&A from transcript directly
        print(f"[upload-transcript] No pre-defined questions, using direct transcript scoring")
        job = db.query(Job).filter(Job.id == vi.job_id).first()
        llm_result = score_transcript_directly(
            transcript_text=transcript_text,
            job_title=job.title if job else "",
            job_description=job.description if job else "",
            skills_required=job.skills_required if job else "",
        )
        if not llm_result:
            scoring_error = "AI direct scoring failed."
    else:
        # Standard scoring with pre-defined questions
        questions_for_scoring = [
            {
                "question_id": q.id,
                "question_text": q.question_text,
                "sample_answer": q.sample_answer or ""
            }
            for q in approved_questions
        ]

        if config.GROQ_API_KEY:
            try:
                print(f"[AI] Scoring transcript with Groq API (primary)...")
                llm_result = score_transcript_with_groq(transcript_text, questions_for_scoring)
                if llm_result:
                    print(f"[OK] Groq scoring succeeded")
            except Exception as e:
                print(f"[WARN] Groq scoring failed: {e}")
                llm_result = None

        if not llm_result and config.GEMINI_API_KEY:
            try:
                print(f"[AI] Trying Gemini (fallback)...")
                llm_result = score_transcript_with_gemini(transcript_text, questions_for_scoring)
                if llm_result:
                    print(f"[OK] Gemini scoring succeeded")
            except Exception as e:
                print(f"[WARN] Gemini scoring also failed: {e}")
                llm_result = None

        if not llm_result:
            scoring_error = "Both Groq and Gemini scoring failed. Check API keys in .env."
            print(f"[WARN] {scoring_error}")

        # Always create or find the interview session (even if scoring fails)
        # Check via vi.session_id first (created by end_interview)
        session = None
        if vi.session_id:
            session = db.query(InterviewSession).filter(
                InterviewSession.id == vi.session_id
            ).first()

        if not session:
            session = db.query(InterviewSession).filter(
                InterviewSession.job_id == vi.job_id,
                InterviewSession.application_id == candidate_id_for_questions
            ).first()

        # Fallback: try with candidate_id directly
        if not session:
            session = db.query(InterviewSession).filter(
                InterviewSession.job_id == vi.job_id,
                InterviewSession.candidate_id == vi.candidate_id,
                InterviewSession.interview_mode == "video_interview"
            ).first()

        if not session:
            session = InterviewSession(
                job_id=vi.job_id,
                candidate_id=vi.candidate_id,
                application_id=candidate_id_for_questions,
                status=InterviewSessionStatus.IN_PROGRESS,
                interview_mode="video_interview",
                started_at=datetime.now(timezone.utc)
            )
            db.add(session)
            db.flush()

        session.transcript_text = transcript_text

        if llm_result:
            rec_str = llm_result.get("recommendation", "reject")
            session.recommendation = Recommendation(rec_str) if rec_str in ("select", "next_round", "reject") else Recommendation.REJECT
            session.strengths = llm_result.get("strengths", "")
            session.weaknesses = llm_result.get("weaknesses", "")
            session.status = InterviewSessionStatus.SCORED
            session.completed_at = datetime.now(timezone.utc)

            # Pre-fetch recruiter ratings (InterviewRating, source="video_interview") for 80/20 blend.
            # AI score is 0-100, recruiter rating is 1-10 — scale rating to 0-100 before blending.
            # Isolated to THIS video interview via video_interview_id; falls back to unscoped if column missing.
            from models import InterviewRating
            valid_q_ids = [q.id for q in approved_questions]
            recruiter_ratings = {}
            if valid_q_ids:
                try:
                    ratings_rows = db.query(InterviewRating).filter(
                        InterviewRating.question_id.in_(valid_q_ids),
                        InterviewRating.source == "video_interview",
                        InterviewRating.video_interview_id == vi.id,
                    ).all()
                except Exception as e:
                    print(f"[upload-transcript] scoped ratings failed, falling back: {e}")
                    db.rollback()
                    ratings_rows = db.query(InterviewRating).filter(
                        InterviewRating.question_id.in_(valid_q_ids),
                        InterviewRating.source == "video_interview",
                    ).all()
                recruiter_ratings = {r.question_id: float(r.rating) for r in ratings_rows if r.rating is not None}

            # Build score_result with session ID for frontend navigation
            score_result = {
                "overall_score": llm_result.get("overall_score", 0),
                "recommendation": llm_result.get("recommendation", ""),
                "strengths": llm_result.get("strengths", ""),
                "weaknesses": llm_result.get("weaknesses", ""),
                "per_question": llm_result.get("per_question", []),
                "interview_session_id": session.id  # For navigating to Results page
            }

            # Accumulate blended per-question scores to recompute session.overall_score
            blended_total = 0.0
            blended_count = 0

            # Save per-question answers with extracted answers from transcript
            for pq in llm_result.get("per_question", []):
                # Skip questions that were not asked during the interview —
                # Groq returns per_question for ALL job questions, flagging missed ones
                # with not_asked=True. Including them crashes the average toward 0.
                if pq.get("not_asked"):
                    continue

                if use_direct_scoring:
                    # Direct scoring: no pre-defined question IDs, save extracted Q&A
                    answer = InterviewAnswer(
                        session_id=session.id,
                        answer_text=pq.get("extracted_answer", "Answer not extracted")
                    )
                    db.add(answer)
                else:
                    q_id = pq.get("question_id")
                    if not q_id:
                        continue
                    try:
                        q_id = int(q_id)
                    except (ValueError, TypeError):
                        continue

                    valid_question_ids = {q.id for q in approved_questions}
                    if q_id not in valid_question_ids:
                        continue

                    existing_answer = db.query(InterviewAnswer).filter(
                        InterviewAnswer.session_id == session.id,
                        InterviewAnswer.question_id == q_id
                    ).first()

                    if existing_answer:
                        answer = existing_answer
                    else:
                        answer = InterviewAnswer(session_id=session.id, question_id=q_id)
                        db.add(answer)

                    extracted = pq.get("extracted_answer", "")
                    if extracted and extracted not in ("[Extracted from Transcript]", "No answer found in transcript", ""):
                        answer.answer_text = extracted
                    elif existing_answer and existing_answer.answer_text and existing_answer.answer_text not in ("[Extracted from Transcript]", ""):
                        pass
                    else:
                        answer.answer_text = extracted or "Answer not extracted from transcript"

                # Store scores on 0-100 scale (internal standard)
                ai_score_raw = float(pq.get("score", 0))

                # 80/20 blend with recruiter rating if present for this question.
                # recruiter rating is 1-10 → scale to 0-100. AI is already 0-100.
                # If no recruiter rating, keep AI-only (partial-interview: unrated questions count as AI-only).
                if not use_direct_scoring and q_id in recruiter_ratings:
                    recruiter_raw_100 = recruiter_ratings[q_id] * 10.0
                    blended = round((ai_score_raw * 0.8) + (recruiter_raw_100 * 0.2), 2)
                    answer.score = blended
                else:
                    answer.score = ai_score_raw

                answer.relevance_score = float(pq.get("relevance_score", 0))
                answer.completeness_score = float(pq.get("completeness_score", 0))
                answer.accuracy_score = float(pq.get("accuracy_score", 0))
                answer.clarity_score = float(pq.get("clarity_score", 0))
                answer.feedback = pq.get("feedback", "")

                blended_total += answer.score
                blended_count += 1

            # Recompute session.overall_score from blended per-question scores
            # (override LLM's overall_score so 80/20 actually reflects in final number)
            if blended_count > 0:
                session.overall_score = round(blended_total / blended_count, 2)
                score_result["overall_score"] = session.overall_score
            else:
                session.overall_score = float(llm_result.get("overall_score", 0))
        else:
            # Scoring failed but still save session with transcript
            score_result = {
                "interview_session_id": session.id
            }

    db.commit()
    db.refresh(vi)

    # Send result email to candidate if scoring succeeded
    if score_result and llm_result:
        try:
            candidate_email = vi.candidate.email if vi.candidate else None
            candidate_name = vi.candidate.full_name or vi.candidate.username if vi.candidate else "Candidate"
            job = db.query(Job).filter(Job.id == vi.job_id).first()
            job_title = job.title if job else "Interview"

            if candidate_email:
                send_interview_result_notification(
                    candidate_email=candidate_email,
                    candidate_name=candidate_name,
                    job_title=job_title,
                    overall_score=llm_result.get("overall_score", 0),
                    recommendation=llm_result.get("recommendation", ""),
                    strengths=llm_result.get("strengths", ""),
                    weaknesses=llm_result.get("weaknesses", ""),
                )
        except Exception as email_err:
            print(f"[upload-transcript] ⚠️ Failed to send result email: {email_err}")

    # Determine appropriate message
    if score_result:
        result_message = "Transcript uploaded and scored successfully"
    elif scoring_error:
        result_message = f"Transcript uploaded but scoring failed: {scoring_error}"
    elif approved_questions:
        result_message = "Transcript uploaded but scoring failed (unknown error - check backend logs)"
    else:
        result_message = "Transcript uploaded (no questions found for scoring)"

    return {
        "message": result_message,
        "video_interview_id": vi.id,
        "transcript_saved": True,
        "score_generated": score_result is not None,
        "score_result": score_result,
        "questions_found": len(approved_questions) if approved_questions else 0,
        "scoring_error": scoring_error
    }


# ---------------------------------------------------------------------------
# POST /api/video/guest/{video_id}/upload-transcript  -- No-auth fallback
# ---------------------------------------------------------------------------
# Used when the candidate's session was killed mid-interview (e.g. accidental
# refresh/logout) so the recording's transcript still uploads and gets scored.
# The frontend retries here automatically if the authenticated route returns 401.

@router.post("/api/video/guest/{video_id}/upload-transcript")
def guest_upload_transcript_and_score(
    video_id: int,
    body: dict,
    db: Session = Depends(get_db),
):
    """No-auth mirror of upload-transcript so a logged-out candidate can still
    finalize the transcript + scoring for their just-finished interview."""
    return upload_transcript_and_score(video_id=video_id, body=body, current_user=None, db=db)


# ---------------------------------------------------------------------------
# PATCH /api/video/interviews/{video_id}/recording-consent
# ---------------------------------------------------------------------------

@router.patch("/api/video/interviews/{video_id}/recording-consent")
def update_recording_consent(
    video_id: int,
    body: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update recording consent for a video interview."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    vi.recording_consent = body.get("consent", False)
    db.commit()
    db.refresh(vi)
    return {"message": "Recording consent updated", "recording_consent": vi.recording_consent}


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/upload-recording
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/{video_id}/upload-recording")
async def upload_recording(
    video_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Upload a recording file for a video interview."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # First upload wins — skip if recording already exists (both sides record, avoid overwrite)
    if vi.recording_url:
        print(f"🎥 Recording already exists for vi={video_id}, skipping duplicate upload")
        return {"message": "Recording already uploaded", "recording_url": vi.recording_url}

    # Save file locally (needed for transcription)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"interview_{video_id}_{timestamp}.webm"
    recordings_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "recordings")
    os.makedirs(recordings_dir, exist_ok=True)
    file_path = os.path.join(recordings_dir, filename)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    # Upload to Cloudinary for persistent storage (avoids large binary in DB)
    from services.cloudinary_upload import upload_recording as cloudinary_upload
    cloudinary_url = cloudinary_upload(file_path, video_id)

    if cloudinary_url:
        vi.recording_url = cloudinary_url
        print(f"🎥 Recording uploaded to Cloudinary: {cloudinary_url} ({len(contents)} bytes)")
    else:
        vi.recording_url = f"/uploads/recordings/{filename}"
        print(f"🎥 Cloudinary not configured, using local: {file_path} ({len(contents)} bytes)")

    db.commit()
    db.refresh(vi)

    # AUTOMATIC TRANSCRIPTION: Trigger immediately after upload
    _start_background_transcription_task(
        vi_id=video_id,
        job_id=vi.job_id,
        candidate_id=vi.candidate_id,
        candidate_email=vi.candidate.email if vi.candidate else None,
        started_at=vi.started_at or vi.scheduled_at,
        recording_url_hint=f"/uploads/recordings/{filename}",
        session_id=vi.session_id
    )

    return {"message": "Recording uploaded successfully", "recording_url": vi.recording_url}


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/upload-complete  -- Upload recording & complete interview
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/{video_id}/upload-complete")
async def upload_and_complete_interview(
    video_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_any_role([UserRole.RECRUITER, UserRole.ADMIN])),
    db: Session = Depends(get_db),
):
    """Upload a recording for a scheduled interview, mark it completed, and trigger transcript + fraud + scoring."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "mp4"
    if ext not in ("mp4", "webm", "mp3", "wav", "m4a"):
        raise HTTPException(status_code=400, detail="Unsupported format. Use mp4, webm, mp3, wav, or m4a")

    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    filename = f"interview_{video_id}_{timestamp}.{ext}"
    recordings_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "recordings")
    os.makedirs(recordings_dir, exist_ok=True)
    file_path = os.path.join(recordings_dir, filename)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    from services.cloudinary_upload import upload_recording as cloudinary_upload
    cloudinary_url = cloudinary_upload(file_path, video_id)
    vi.recording_url = cloudinary_url if cloudinary_url else f"/uploads/recordings/{filename}"
    vi.status = VideoInterviewStatus.COMPLETED.value
    vi.started_at = vi.started_at or now
    vi.ended_at = now
    vi.recording_consent = True

    # Extract actual duration from uploaded recording file
    try:
        from services.biometric_analyzer import load_audio_from_file
        audio = load_audio_from_file(file_path)
        audio_duration_sec = len(audio) / 1000.0
        if audio_duration_sec > 0:
            vi.duration_minutes = max(1, int(round(audio_duration_sec / 60)))
            print(f"🎥 Extracted duration from upload: {audio_duration_sec:.0f}s = {vi.duration_minutes}min")
    except Exception as dur_err:
        print(f"🎥 Could not extract duration from upload: {dur_err}")

    session = None
    if not vi.session_id:
        session = InterviewSession(
            job_id=vi.job_id,
            candidate_id=vi.candidate_id,
            status=InterviewSessionStatus.IN_PROGRESS,
            interview_mode="video_interview",
            started_at=now,
        )
        db.add(session)
        db.flush()
        vi.session_id = session.id

    db.commit()

    _start_background_transcription_task(
        vi_id=video_id,
        job_id=vi.job_id,
        candidate_id=vi.candidate_id,
        candidate_email=vi.candidate.email if vi.candidate else None,
        started_at=vi.started_at or vi.scheduled_at,
        recording_url_hint=f"/uploads/recordings/{filename}",
        session_id=vi.session_id,
    )

    import threading
    _vi_id = video_id
    _file_path = file_path

    def _bg_fraud():
        import time
        time.sleep(5)
        from database import SessionLocal
        bg_db = SessionLocal()
        try:
            from services.biometric_analyzer import run_real_analysis
            results = run_real_analysis(video_interview_id=_vi_id, recording_path=_file_path)

            # Check for existing record (may have been created by upload-complete before thread started)
            existing_fa = bg_db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == _vi_id).first()

            if not results or (isinstance(results, dict) and "_error" in results):
                err_detail = results.get("_error", "unknown") if results else "no results"
                print(f"⚠️ Fraud analysis returned error for VI {_vi_id}: {err_detail}")
                if existing_fa:
                    existing_fa.analysis_status = "failed"
                    existing_fa.analyzed_at = datetime.now(timezone.utc)
                else:
                    import json as _jf
                    existing_fa = FraudAnalysis(
                        video_interview_id=_vi_id,
                        analysis_status="failed",
                        consent_granted=True,
                        analyzed_at=datetime.now(timezone.utc),
                        flags=_jf.dumps([{"flag_type": "analysis_error", "severity": "low", "description": f"Biometric analysis failed: {err_detail}"}]),
                        flag_count=1,
                    )
                    bg_db.add(existing_fa)
                bg_db.commit()
                return

            if existing_fa:
                existing_fa.voice_consistency_score = results.get("voice_consistency_score")
                existing_fa.voice_consistency_details = results.get("voice_consistency_details")
                existing_fa.lip_sync_score = results.get("lip_sync_score")
                existing_fa.lip_sync_details = results.get("lip_sync_details")
                existing_fa.body_movement_score = results.get("body_movement_score")
                existing_fa.body_movement_details = results.get("body_movement_details")
                existing_fa.face_detection_score = results.get("face_detection_score")
                existing_fa.face_detection_details = results.get("face_detection_details")
                existing_fa.overall_trust_score = results.get("overall_trust_score")
                existing_fa.flags = results.get("flags", "[]")
                existing_fa.flag_count = results.get("flag_count", 0)
                existing_fa.analysis_status = "completed"
                existing_fa.consent_granted = True
                existing_fa.analyzed_at = datetime.now(timezone.utc)
            else:
                fraud = FraudAnalysis(
                    video_interview_id=_vi_id,
                    voice_consistency_score=results.get("voice_consistency_score"),
                    voice_consistency_details=results.get("voice_consistency_details"),
                    lip_sync_score=results.get("lip_sync_score"),
                    lip_sync_details=results.get("lip_sync_details"),
                    body_movement_score=results.get("body_movement_score"),
                    body_movement_details=results.get("body_movement_details"),
                    face_detection_score=results.get("face_detection_score"),
                    face_detection_details=results.get("face_detection_details"),
                    overall_trust_score=results.get("overall_trust_score"),
                    flags=results.get("flags", "[]"),
                    flag_count=results.get("flag_count", 0),
                    analysis_status="completed",
                    consent_granted=True,
                    analyzed_at=datetime.now(timezone.utc),
                )
                bg_db.add(fraud)
            bg_db.commit()
            print(f"✅ Fraud analysis completed for VI {_vi_id}")
        except Exception as e:
            print(f"⚠️ Fraud analysis failed for VI {_vi_id}: {e}")
            import traceback
            traceback.print_exc()
            try:
                fa = bg_db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == _vi_id).first()
                if fa and fa.analysis_status in ("pending", "processing"):
                    fa.analysis_status = "failed"
                    fa.analyzed_at = datetime.now(timezone.utc)
                    bg_db.commit()
            except Exception:
                bg_db.rollback()
        finally:
            bg_db.close()

    threading.Thread(target=_bg_fraud, daemon=True).start()

    return {
        "message": "Recording uploaded, interview completed. Transcript & fraud analysis processing.",
        "video_interview_id": video_id,
        "recording_url": vi.recording_url,
        "status": "completed",
    }


# ---------------------------------------------------------------------------
# POST /api/video/interviews/{video_id}/link-complete  -- Link recording URL & complete interview
# ---------------------------------------------------------------------------

from pydantic import BaseModel as _BaseModel

class _RecordingLinkBody(_BaseModel):
    recording_url: str

@router.post("/api/video/interviews/{video_id}/link-complete")
def link_recording_and_complete(
    video_id: int,
    body: _RecordingLinkBody,
    current_user: User = Depends(require_any_role([UserRole.RECRUITER, UserRole.ADMIN])),
    db: Session = Depends(get_db),
):
    """Link an existing recording URL to a scheduled interview, mark completed, trigger transcript + fraud + scoring."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    url = body.recording_url.strip()
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL")

    now = datetime.now(timezone.utc)
    vi.recording_url = url
    vi.status = VideoInterviewStatus.COMPLETED.value
    vi.started_at = vi.started_at or now
    vi.ended_at = now
    vi.recording_consent = True

    if not vi.session_id:
        session = InterviewSession(
            job_id=vi.job_id,
            candidate_id=vi.candidate_id,
            status=InterviewSessionStatus.IN_PROGRESS,
            interview_mode="video_interview",
            started_at=now,
        )
        db.add(session)
        db.flush()
        vi.session_id = session.id

    # Update JobApplication status to "Interview Completed"
    if vi.candidate and vi.job_id:
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id,
            JobApplication.applicant_email == vi.candidate.email
        ).first()
        if application:
            application.status = "Interview Completed"

    db.commit()

    _start_background_transcription_task(
        vi_id=video_id,
        job_id=vi.job_id,
        candidate_id=vi.candidate_id,
        candidate_email=vi.candidate.email if vi.candidate else None,
        started_at=vi.started_at or vi.scheduled_at,
        recording_url_hint=url,
        session_id=vi.session_id,
    )

    import threading
    _vi_id = video_id
    _url = url

    def _bg_fraud_from_url():
        import time, tempfile, requests as _requests
        time.sleep(5)
        try:
            from database import SessionLocal
            from services.biometric_analyzer import run_real_analysis
            print(f"[fraud-bg] Downloading recording from {_url[:80]}...")
            resp = _requests.get(_url, timeout=120)
            resp.raise_for_status()
            ext = ".mp4" if ".mp4" in _url else ".webm"
            tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
            tmp.write(resp.content)
            tmp.close()
            print(f"[fraud-bg] Downloaded {len(resp.content)} bytes")

            bg_db = SessionLocal()
            results = run_real_analysis(video_interview_id=_vi_id, recording_path=tmp.name)
            if results and "_error" not in results:
                fraud = FraudAnalysis(
                    video_interview_id=_vi_id,
                    voice_consistency_score=results.get("voice_consistency_score"),
                    voice_consistency_details=results.get("voice_consistency_details"),
                    lip_sync_score=results.get("lip_sync_score"),
                    lip_sync_details=results.get("lip_sync_details"),
                    body_movement_score=results.get("body_movement_score"),
                    body_movement_details=results.get("body_movement_details"),
                    face_detection_score=results.get("face_detection_score"),
                    face_detection_details=results.get("face_detection_details"),
                    overall_trust_score=results.get("overall_trust_score"),
                    flags=results.get("flags", "[]"),
                    flag_count=results.get("flag_count", 0),
                    analysis_status="completed",
                    consent_granted=True,
                    analyzed_at=datetime.now(timezone.utc),
                )
                bg_db.add(fraud)
                bg_db.commit()
                print(f"✅ Fraud analysis completed for VI {_vi_id}")
            bg_db.close()
            try: os.unlink(tmp.name)
            except OSError: pass
        except Exception as e:
            print(f"⚠️ Fraud analysis failed for VI {_vi_id}: {e}")

    threading.Thread(target=_bg_fraud_from_url, daemon=True).start()

    return {
        "message": "Recording linked, interview completed. Transcript & fraud analysis processing.",
        "video_interview_id": video_id,
        "recording_url": url,
        "status": "completed",
    }


# ---------------------------------------------------------------------------
# GET /api/video/interviews/{video_id}/recording  -- Serve recording file
# ---------------------------------------------------------------------------

@router.get("/api/video/interviews/{video_id}/recording")
def get_recording(
    video_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Serve the recording file for a video interview."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    if not vi.recording_url:
        raise HTTPException(status_code=404, detail="No recording available for this interview")

    # Candidates can only view their own
    if current_user.role == UserRole.CANDIDATE and vi.candidate_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # If Cloudinary URL, redirect to it
    if vi.recording_url.startswith("http"):
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=vi.recording_url)

    # Try local file
    file_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", vi.recording_url.lstrip("/"))
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="video/webm", filename=os.path.basename(file_path))

    raise HTTPException(status_code=404, detail="Recording file not found")


@router.get("/api/video/interviews/{video_id}/recording-stream")
def stream_recording(video_id: int, db: Session = Depends(get_db)):
    """Serve recording without auth — for video player src attribute."""
    from fastapi.responses import Response

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi or not vi.recording_url:
        raise HTTPException(status_code=404, detail="Recording not found")

    # If Cloudinary URL, redirect to it
    if vi.recording_url.startswith("http"):
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=vi.recording_url)

    # Try local file
    file_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", vi.recording_url.lstrip("/"))
    if os.path.exists(file_path):
        mime = "video/mp4" if file_path.endswith(".mp4") else "video/webm"
        return FileResponse(file_path, media_type=mime)

    raise HTTPException(status_code=404, detail="Recording file not found")


@router.get("/api/video/interviews/{video_id}/recording-download")
def download_recording(video_id: int, db: Session = Depends(get_db)):
    """Force-download the recording file."""
    import httpx

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi or not vi.recording_url:
        raise HTTPException(status_code=404, detail="Recording not found")

    ext = "mp4" if (vi.recording_url.endswith(".mp4") or "mp4" in vi.recording_url) else "webm"
    filename = f"interview_{video_id}.{ext}"
    mime = "video/mp4" if ext == "mp4" else "video/webm"

    if vi.recording_url.startswith("http"):
        # Stream from Cloudinary and forward with attachment header
        from fastapi.responses import StreamingResponse
        url = vi.recording_url
        # Cloudinary: inject fl_attachment to force download at CDN level
        if "cloudinary.com" in url:
            # Insert fl_attachment into the URL path after /upload/
            url = url.replace("/upload/", "/upload/fl_attachment/", 1)
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url=url)
        # Non-Cloudinary: proxy stream with attachment header
        def stream():
            with httpx.stream("GET", url) as r:
                for chunk in r.iter_bytes(chunk_size=65536):
                    yield chunk
        return StreamingResponse(
            stream(),
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    # Local file
    file_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", vi.recording_url.lstrip("/"))
    if os.path.exists(file_path):
        return FileResponse(
            file_path,
            media_type=mime,
            filename=filename,
            content_disposition_type="attachment"
        )

    raise HTTPException(status_code=404, detail="Recording file not found")


# ---------------------------------------------------------------------------
# POST /api/video/interviews/backfill-duration
# One-time: calculate duration from started_at/ended_at for existing interviews
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/backfill-duration")
def backfill_duration(
    current_user: User = Depends(require_any_role([UserRole.ADMIN])),
    db: Session = Depends(get_db),
):
    """Backfill duration_minutes for existing interviews that have 0 or NULL duration."""
    interviews = db.query(VideoInterview).filter(
        VideoInterview.started_at.isnot(None),
        VideoInterview.ended_at.isnot(None),
        (VideoInterview.duration_minutes == 0) | (VideoInterview.duration_minutes.is_(None))
    ).all()

    updated = 0
    for vi in interviews:
        diff_seconds = (vi.ended_at - vi.started_at).total_seconds()
        if diff_seconds >= 120:  # Only set if >= 2 minutes (avoids bad data from same-time timestamps)
            vi.duration_minutes = max(1, int(round(diff_seconds / 60)))
            updated += 1

    db.commit()
    return {"message": f"Updated {updated} of {len(interviews)} interviews with 0/null duration"}


# POST /api/video/interviews/migrate-recordings-to-cloudinary
# One-time migration: upload local recordings to Cloudinary & update DB URLs
# ---------------------------------------------------------------------------

@router.post("/api/video/interviews/migrate-recordings-to-cloudinary")
def migrate_recordings_to_cloudinary(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Migrate local recordings to Cloudinary (admin only, one-time)."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")

    from services.cloudinary_upload import upload_recording as cloudinary_upload

    interviews = db.query(VideoInterview).filter(
        VideoInterview.recording_url.isnot(None),
        ~VideoInterview.recording_url.like("http%"),
    ).all()

    results = {"success": 0, "failed": 0, "skipped": 0, "details": []}

    for vi in interviews:
        filename = os.path.basename(vi.recording_url)
        recordings_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "recordings")
        file_path = os.path.join(recordings_dir, filename)

        if not os.path.exists(file_path):
            results["skipped"] += 1
            results["details"].append(f"ID={vi.id}: file not found ({filename})")
            continue

        try:
            url = cloudinary_upload(file_path, vi.id)
            if url:
                vi.recording_url = url
                db.commit()
                results["success"] += 1
                results["details"].append(f"ID={vi.id}: OK -> {url}")
            else:
                results["failed"] += 1
                results["details"].append(f"ID={vi.id}: Cloudinary returned None")
        except Exception as e:
            results["failed"] += 1
            results["details"].append(f"ID={vi.id}: ERROR {e}")

    return results
