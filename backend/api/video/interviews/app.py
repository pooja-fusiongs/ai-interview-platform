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
from services.email_service import send_interview_notification, send_interview_result_notification
from services.groq_service import transcribe_audio_with_groq

router = APIRouter(tags=["Video Interviews"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_response(vi: VideoInterview, db: Session = None, questions_approved: bool = True) -> VideoInterviewResponse:
    """Build a VideoInterviewResponse from an ORM object with joined names."""
    print(f"[DEBUG] Building response for interview {vi.id}")
    
    try:
        candidate_name = None
        application = None

        # Try to get name from JobApplication first (more accurate)
        if db and vi.candidate:
            print(f"[DEBUG] Looking for application for job_id={vi.job_id}, email={vi.candidate.email}")
            application = db.query(JobApplication).filter(
                JobApplication.job_id == vi.job_id,
                JobApplication.applicant_email == vi.candidate.email
            ).first()
            if application:
                candidate_name = application.applicant_name
                print(f"[DEBUG] Found candidate name from application: {candidate_name}")

        # Fallback to User table
        if not candidate_name and vi.candidate:
            candidate_name = vi.candidate.full_name or vi.candidate.username
            print(f"[DEBUG] Using fallback candidate name: {candidate_name}")

        interviewer_name = None
        if vi.interviewer:
            interviewer_name = vi.interviewer.full_name or vi.interviewer.username

        job_title = vi.job.title if vi.job else None
        interview_type = vi.job.interview_type if vi.job else "Both"
        print(f"[DEBUG] Job title: {job_title}, Interview type: {interview_type}")

        # Fetch score data from InterviewSession
        overall_score = None
        recommendation = None
        strengths = None
        weaknesses = None
        per_question_scores = None
        interview_session_id = None

        if db:
            print(f"[DEBUG] Looking for interview session data")
            
            session = None
            if vi.session_id is not None:
                session = db.query(InterviewSession).filter(InterviewSession.id == vi.session_id).first()

            if session and session.overall_score is not None:
                print(f"[DEBUG] Found session data for interview {vi.id}")
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
            else:
                print(f"[DEBUG] No session data found for interview {vi.id}")

        print(f"[DEBUG] Creating VideoInterviewResponse for interview {vi.id}")
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
        )
        
        print(f"[DEBUG] Successfully built response for interview {vi.id}")
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
    print(f"[DEBUG] list_video_interviews called by: {current_user.email}, role: {current_user.role}")
    
    # Test database connection
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        print("[DEBUG] Database connection OK")
    except Exception as e:
        print(f"[DEBUG] Database connection failed: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    try:
        query = db.query(VideoInterview).options(
            joinedload(VideoInterview.candidate),
            joinedload(VideoInterview.interviewer),
            joinedload(VideoInterview.job),
        )
        if current_user.role == UserRole.CANDIDATE:
            query = query.filter(VideoInterview.candidate_id == current_user.id)
            print(f"[DEBUG] Filtering for candidate_id: {current_user.id}")
        elif current_user.role == UserRole.RECRUITER:
            query = query.filter(VideoInterview.interviewer_id == current_user.id)
            print(f"[DEBUG] Filtering for interviewer_id: {current_user.id}")

        interviews = query.order_by(VideoInterview.scheduled_at.desc()).limit(100).all()
        print(f"[DEBUG] Found {len(interviews)} interviews")
        
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

        token_data = await generate_livekit_token(TokenRequest(
            room_name=room_name,
            participant_name=current_user.full_name or current_user.username,
            participant_identity=str(current_user.id),
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
        return {
            "success": True,
            "message": "Interview started, but token generation failed",
            "video_id": video_id,
            "status": vi.status,
            "error": str(e)
        }


# ---------------------------------------------------------------------------
# GUEST (Candidate) Endpoints — No Auth Required
# Candidates join via email link, no login needed
# ---------------------------------------------------------------------------

@router.get("/api/video/guest/{video_id}")
def guest_get_interview(
    video_id: int,
    db: Session = Depends(get_db),
):
    """Get interview details for guest candidate (no auth)."""
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
    db: Session = Depends(get_db),
):
    """
    Guest candidate joins interview — no auth required.
    Sets status to IN_PROGRESS.
    """
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

        token_data = await generate_livekit_token(TokenRequest(
            room_name=room_name,
            participant_name=candidate_name,
            participant_identity=f"guest_candidate_{video_id}",
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
    db: Session = Depends(get_db),
):
    """Update recording consent for guest candidate (no auth)."""
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
            
        if vi.recording_url and not vi.transcript:
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
                    vi.transcript_source = "failed"
                    vi.transcript_error = "Recording file not found"
            except Exception as e:
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
    db: Session = Depends(get_db),
):
    """End interview for guest candidate (no auth). Also generates transcript from recording."""
    from models import InterviewQuestion, JobApplication, InterviewSession, InterviewSessionStatus

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    already_completed = vi.status == VideoInterviewStatus.COMPLETED.value
    if not already_completed:
        vi.status = VideoInterviewStatus.COMPLETED.value
        vi.ended_at = datetime.now(timezone.utc)

    # Create InterviewSession only if one doesn't already exist (avoid duplicates when both sides call /end)
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
                status=InterviewSessionStatus.IN_PROGRESS,
                interview_mode="video_interview",
                started_at=vi.started_at or vi.scheduled_at,
            )
            db.add(session)
            db.flush()
            vi.session_id = session.id
            print(f"[guest_end] Created InterviewSession id={session.id}")
        except Exception as e:
            print(f"[guest_end] Failed to create InterviewSession: {e}")
    else:
        print(f"[guest_end] InterviewSession already exists (id={vi.session_id}), skipping creation")

    db.commit()
    db.refresh(vi)

    # Start background transcription only if not already completed (avoid duplicate processing)
    if not vi.transcript:
        _start_background_transcription_task(
            vi_id=video_id,
            job_id=vi.job_id,
            started_at=vi.started_at or vi.scheduled_at,
            recording_url_hint=vi.recording_url,
            session_id=vi.session_id
        )

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
    try:
        from database import get_safe_db
        bg_db = get_safe_db()
        print(f"[BG Transcription] Starting for vi_id={vi_id}")

        # Wait a moment for recording upload to commit (race condition fix)
        _time.sleep(1)

        bg_vi = bg_db.query(VideoInterview).filter(VideoInterview.id == vi_id).first()
        if not bg_vi:
            print(f"[BG Transcription] VideoInterview {vi_id} not found")
            return

        # Already has transcript (another thread may have finished)
        if bg_vi.transcript:
            print(f"[BG Transcription] Transcript already exists for vi_id={vi_id}, skipping")
            return

        # Re-read recording_url from DB
        actual_recording_url = bg_vi.recording_url or recording_url_hint

        # If still no recording_url, wait and retry (upload might be in progress)
        if not actual_recording_url:
            print(f"[BG Transcription] No recording_url yet, waiting 10s for upload...")
            _time.sleep(10)
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

        # Resolve recording file path
        recording_filename = os.path.basename(actual_recording_url)
        recordings_dir = os.path.normpath(os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "uploads", "recordings"
        ))
        recording_path = os.path.join(recordings_dir, recording_filename)

        # Wait for recording file to appear on disk
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

            # === TRY 1: PyAnnote diarization + Whisper timestamps (best quality) ===
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

            except Exception as diar_err:
                print(f"[BG Transcription] Diarization failed (falling back): {diar_err}")

            # === TRY 2: Fallback to existing method (no speaker diarization) ===
            if not transcript_text:
                transcript_data = create_real_transcript(
                    interview_id=vi_id,
                    recording_path=recording_path,
                    interview_start_time=started_at,
                    interview_end_time=bg_vi.ended_at or datetime.now(timezone.utc),
                    question_timestamps=actual_questions if actual_questions else None
                )
                transcript_text = transcript_data["transcript_text"]
                print(f"[BG Transcription] Fallback success ({len(transcript_text)} chars)")

            bg_vi.transcript = transcript_text
            bg_vi.transcript_source = "recording"
            bg_vi.transcript_generated_at = datetime.now(timezone.utc)

            # Update InterviewSession
            sid = session_id or bg_vi.session_id
            if sid:
                bg_session = bg_db.query(InterviewSession).filter(InterviewSession.id == sid).first()
                if bg_session:
                    bg_session.transcript_text = transcript_text

            bg_db.commit()
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
                # Even if analysis fails, mark as completed so dashboard doesn't show "pending" forever
                try:
                    err_db = get_safe_db()
                    fa = err_db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == vi_id).first()
                    if fa and fa.analysis_status == "pending":
                        fa.analysis_status = "completed"
                        fa.analyzed_at = datetime.now(timezone.utc)
                        err_db.commit()
                    err_db.close()
                except Exception:
                    pass

    except Exception as e:
        print(f"[BG Transcription] Fatal error: {e}")
        traceback.print_exc()
    finally:
        if bg_db: bg_db.close()

    return {"message": "Interview ended", "status": vi.status}


@router.post("/api/video/guest/{video_id}/upload-recording")
async def guest_upload_recording(
    video_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload recording for guest candidate (no auth)."""
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    # First upload wins — skip if recording already exists (both sides record, avoid overwrite)
    if vi.recording_url:
        print(f"🎥 Guest recording already exists for vi={video_id}, skipping duplicate upload")
        return {"message": "Recording already uploaded", "recording_url": vi.recording_url}

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"interview_{video_id}_{timestamp}.webm"
    recordings_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "recordings")
    os.makedirs(recordings_dir, exist_ok=True)
    file_path = os.path.join(recordings_dir, filename)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    vi.recording_url = f"/uploads/recordings/{filename}"
    vi.recording_data = contents  # Store in DB for cross-machine access
    db.commit()
    db.refresh(vi)

    print(f"🎥 Guest recording saved: {file_path} + DB ({len(contents)} bytes)")

    # AUTOMATIC TRANSCRIPTION: Trigger immediately after upload
    _start_background_transcription_task(
        vi_id=video_id,
        job_id=vi.job_id,
        started_at=vi.started_at or vi.scheduled_at,
        recording_url_hint=vi.recording_url,
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
    from models import InterviewQuestion, JobApplication, InterviewSessionStatus

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    max_participants = body.max_participants if body else None
    print(f"[end_interview] video_id={video_id}, max_participants={max_participants}, current_status={vi.status}")

    # If status is WAITING_FOR_CANDIDATE, don't change it when recruiter leaves
    if vi.status == VideoInterviewStatus.WAITING.value:
        print(f"[end_interview] Status is WAITING_FOR_CANDIDATE, keeping it (recruiter left)")
        # Don't change status, candidate can still join within grace period
        return _build_response(vi, db)

    # Only mark as no_show if candidate never actually joined
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

    # If already completed (other side called /end first), just return
    if vi.status == VideoInterviewStatus.COMPLETED.value:
        print(f"[end_interview] Already COMPLETED, skipping duplicate end")
        return _build_response(vi, db)

    vi.status = VideoInterviewStatus.COMPLETED.value
    vi.ended_at = datetime.now(timezone.utc)

    print(f"[end_interview] recording_url={vi.recording_url}")

    # Create InterviewSession only if one doesn't already exist (avoid duplicates when both sides call /end)
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
                status=InterviewSessionStatus.IN_PROGRESS,
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

    db.commit()
    db.refresh(vi)

    # --- Generate transcript in BACKGROUND THREAD (only if not already done) ---
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
    
    # Calculate if grace period expired
    scheduled_time = vi.scheduled_at
    now = datetime.now(timezone.utc)
    grace_period_end = scheduled_time + timedelta(minutes=grace_minutes)
    
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

    # Calculate if grace period expired
    scheduled_time = vi.scheduled_at
    now = datetime.now(timezone.utc)
    grace_period_end = scheduled_time + timedelta(minutes=grace_minutes)

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
    db: Session = Depends(get_db),
):
    """
    Get approved questions for AI-driven interview.
    NO AUTH REQUIRED - AI agent cannot authenticate.
    """
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
        raise HTTPException(
            status_code=400,
            detail="No approved questions found for this interview. Please approve questions in Manage Candidates first."
        )

    return {
        "video_interview_id": vi.id,
        "job_id": vi.job_id,
        "application_id": application.id if application else None,
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

        # Save per-question scores
        per_question_scores = llm_result.get("per_question", [])
        for pq in per_question_scores:
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
            for pq in llm_result.get("per_question", []):
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
    vi.recording_data = contents  # Store in DB for cross-machine access
    db.commit()
    db.refresh(vi)

    print(f"🎥 Recording saved: {file_path} + DB ({len(contents)} bytes)")

    # AUTOMATIC TRANSCRIPTION: Trigger immediately after upload
    _start_background_transcription_task(
        vi_id=video_id,
        job_id=vi.job_id,
        candidate_id=vi.candidate_id,
        candidate_email=vi.candidate.email if vi.candidate else None,
        started_at=vi.started_at or vi.scheduled_at,
        recording_url_hint=vi.recording_url,
        session_id=vi.session_id
    )

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

    # Try local file first
    file_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", vi.recording_url.lstrip("/"))
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="video/webm", filename=os.path.basename(file_path))

    # Fallback: serve from DB
    if vi.recording_data:
        from fastapi.responses import Response
        return Response(
            content=vi.recording_data,
            media_type="video/webm",
            headers={"Content-Disposition": f"inline; filename=interview_{video_id}.webm"}
        )

    raise HTTPException(status_code=404, detail="Recording file not found")


@router.get("/api/video/interviews/{video_id}/recording-stream")
def stream_recording(video_id: int, db: Session = Depends(get_db)):
    """Serve recording without auth — for video player src attribute."""
    from fastapi.responses import Response

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi or not vi.recording_url:
        raise HTTPException(status_code=404, detail="Recording not found")

    # 1. Try local file
    file_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", vi.recording_url.lstrip("/"))
    if os.path.exists(file_path):
        mime = "video/mp4" if file_path.endswith(".mp4") else "video/webm"
        return FileResponse(file_path, media_type=mime)

    # 2. Try DB
    if vi.recording_data:
        mime = "video/mp4" if vi.recording_url.endswith(".mp4") else "video/webm"
        return Response(content=vi.recording_data, media_type=mime)

    raise HTTPException(status_code=404, detail="Recording file not found")
