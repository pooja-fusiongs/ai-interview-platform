"""
Video Interview API Endpoints.

Manages the full lifecycle of video interviews: scheduling, listing,
updating, starting, ending, and cancellation. Integrates with the
Zoom service for meeting creation/deletion and checks for associated
fraud analysis records.
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
    User,
    Job,
    JobApplication,
    VideoInterview,
    VideoInterviewStatus,
    FraudAnalysis,
    UserRole,
)
from schemas import (
    VideoInterviewCreate,
    VideoInterviewResponse,
    VideoInterviewUpdate,
    VideoInterviewListResponse,
)
from api.auth.jwt_handler import get_current_active_user, require_any_role
from services.zoom_service import create_zoom_meeting, delete_zoom_meeting
from services.email_service import send_interview_notification
from services.transcript_generator import generate_transcript_for_video_interview

router = APIRouter(tags=["Video Interviews"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_response(vi: VideoInterview, db: Session = None) -> VideoInterviewResponse:
    """Build a VideoInterviewResponse from an ORM object with joined names."""
    candidate_name = None

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
        candidate_name=candidate_name,
        interviewer_name=interviewer_name,
        job_title=job_title,
        transcript=vi.transcript,
        transcript_generated_at=vi.transcript_generated_at,
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
            candidate = User(
                email=application.applicant_email,
                username=application.applicant_email.split('@')[0],
                full_name=application.applicant_name,
                role=UserRole.CANDIDATE,
                is_active=True
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

    # Check questions status for this candidate
    from models import InterviewQuestion
    from services.ai_question_generator import get_question_generator

    candidate_id_for_questions = application.id if application else body.candidate_id

    # Check for existing questions
    existing_questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == body.job_id,
        InterviewQuestion.candidate_id == candidate_id_for_questions
    ).all()

    questions_generated = False

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
            questions_generated = True
            print(f"✅ Auto-generated {result['total_questions']} questions for video interview")
            # After generating, notify that questions need approval
            raise HTTPException(
                status_code=400,
                detail="Questions have been auto-generated for this candidate. Please review and approve the questions in Manage Candidates before scheduling the interview."
            )
        except HTTPException:
            raise  # Re-raise our custom exception
        except Exception as e:
            print(f"⚠️ Failed to auto-generate questions: {e}")
            raise HTTPException(
                status_code=400,
                detail="Failed to generate questions for this candidate. Please generate questions manually in Manage Candidates first."
            )
    else:
        # Questions exist - check if they are approved
        approved_count = sum(1 for q in existing_questions if q.is_approved)
        print(f"✅ Found {len(existing_questions)} existing questions ({approved_count} approved) for candidate {candidate_id_for_questions}")

        if approved_count == 0:
            # Questions exist but none are approved
            raise HTTPException(
                status_code=400,
                detail=f"Questions exist but none are approved. Please approve questions in Manage Candidates before scheduling the interview. ({len(existing_questions)} questions pending approval)"
            )

    # Attempt to create a Zoom meeting
    topic = f"Interview: {job.title} - {candidate_name_for_email}"
    zoom_data = create_zoom_meeting(
        topic=topic,
        start_time=body.scheduled_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        duration=body.duration_minutes,
    )

    vi = VideoInterview(
        session_id=body.session_id,
        job_id=body.job_id,
        candidate_id=candidate.id,  # Use User ID, not JobApplication ID
        interviewer_id=body.interviewer_id,
        scheduled_at=body.scheduled_at,
        duration_minutes=body.duration_minutes,
        status=VideoInterviewStatus.SCHEDULED,
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

    return _build_response(vi, db)


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
    query = db.query(VideoInterview)
    if current_user.role == UserRole.CANDIDATE:
        query = query.filter(VideoInterview.candidate_id == current_user.id)

    interviews = query.order_by(VideoInterview.scheduled_at.desc()).all()
    return [_build_list_item(vi, db) for vi in interviews]


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
    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
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

    vi.status = VideoInterviewStatus.CANCELLED
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

    vi.status = VideoInterviewStatus.IN_PROGRESS
    vi.started_at = datetime.utcnow()
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
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Mark a video interview as completed and generate transcript."""
    from models import InterviewQuestion, JobApplication

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    vi.status = VideoInterviewStatus.COMPLETED
    vi.ended_at = datetime.utcnow()

    # Generate transcript automatically
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
        if vi.job_id and vi.candidate_id:
            # Try to find JobApplication for this candidate
            application = db.query(JobApplication).filter(
                JobApplication.job_id == vi.job_id,
                JobApplication.applicant_email == vi.candidate.email if vi.candidate else None
            ).first()

            candidate_id_for_questions = application.id if application else vi.candidate_id

            # Get approved questions for this job and candidate
            questions = db.query(InterviewQuestion).filter(
                InterviewQuestion.job_id == vi.job_id,
                InterviewQuestion.candidate_id == candidate_id_for_questions,
                InterviewQuestion.is_approved == True
            ).all()

            if questions:
                actual_questions = [
                    {"question_text": q.question_text, "sample_answer": q.sample_answer or ""}
                    for q in questions
                ]
                print(f"Found {len(actual_questions)} actual questions for transcript generation")

        transcript = generate_transcript_for_video_interview(
            video_interview_id=vi.id,
            candidate_name=candidate_name,
            interviewer_name=interviewer_name,
            job_title=job_title,
            duration_minutes=vi.duration_minutes or 30,
            actual_questions=actual_questions if actual_questions else None
        )
        vi.transcript = transcript
        vi.transcript_generated_at = datetime.utcnow()
        print(f"Transcript generated for video interview {video_id}")
    except Exception as e:
        print(f"Failed to generate transcript: {e}")
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
            if vi.job_id and vi.candidate_id:
                # Try to find JobApplication for this candidate
                application = db.query(JobApplication).filter(
                    JobApplication.job_id == vi.job_id,
                    JobApplication.applicant_email == vi.candidate.email if vi.candidate else None
                ).first()

                candidate_id_for_questions = application.id if application else vi.candidate_id

                # Get approved questions for this job and candidate
                questions = db.query(InterviewQuestion).filter(
                    InterviewQuestion.job_id == vi.job_id,
                    InterviewQuestion.candidate_id == candidate_id_for_questions,
                    InterviewQuestion.is_approved == True
                ).all()

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
            vi.transcript_generated_at = datetime.utcnow()
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
    scheduled_time = datetime.utcnow() + timedelta(minutes=5)

    vi = VideoInterview(
        job_id=job.id,
        candidate_id=candidate.id,
        interviewer_id=current_user.id,
        scheduled_at=scheduled_time,
        duration_minutes=30,
        status=VideoInterviewStatus.SCHEDULED,
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
    from services.gemini_service import score_transcript_with_gemini

    vi = db.query(VideoInterview).filter(VideoInterview.id == video_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Video interview not found")

    transcript_text = body.get("transcript_text", "").strip()
    if not transcript_text:
        raise HTTPException(status_code=400, detail="Transcript text is required")

    # Save the transcript
    vi.transcript = transcript_text
    vi.transcript_generated_at = datetime.utcnow()

    # Find JobApplication for this candidate
    application = None
    if vi.candidate:
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id,
            JobApplication.applicant_email == vi.candidate.email
        ).first()

    if not application:
        # Try to find by job_id alone if no email match
        application = db.query(JobApplication).filter(
            JobApplication.job_id == vi.job_id
        ).first()

    # Get approved questions for scoring
    candidate_id_for_questions = application.id if application else vi.candidate_id
    print(f"🔍 Looking for questions - job_id: {vi.job_id}, candidate_id: {candidate_id_for_questions}")

    approved_questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == vi.job_id,
        InterviewQuestion.candidate_id == candidate_id_for_questions,
        InterviewQuestion.is_approved == True
    ).all()
    print(f"📝 Found {len(approved_questions)} approved questions")

    # If no approved questions, try all questions
    if not approved_questions:
        print(f"⚠️ No approved questions, trying all questions...")
        approved_questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == vi.job_id,
            InterviewQuestion.candidate_id == candidate_id_for_questions
        ).all()
        print(f"📝 Found {len(approved_questions)} total questions")

    # Error if no questions found for this candidate
    if not approved_questions:
        raise HTTPException(
            status_code=400,
            detail="No questions found for this candidate. Please generate questions first before uploading transcript."
        )

    score_result = None

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

        # Score with Gemini
        llm_result = score_transcript_with_gemini(transcript_text, questions_for_scoring)

        if llm_result:
            score_result = {
                "overall_score": llm_result.get("overall_score", 0),
                "recommendation": llm_result.get("recommendation", ""),
                "strengths": llm_result.get("strengths", ""),
                "weaknesses": llm_result.get("weaknesses", ""),
                "per_question": llm_result.get("per_question", [])
            }

            # Create or update interview session for storing scores
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
                    interview_mode="video_interview"
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
            session.completed_at = datetime.utcnow()

            # Save per-question answers with extracted answers from transcript
            for pq in llm_result.get("per_question", []):
                q_id = pq.get("question_id")
                if not q_id:
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

                # Save extracted answer from transcript (unique per question)
                answer.answer_text = pq.get("extracted_answer", "")
                answer.score = float(pq.get("score", 0))
                answer.relevance_score = float(pq.get("relevance_score", 0))
                answer.completeness_score = float(pq.get("completeness_score", 0))
                answer.accuracy_score = float(pq.get("accuracy_score", 0))
                answer.clarity_score = float(pq.get("clarity_score", 0))
                answer.feedback = pq.get("feedback", "")

    db.commit()
    db.refresh(vi)

    return {
        "message": "Transcript uploaded and scored successfully" if score_result else "Transcript uploaded (no questions found for scoring)",
        "video_interview_id": vi.id,
        "transcript_saved": True,
        "score_generated": score_result is not None,
        "score_result": score_result
    }
