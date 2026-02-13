"""
Video Interview API Endpoints.

Manages the full lifecycle of video interviews: scheduling, listing,
updating, starting, ending, and cancellation. Integrates with the
Zoom service for meeting creation/deletion and checks for associated
fraud analysis records.
"""

from fastapi import APIRouter, Body, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime, timezone

import sys
import os
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
    InterviewAnswer,
)
from schemas import (
    VideoInterviewCreate,
    VideoInterviewResponse,
    VideoInterviewUpdate,
    VideoInterviewListResponse,
    VideoInterviewEndRequest,
)
from api.auth.jwt_handler import get_current_active_user, require_any_role
from services.zoom_service import create_zoom_meeting, delete_zoom_meeting
from services.email_service import send_interview_notification
from services.transcript_generator import generate_transcript_for_video_interview
from services.groq_service import transcribe_audio_with_groq

router = APIRouter(tags=["Video Interviews"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_response(vi: VideoInterview, db: Session = None, questions_approved: bool = True) -> VideoInterviewResponse:
    """Build a VideoInterviewResponse from an ORM object with joined names."""
    candidate_name = None
    application = None

    # Try to get name from JobApplication first (more accurate)
    if db and vi.candidate:
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id,
            JobApplication.applicant_email == vi.candidate.email
        ).first()
        if application:
            candidate_name = application.applicant_name

    # Fallback to User table
    if not candidate_name and vi.candidate:
        candidate_name = vi.candidate.full_name or vi.candidate.username

    interviewer_name = None
    if vi.interviewer:
        interviewer_name = vi.interviewer.full_name or vi.interviewer.username

    job_title = vi.job.title if vi.job else None
    interview_type = vi.job.interview_type if vi.job else "Both"

    # Fetch score data from InterviewSession
    overall_score = None
    recommendation = None
    strengths = None
    weaknesses = None
    per_question_scores = None
    interview_session_id = None

    if db:
        # Try to find the InterviewSession for this interview
        candidate_id_for_session = application.id if application else vi.candidate_id

        session = db.query(InterviewSession).filter(
            InterviewSession.job_id == vi.job_id,
            InterviewSession.application_id == candidate_id_for_session
        ).first()

        # Fallback: try with candidate_id directly
        if not session:
            session = db.query(InterviewSession).filter(
                InterviewSession.job_id == vi.job_id,
                InterviewSession.candidate_id == vi.candidate_id
            ).first()

        if session and session.overall_score is not None:
            interview_session_id = session.id  # Store session ID for Results page navigation
            overall_score = session.overall_score
            recommendation = session.recommendation.value if hasattr(session.recommendation, "value") else str(session.recommendation) if session.recommendation else None
            strengths = session.strengths
            weaknesses = session.weaknesses

            # Fetch per-question scores
            answers = db.query(InterviewAnswer).filter(
                InterviewAnswer.session_id == session.id
            ).all()

            if answers:
                per_question_scores = [
                    {
                        "question_id": ans.question_id,
                        "score": ans.score,
                        "relevance_score": ans.relevance_score,
                        "completeness_score": ans.completeness_score,
                        "accuracy_score": ans.accuracy_score,
                        "clarity_score": ans.clarity_score,
                        "feedback": ans.feedback,
                        "extracted_answer": ans.answer_text
                    }
                    for ans in answers
                ]

    return VideoInterviewResponse(
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
    )


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
        # Validate job exists
        job = db.query(Job).filter(Job.id == body.job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

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

        # Attempt to create a Zoom meeting
        topic = f"Interview: {job.title} - {candidate_name_for_email}"
        zoom_data = create_zoom_meeting(
            topic=topic,
            start_time=body.scheduled_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
            duration=body.duration_minutes,
        )

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

        if zoom_data:
            vi.zoom_meeting_id = zoom_data["meeting_id"]
            vi.zoom_meeting_url = zoom_data["join_url"]
            vi.zoom_host_url = zoom_data["host_url"]
            vi.zoom_passcode = zoom_data["passcode"]

        db.add(vi)
        db.commit()
        db.refresh(vi)

        # Send email notification to candidate
        try:
            interview_date = body.scheduled_at.strftime("%B %d, %Y")
            interview_time = body.scheduled_at.strftime("%I:%M %p")

            # Use video-room URL instead of Zoom meeting URL
            frontend_url = os.getenv("FRONTEND_URL", "https://ai-interview-platform-unqg.vercel.app")
            meeting_url = f"{frontend_url}/video-room/{vi.id}"

            send_interview_notification(
                candidate_email=candidate_email_for_notification,
                candidate_name=candidate_name_for_email,
                job_title=job.title,
                interview_date=interview_date,
                interview_time=interview_time,
                meeting_url=meeting_url
            )
            print(f"📧 Interview notification sent to {candidate_email_for_notification}")
        except Exception as e:
            print(f"⚠️ Failed to send email notification: {e}")

        # Check questions status for this candidate (after interview is created)
        from models import InterviewQuestion
        from services.ai_question_generator import get_question_generator

        candidate_id_for_questions = application.id if application else body.candidate_id
        questions_approved = True

        # Check for existing questions
        existing_questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == body.job_id,
            InterviewQuestion.candidate_id == candidate_id_for_questions
        ).all()

        if len(existing_questions) == 0:
            # No questions exist - auto-generate them
            print(f"🤖 No questions found for candidate {candidate_id_for_questions}, auto-generating...")
            try:
                generator = get_question_generator()
                result = generator.generate_questions(
                    db=db,
                    job_id=body.job_id,
                    candidate_id=candidate_id_for_questions,
                    total_questions=10
                )
                print(f"✅ Auto-generated {result['total_questions']} questions for video interview")
            except Exception as e:
                print(f"⚠️ Failed to auto-generate questions: {e}")
                import traceback
                traceback.print_exc()
            questions_approved = False
        else:
            # Questions exist - check if they are approved
            approved_count = sum(1 for q in existing_questions if q.is_approved)
            print(f"✅ Found {len(existing_questions)} existing questions ({approved_count} approved) for candidate {candidate_id_for_questions}")

            if approved_count == 0:
                questions_approved = False

        return _build_response(vi, db, questions_approved=questions_approved)
    
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
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    List video interviews.
    Recruiters/Admins see all; Candidates see only their own.
    """
    try:
        query = db.query(VideoInterview).options(
            joinedload(VideoInterview.candidate),
            joinedload(VideoInterview.interviewer),
            joinedload(VideoInterview.job),
        )
        if current_user.role == UserRole.CANDIDATE:
            query = query.filter(VideoInterview.candidate_id == current_user.id)

        interviews = query.order_by(VideoInterview.scheduled_at.desc()).limit(100).all()
        
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

        # Build responses with pre-fetched data
        result = []
        for vi in interviews:
            fraud = fraud_map.get(vi.id)

            candidate_name = ""
            if vi.candidate:
                candidate_name = app_name_map.get((vi.job_id, vi.candidate.email), "")
                if not candidate_name:
                    candidate_name = vi.candidate.full_name or vi.candidate.username or ""

            job_title = vi.job.title if vi.job else ""
            
            result.append(VideoInterviewListResponse(
                id=vi.id,
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
    return [_build_response(vi, db) for vi in interviews]


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
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    if body.status is not None:
        vi.status = body.status
    if body.scheduled_at is not None:
        vi.scheduled_at = body.scheduled_at
    if body.duration_minutes is not None:
        vi.duration_minutes = body.duration_minutes
    if body.notes is not None:
        vi.notes = body.notes

    db.commit()
    db.refresh(vi)
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
    """Mark a video interview as started."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    vi.status = VideoInterviewStatus.IN_PROGRESS.value
    vi.started_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(vi)
    return _build_response(vi, db)


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
    """Mark a video interview as completed and generate transcript."""
    from models import InterviewQuestion, JobApplication, InterviewSessionStatus

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    max_participants = body.max_participants if body else None
    print(f"[end_interview] video_id={video_id}, max_participants={max_participants}")

    # If only 1 participant (or 0), candidate never joined — mark as no-show
    if max_participants is not None and max_participants < 2:
        print(f"[end_interview] No-show detected: max_participants={max_participants}, no recording")
        vi.status = VideoInterviewStatus.NO_SHOW.value
        vi.ended_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(vi)
        return _build_response(vi, db)

    vi.status = VideoInterviewStatus.COMPLETED.value
    vi.ended_at = datetime.now(timezone.utc)

    # Generate transcript — try REAL transcription first, fall back to mock
    try:
        candidate_name = None
        interviewer_name = None
        job_title = None

        if vi.candidate:
            candidate_name = vi.candidate.full_name or vi.candidate.username
        if vi.interviewer:
            interviewer_name = vi.interviewer.full_name or vi.interviewer.username
        if vi.job:
            job_title = vi.job.title

        # Fetch actual interview questions for this candidate/job
        actual_questions = []
        if vi.job_id:
            # Get ALL questions for this job first
            all_job_questions = db.query(InterviewQuestion).filter(
                InterviewQuestion.job_id == vi.job_id
            ).all()

            # Try to find the right candidate_id
            possible_candidate_ids = []

            # Method 1: Find JobApplication by email
            if vi.candidate:
                application = db.query(JobApplication).filter(
                    JobApplication.job_id == vi.job_id,
                    JobApplication.applicant_email == vi.candidate.email
                ).first()
                if application:
                    possible_candidate_ids.append(application.id)

            # Method 2: Use vi.candidate_id
            if vi.candidate_id and vi.candidate_id not in possible_candidate_ids:
                possible_candidate_ids.append(vi.candidate_id)

            # Method 3: Try all candidate_ids that exist in questions for this job
            existing_candidate_ids = set(q.candidate_id for q in all_job_questions)
            for ecid in existing_candidate_ids:
                if ecid not in possible_candidate_ids:
                    possible_candidate_ids.append(ecid)

            # Try each candidate_id until we find approved questions
            questions = []
            for cid in possible_candidate_ids:
                questions = db.query(InterviewQuestion).filter(
                    InterviewQuestion.job_id == vi.job_id,
                    InterviewQuestion.candidate_id == cid,
                    InterviewQuestion.is_approved == True
                ).all()
                if questions:
                    print(f"[end_interview] Found {len(questions)} approved questions with candidate_id={cid}")
                    break

            # If no approved questions, try all questions
            if not questions:
                for cid in possible_candidate_ids:
                    questions = db.query(InterviewQuestion).filter(
                        InterviewQuestion.job_id == vi.job_id,
                        InterviewQuestion.candidate_id == cid
                    ).all()
                    if questions:
                        print(f"[end_interview] Found {len(questions)} questions (not all approved) with candidate_id={cid}")
                        break

            if questions:
                actual_questions = [
                    {"question_text": q.question_text, "sample_answer": q.sample_answer or ""}
                    for q in questions
                ]
                print(f"[end_interview] Using {len(actual_questions)} questions for transcript generation")

        # --- Try REAL transcription from recording file ---
        real_transcript = None
        if vi.recording_url:
            recording_path = vi.recording_url
            # Resolve relative paths to absolute
            if not os.path.isabs(recording_path):
                base_dir = os.path.dirname(os.path.abspath(__file__))
                backend_dir = os.path.join(base_dir, '..', '..', '..')
                recording_path = os.path.normpath(os.path.join(backend_dir, recording_path))
            print(f"[end_interview] Attempting real transcription from: {recording_path}")
            real_transcript = transcribe_audio_with_groq(recording_path)

        if real_transcript:
            print(f"[end_interview] Using REAL transcript ({len(real_transcript)} chars)")
            vi.transcript = real_transcript
            vi.transcript_source = "recording"
        else:
            # Fall back to mock transcript generator
            print(f"[end_interview] No real recording/transcription, using mock generator")
            transcript = generate_transcript_for_video_interview(
                video_interview_id=vi.id,
                candidate_name=candidate_name,
                interviewer_name=interviewer_name,
                job_title=job_title,
                duration_minutes=vi.duration_minutes or 30,
                actual_questions=actual_questions if actual_questions else None
            )
            vi.transcript = transcript
            vi.transcript_source = "mock"

        vi.transcript_generated_at = datetime.now(timezone.utc)
        print(f"[end_interview] Transcript saved for video interview {video_id}")
    except Exception as e:
        print(f"[end_interview] Failed to generate transcript: {e}")
        import traceback
        traceback.print_exc()

    # Create InterviewSession to link video interview with scoring pipeline
    try:
        application = None
        if vi.candidate:
            application = db.query(JobApplication).filter(
                JobApplication.job_id == vi.job_id,
                JobApplication.applicant_email == vi.candidate.email
            ).first()

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
        print(f"[end_interview] Created InterviewSession id={session.id} for video interview {video_id}")
    except Exception as e:
        print(f"[end_interview] Failed to create InterviewSession: {e}")
        import traceback
        traceback.print_exc()

    db.commit()
    db.refresh(vi)
    return _build_response(vi, db)


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

    # Generate transcript if not exists
    if not vi.transcript:
        from models import InterviewQuestion, JobApplication

        try:
            candidate_name = None
            interviewer_name = None
            job_title = None

            if vi.candidate:
                candidate_name = vi.candidate.full_name or vi.candidate.username
            if vi.interviewer:
                interviewer_name = vi.interviewer.full_name or vi.interviewer.username
            if vi.job:
                job_title = vi.job.title

            # Fetch actual interview questions for this candidate/job
            actual_questions = []
            if vi.job_id:
                # Get ALL questions for this job first
                all_job_questions = db.query(InterviewQuestion).filter(
                    InterviewQuestion.job_id == vi.job_id
                ).all()

                # Try multiple candidate_ids
                possible_candidate_ids = []
                if vi.candidate:
                    application = db.query(JobApplication).filter(
                        JobApplication.job_id == vi.job_id,
                        JobApplication.applicant_email == vi.candidate.email
                    ).first()
                    if application:
                        possible_candidate_ids.append(application.id)
                if vi.candidate_id and vi.candidate_id not in possible_candidate_ids:
                    possible_candidate_ids.append(vi.candidate_id)
                for ecid in set(q.candidate_id for q in all_job_questions):
                    if ecid not in possible_candidate_ids:
                        possible_candidate_ids.append(ecid)

                questions = []
                for cid in possible_candidate_ids:
                    questions = db.query(InterviewQuestion).filter(
                        InterviewQuestion.job_id == vi.job_id,
                        InterviewQuestion.candidate_id == cid,
                        InterviewQuestion.is_approved == True
                    ).all()
                    if questions:
                        break
                if not questions:
                    for cid in possible_candidate_ids:
                        questions = db.query(InterviewQuestion).filter(
                            InterviewQuestion.job_id == vi.job_id,
                            InterviewQuestion.candidate_id == cid
                        ).all()
                        if questions:
                            break

                if questions:
                    actual_questions = [
                        {"question_text": q.question_text, "sample_answer": q.sample_answer or ""}
                        for q in questions
                    ]

            transcript = generate_transcript_for_video_interview(
                video_interview_id=vi.id,
                candidate_name=candidate_name,
                interviewer_name=interviewer_name,
                job_title=job_title,
                duration_minutes=vi.duration_minutes or 30,
                actual_questions=actual_questions if actual_questions else None
            )
            vi.transcript = transcript
            vi.transcript_generated_at = datetime.now(timezone.utc)
            vi.transcript_source = "mock"
            db.commit()
            db.refresh(vi)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate transcript: {e}")

    return {
        "video_interview_id": vi.id,
        "transcript": vi.transcript,
        "generated_at": vi.transcript_generated_at.isoformat() if vi.transcript_generated_at else None,
        "candidate_name": vi.candidate.full_name or vi.candidate.username if vi.candidate else None,
        "job_title": vi.job.title if vi.job else None
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
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get approved questions for AI-driven interview."""
    from models import InterviewQuestion, JobApplication

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # Candidates can only view their own
    if (
        current_user.role == UserRole.CANDIDATE
        and vi.candidate_id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Access denied")

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
        raise HTTPException(
            status_code=400,
            detail="No approved questions found for this interview. Please approve questions in Manage Candidates first."
        )

    return {
        "video_interview_id": vi.id,
        "job_title": vi.job.title if vi.job else None,
        "candidate_name": vi.candidate.full_name or vi.candidate.username if vi.candidate else None,
        "questions": [
            {
                "id": q.id,
                "question_text": q.question_text,
                "question_type": q.question_type or "technical",
                "difficulty": q.difficulty or "intermediate",
                "skill_focus": q.skill_focus
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
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Submit answers from AI interview and generate score."""
    from models import InterviewQuestion, InterviewSession, InterviewAnswer, Recommendation, InterviewSessionStatus, JobApplication
    from services.groq_service import score_transcript_with_groq
    from services.gemini_service import score_transcript_with_gemini
    import config

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    answers = body.get("answers", [])
    if not answers:
        raise HTTPException(status_code=400, detail="No answers provided")

    # Find JobApplication for this candidate
    application = None
    if vi.candidate:
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id,
            JobApplication.applicant_email == vi.candidate.email
        ).first()

    candidate_id_for_questions = application.id if application else vi.candidate_id

    # Get the questions to score against
    question_ids = [a["question_id"] for a in answers]
    questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.id.in_(question_ids)
    ).all()

    if not questions:
        raise HTTPException(status_code=400, detail="Questions not found")

    # Build transcript from answers for scoring
    candidate_name = vi.candidate.full_name or vi.candidate.username if vi.candidate else "Candidate"
    transcript_lines = []
    for answer in answers:
        q = next((q for q in questions if q.id == answer["question_id"]), None)
        if q:
            transcript_lines.append(f"[00:00] Interviewer: {q.question_text}")
            transcript_lines.append(f"[00:00] {candidate_name}: {answer['answer_text']}")

    transcript_text = "\n".join(transcript_lines)

    # Save transcript to video interview
    vi.transcript = transcript_text
    vi.transcript_generated_at = datetime.now(timezone.utc)
    vi.transcript_source = "recording"  # AI interview answers come from live session
    vi.status = VideoInterviewStatus.COMPLETED.value
    vi.ended_at = datetime.now(timezone.utc)

    # Prepare questions for scoring
    questions_for_scoring = [
        {
            "question_id": q.id,
            "question_text": q.question_text,
            "sample_answer": q.sample_answer or ""
        }
        for q in questions
    ]

    # Score with Groq (primary), Gemini (fallback)
    score_result = None
    llm_result = None
    try:
        if config.GROQ_API_KEY:
            llm_result = score_transcript_with_groq(transcript_text, questions_for_scoring)
    except Exception as e:
        print(f"[WARN] Groq scoring failed: {e}")

    if not llm_result:
        try:
            if config.GEMINI_API_KEY:
                llm_result = score_transcript_with_gemini(transcript_text, questions_for_scoring)
        except Exception as e:
            print(f"[WARN] Gemini scoring also failed: {e}")

    if llm_result:
        score_result = {
            "overall_score": llm_result.get("overall_score", 0),
            "recommendation": llm_result.get("recommendation", ""),
            "strengths": llm_result.get("strengths", ""),
            "weaknesses": llm_result.get("weaknesses", ""),
            "per_question": llm_result.get("per_question", [])
        }

        # Create or update interview session
        session = db.query(InterviewSession).filter(
            InterviewSession.job_id == vi.job_id,
            InterviewSession.application_id == candidate_id_for_questions
        ).first()

        if not session:
            session = InterviewSession(
                job_id=vi.job_id,
                candidate_id=vi.candidate_id,
                application_id=candidate_id_for_questions,
                status=InterviewSessionStatus.SCORED,
                interview_mode="ai_interview",
                started_at=datetime.now(timezone.utc)
            )
            db.add(session)
            db.flush()

        session.transcript_text = transcript_text
        session.overall_score = float(llm_result.get("overall_score", 0))
        rec_str = llm_result.get("recommendation", "reject")
        session.recommendation = Recommendation(rec_str) if rec_str in ("select", "next_round", "reject") else Recommendation.REJECT
        session.strengths = llm_result.get("strengths", "")
        session.weaknesses = llm_result.get("weaknesses", "")
        session.status = InterviewSessionStatus.SCORED
        session.completed_at = datetime.now(timezone.utc)

        # Save individual answers with scores
        for answer in answers:
            q_id = answer["question_id"]
            pq = next((p for p in llm_result.get("per_question", []) if p.get("question_id") == q_id), {})

            existing_answer = db.query(InterviewAnswer).filter(
                InterviewAnswer.session_id == session.id,
                InterviewAnswer.question_id == q_id
            ).first()

            if existing_answer:
                ans = existing_answer
            else:
                ans = InterviewAnswer(session_id=session.id, question_id=q_id)
                db.add(ans)

            ans.answer_text = answer["answer_text"]
            ans.score = float(pq.get("score", 0))
            ans.relevance_score = float(pq.get("relevance_score", 0))
            ans.completeness_score = float(pq.get("completeness_score", 0))
            ans.accuracy_score = float(pq.get("accuracy_score", 0))
            ans.clarity_score = float(pq.get("clarity_score", 0))
            ans.feedback = pq.get("feedback", "")

    db.commit()
    db.refresh(vi)

    return {
        "message": "AI Interview completed and scored successfully",
        "video_interview_id": vi.id,
        "answers_saved": len(answers),
        "score_generated": score_result is not None,
        "score_result": score_result
    }


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

    # Error if no questions found for this candidate
    if not approved_questions:
        print(f"❌ No questions found for job_id={vi.job_id} with any candidate_id tried: {possible_candidate_ids}")
        raise HTTPException(
            status_code=400,
            detail=f"No questions found for this candidate (tried IDs: {possible_candidate_ids}). Please generate and approve questions in Manage Candidates before uploading transcript."
        )

    score_result = None
    scoring_error = None
    llm_result = None

    if approved_questions:
        # Prepare questions for LLM scoring
        questions_for_scoring = [
            {
                "question_id": q.id,
                "question_text": q.question_text,
                "sample_answer": q.sample_answer or ""
            }
            for q in approved_questions
        ]

        # Score with Groq (primary), Gemini (fallback)
        import config

        # Try Groq first (free, fast)
        if config.GROQ_API_KEY:
            try:
                print(f"[AI] Scoring transcript with Groq API (primary)...")
                llm_result = score_transcript_with_groq(transcript_text, questions_for_scoring)
                if llm_result:
                    print(f"[OK] Groq scoring succeeded")
            except Exception as e:
                print(f"[WARN] Groq scoring failed: {e}")
                llm_result = None

        # Fallback to Gemini
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
            session.overall_score = float(llm_result.get("overall_score", 0))
            rec_str = llm_result.get("recommendation", "reject")
            session.recommendation = Recommendation(rec_str) if rec_str in ("select", "next_round", "reject") else Recommendation.REJECT
            session.strengths = llm_result.get("strengths", "")
            session.weaknesses = llm_result.get("weaknesses", "")
            session.status = InterviewSessionStatus.SCORED
            session.completed_at = datetime.now(timezone.utc)

            # Build score_result with session ID for frontend navigation
            score_result = {
                "overall_score": llm_result.get("overall_score", 0),
                "recommendation": llm_result.get("recommendation", ""),
                "strengths": llm_result.get("strengths", ""),
                "weaknesses": llm_result.get("weaknesses", ""),
                "per_question": llm_result.get("per_question", []),
                "interview_session_id": session.id  # For navigating to Results page
            }

            # Save per-question answers with extracted answers from transcript
            # Build a map of question IDs from the approved questions for validation
            valid_question_ids = {q.id for q in approved_questions}

            for pq in llm_result.get("per_question", []):
                q_id = pq.get("question_id")
                if not q_id:
                    continue

                # Ensure question_id is int (LLM may return string)
                try:
                    q_id = int(q_id)
                except (ValueError, TypeError):
                    print(f"⚠️ Invalid question_id from LLM: {q_id}, skipping")
                    continue

                # Validate question_id exists in our approved questions
                if q_id not in valid_question_ids:
                    print(f"⚠️ question_id {q_id} not in approved questions, skipping")
                    continue

                # Find or create answer record
                existing_answer = db.query(InterviewAnswer).filter(
                    InterviewAnswer.session_id == session.id,
                    InterviewAnswer.question_id == q_id
                ).first()

                if existing_answer:
                    answer = existing_answer
                else:
                    answer = InterviewAnswer(session_id=session.id, question_id=q_id)
                    db.add(answer)

                # Save extracted answer from transcript
                extracted = pq.get("extracted_answer", "")
                # Don't save placeholder texts - keep the actual extracted answer
                if extracted and extracted not in ("[Extracted from Transcript]", "No answer found in transcript", ""):
                    answer.answer_text = extracted
                elif existing_answer and existing_answer.answer_text and existing_answer.answer_text not in ("[Extracted from Transcript]", ""):
                    pass  # Keep existing non-placeholder answer
                else:
                    answer.answer_text = extracted or "Answer not extracted from transcript"

                # Store scores on 0-100 scale (internal standard)
                answer.score = float(pq.get("score", 0))
                answer.relevance_score = float(pq.get("relevance_score", 0))
                answer.completeness_score = float(pq.get("completeness_score", 0))
                answer.accuracy_score = float(pq.get("accuracy_score", 0))
                answer.clarity_score = float(pq.get("clarity_score", 0))
                answer.feedback = pq.get("feedback", "")
        else:
            # Scoring failed but still save session with transcript
            score_result = {
                "interview_session_id": session.id
            }

    db.commit()
    db.refresh(vi)

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

    # Save file to uploads/recordings/
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"interview_{video_id}_{timestamp}.webm"
    recordings_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "recordings")
    os.makedirs(recordings_dir, exist_ok=True)
    file_path = os.path.join(recordings_dir, filename)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    vi.recording_url = f"/uploads/recordings/{filename}"
    db.commit()
    db.refresh(vi)

    print(f"🎥 Recording saved: {file_path} ({len(contents)} bytes)")
    return {"message": "Recording uploaded successfully", "recording_url": vi.recording_url}


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

    file_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", vi.recording_url.lstrip("/"))
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Recording file not found")

    return FileResponse(file_path, media_type="video/webm", filename=os.path.basename(file_path))
