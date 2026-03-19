# TEMPORARY TEST FEATURE - Remove after testing
"""
Test Video Upload & Interview Creation Endpoint.
Upload a video file → save as recording → generate transcript → create interview record.
Uses the exact same transcript generation and scoring pipeline as real interviews.
Controlled by ENABLE_TEST_VIDEO_UPLOAD config flag.
"""

import os
import uuid
import json
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from database import get_db, SessionLocal
from models import (
    User, Job, VideoInterview, VideoInterviewStatus,
    FraudAnalysis, InterviewSession, InterviewSessionStatus,
    InterviewQuestion, InterviewAnswer, JobApplication, UserRole,
    Recommendation,
)
from api.auth.jwt_handler import get_current_active_user, require_any_role
from config import ENABLE_TEST_VIDEO_UPLOAD

# Track background processing status
_processing_status = {}  # video_interview_id -> {status, transcript, fraud, error}

router = APIRouter(tags=["Test Video Upload"])

RECORDINGS_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "recordings")
)
os.makedirs(RECORDINGS_DIR, exist_ok=True)


@router.get("/status")
def test_upload_status():
    """Check if test video upload is enabled."""
    return {"enabled": ENABLE_TEST_VIDEO_UPLOAD}


@router.get("/jobs")
def get_jobs_for_test(
    current_user: User = Depends(require_any_role([UserRole.RECRUITER, UserRole.ADMIN])),
    db: Session = Depends(get_db),
):
    """Get list of jobs for the test upload job selector."""
    if not ENABLE_TEST_VIDEO_UPLOAD:
        raise HTTPException(status_code=404, detail="Not found")

    jobs = db.query(Job).filter(Job.status != "Closed").order_by(Job.created_at.desc()).all()
    return [{"id": j.id, "title": j.title} for j in jobs]


@router.post("/upload-interview")
async def upload_test_interview(
    file: UploadFile = File(...),
    job_id: int = Form(...),
    current_user: User = Depends(require_any_role([UserRole.RECRUITER, UserRole.ADMIN])),
    db: Session = Depends(get_db),
):
    """
    Upload a video file and create a full interview record — same pipeline as real interviews.

    Steps:
    1. Save video as recording file
    2. Create VideoInterview record (status=completed)
    3. Generate transcript from recording (Groq Whisper — same as real interview)
    4. Create InterviewSession for scoring pipeline
    5. Run fraud detection analysis
    6. Return the interview ID so frontend can navigate to it
    """
    if not ENABLE_TEST_VIDEO_UPLOAD:
        raise HTTPException(status_code=404, detail="Not found")

    # --- Validate inputs ---
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("mp4", "webm", "mp3", "wav", "m4a", "ogg", "flac"):
        raise HTTPException(status_code=400, detail="Unsupported format. Use mp4, webm, mp3, wav, m4a, ogg, or flac")

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # --- 1. Save recording file ---
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    filename = f"test_interview_{uuid.uuid4().hex[:8]}_{timestamp}.{ext}"
    file_path = os.path.join(RECORDINGS_DIR, filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    file_size_mb = round(len(content) / (1024 * 1024), 2)
    recording_url = f"/uploads/recordings/{filename}"
    print(f"[TestUpload] Recording saved: {filename} ({file_size_mb} MB)")

    # --- 2. Create VideoInterview record ---
    vi = VideoInterview(
        job_id=job_id,
        candidate_id=current_user.id,
        interviewer_id=current_user.id,
        scheduled_at=now,
        started_at=now,
        ended_at=now,
        duration_minutes=0,
        status=VideoInterviewStatus.COMPLETED.value,
        recording_url=recording_url,
        recording_consent=True,
    )
    db.add(vi)
    db.flush()

    # --- 3. Create InterviewSession for scoring pipeline ---
    session = InterviewSession(
        job_id=job_id,
        candidate_id=current_user.id,
        status=InterviewSessionStatus.IN_PROGRESS,
        interview_mode="video_interview",
        started_at=now,
    )
    db.add(session)
    db.flush()
    vi.session_id = session.id

    db.commit()
    vi_id = vi.id
    session_id = session.id
    job_title = job.title
    print(f"[TestUpload] Created VideoInterview id={vi_id}, Session id={session_id}")

    # --- 4. Process transcript & fraud in background thread ---
    _processing_status[vi_id] = {
        "status": "processing",
        "transcript": "processing",
        "fraud": "pending",
        "error": None,
    }

    def _background_process(vi_id, session_id, job_id, file_path, now):
        import traceback
        print(f"[TestUpload BG] Background thread started for vi_id={vi_id}")
        db = SessionLocal()
        try:
            vi = db.query(VideoInterview).filter(VideoInterview.id == vi_id).first()
            session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
            print(f"[TestUpload BG] DB records loaded: vi={vi is not None}, session={session is not None}")

            # --- Transcript generation ---
            transcript_text = None
            try:
                from services.transcript_generator import create_real_transcript, TranscriptionError, validate_recording_file

                actual_questions = []
                questions = db.query(InterviewQuestion).filter(
                    InterviewQuestion.job_id == job_id,
                    InterviewQuestion.is_approved == True
                ).all()
                if not questions:
                    questions = db.query(InterviewQuestion).filter(
                        InterviewQuestion.job_id == job_id
                    ).all()
                if questions:
                    actual_questions = [
                        {"question_text": q.question_text, "sample_answer": q.sample_answer or ""}
                        for q in questions
                    ]

                validate_recording_file(file_path)
                transcript_data = create_real_transcript(
                    interview_id=vi_id,
                    recording_path=file_path,
                    interview_start_time=now,
                    interview_end_time=now,
                    question_timestamps=actual_questions if actual_questions else None,
                )

                transcript_text = transcript_data["transcript_text"]
                vi.transcript = transcript_text
                vi.transcript_source = "recording"
                vi.transcript_generated_at = now
                if session:
                    session.transcript_text = transcript_text
                _processing_status[vi_id]["transcript"] = "completed"
                print(f"[TestUpload BG] Transcript generated ({len(transcript_text)} chars)")

            except Exception as e:
                print(f"[TestUpload BG] Transcript failed: {e}")
                vi.transcript_source = "failed"
                vi.transcript_error = str(e)
                _processing_status[vi_id]["transcript"] = "failed"
                _processing_status[vi_id]["error"] = str(e)

            db.commit()

            # --- Fraud detection ---
            _processing_status[vi_id]["fraud"] = "processing"
            try:
                from services.biometric_analyzer import run_real_analysis

                results = run_real_analysis(video_interview_id=vi_id, recording_path=file_path)

                fraud = FraudAnalysis(
                    video_interview_id=vi_id,
                    voice_consistency_score=results.get("voice_consistency_score"),
                    voice_consistency_details=results.get("voice_consistency_details"),
                    lip_sync_score=results.get("lip_sync_score"),
                    lip_sync_details=results.get("lip_sync_details"),
                    body_movement_score=results.get("body_movement_score"),
                    body_movement_details=results.get("body_movement_details"),
                    overall_trust_score=results.get("overall_trust_score"),
                    flags=results.get("flags", "[]"),
                    flag_count=len(json.loads(results.get("flags", "[]")) if isinstance(results.get("flags"), str) else (results.get("flags") or [])),
                    analysis_status="completed",
                    consent_granted=True,
                    analyzed_at=now,
                )
                db.add(fraud)
                _processing_status[vi_id]["fraud"] = "completed"
                print(f"[TestUpload BG] Fraud analysis completed for interview {vi_id}")
            except Exception as e:
                print(f"[TestUpload BG] Fraud analysis failed: {e}")
                _processing_status[vi_id]["fraud"] = "failed"

            db.commit()

            # --- Auto Score Generation (from transcript, no pre-defined questions) ---
            if transcript_text and session:
                _processing_status[vi_id]["scoring"] = "processing"
                try:
                    from services.groq_service import score_transcript_directly
                    import config

                    job = db.query(Job).filter(Job.id == job_id).first()
                    print(f"[TestUpload BG] Starting auto score generation from transcript...")

                    llm_result = score_transcript_directly(
                        transcript_text=transcript_text,
                        job_title=job.title if job else "",
                        job_description=job.description if job else "",
                        skills_required=job.skills_required if job else "",
                    )

                    if llm_result:
                        session.overall_score = float(llm_result.get("overall_score", 0))
                        rec_str = llm_result.get("recommendation", "reject")
                        session.recommendation = Recommendation(rec_str) if rec_str in ("select", "next_round", "reject") else Recommendation.REJECT
                        session.strengths = llm_result.get("strengths", "")
                        session.weaknesses = llm_result.get("weaknesses", "")
                        session.status = InterviewSessionStatus.SCORED
                        session.completed_at = now

                        # Save per-question scores (AI-extracted Q&A from transcript)
                        for pq in llm_result.get("per_question", []):
                            answer = InterviewAnswer(
                                session_id=session.id,
                                question_text_override=pq.get("question_text", ""),
                                answer_text=pq.get("extracted_answer", "[From transcript]"),
                                score=float(pq.get("score", 0)),
                                relevance_score=float(pq.get("relevance_score", 0)),
                                completeness_score=float(pq.get("completeness_score", 0)),
                                accuracy_score=float(pq.get("accuracy_score", 0)),
                                clarity_score=float(pq.get("clarity_score", 0)),
                                feedback=pq.get("feedback", ""),
                            )
                            db.add(answer)

                        db.commit()
                        _processing_status[vi_id]["scoring"] = "completed"
                        _processing_status[vi_id]["overall_score"] = session.overall_score
                        _processing_status[vi_id]["recommendation"] = rec_str
                        print(f"[TestUpload BG] Auto scoring completed: {session.overall_score}/100, rec={rec_str}")
                    else:
                        _processing_status[vi_id]["scoring"] = "failed"
                        print(f"[TestUpload BG] Auto scoring returned no result (AI service unavailable)")

                except Exception as e:
                    print(f"[TestUpload BG] Auto scoring failed: {e}")
                    _processing_status[vi_id]["scoring"] = "failed"
            else:
                if not transcript_text:
                    print(f"[TestUpload BG] Skipping auto scoring — no transcript available")

            db.commit()
            _processing_status[vi_id]["status"] = "completed"

        except Exception as e:
            print(f"[TestUpload BG] Background processing error: {e}")
            traceback.print_exc()
            _processing_status[vi_id]["status"] = "failed"
            _processing_status[vi_id]["error"] = str(e)
        finally:
            db.close()
            print(f"[TestUpload BG] Thread finished for vi_id={vi_id}, status={_processing_status.get(vi_id)}")

    thread = threading.Thread(
        target=_background_process,
        args=(vi_id, session_id, job_id, file_path, now),
        daemon=True,
    )
    thread.start()

    return {
        "status": "processing",
        "video_interview_id": vi_id,
        "job_title": job_title,
        "file_size_mb": file_size_mb,
        "recording_url": recording_url,
        "session_id": session_id,
        "message": "Interview created! Transcript & fraud analysis are processing in background.",
    }


@router.get("/processing-status/{video_interview_id}")
def get_processing_status(
    video_interview_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Poll background processing status for transcript & fraud analysis."""
    status = _processing_status.get(video_interview_id)
    if not status:
        # Check DB directly — maybe server restarted
        vi = db.query(VideoInterview).filter(VideoInterview.id == video_interview_id).first()
        if not vi:
            raise HTTPException(status_code=404, detail="Interview not found")
        return {
            "status": "completed",
            "transcript": "completed" if vi.transcript else "failed",
            "fraud": "completed",
            "transcript_generated": vi.transcript is not None,
            "transcript_length": len(vi.transcript) if vi.transcript else 0,
            "transcript_error": getattr(vi, 'transcript_error', None),
            "fraud_analysis_done": True,
        }

    result = {**status}
    # Add transcript details when done
    if status["status"] == "completed" or status["transcript"] in ("completed", "failed"):
        vi = db.query(VideoInterview).filter(VideoInterview.id == video_interview_id).first()
        if vi:
            result["transcript_generated"] = vi.transcript is not None
            result["transcript_length"] = len(vi.transcript) if vi.transcript else 0
            result["transcript_error"] = getattr(vi, 'transcript_error', None)
            result["fraud_analysis_done"] = status.get("fraud") == "completed"
            result["scoring_done"] = status.get("scoring") == "completed"
            result["overall_score"] = status.get("overall_score")
            result["recommendation"] = status.get("recommendation")

    return result


@router.post("/analyze-video")
async def analyze_test_video(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """
    Upload a video file and run fraud detection analysis on it (standalone, no interview record).
    Only works when ENABLE_TEST_VIDEO_UPLOAD = True.
    """
    if not ENABLE_TEST_VIDEO_UPLOAD:
        raise HTTPException(status_code=404, detail="Not found")

    # Validate file type
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("mp4", "webm", "mkv", "avi", "mov"):
        raise HTTPException(status_code=400, detail="Unsupported format. Use mp4, webm, mkv, avi, or mov")

    # Save file temporarily
    UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "test_videos")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    unique_name = f"test_{uuid.uuid4().hex[:8]}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    file_size_mb = round(len(content) / (1024 * 1024), 2)
    print(f"[TestUpload] Saved: {unique_name} ({file_size_mb} MB)")

    # Run fraud analysis
    from services.biometric_analyzer import run_real_analysis

    results = run_real_analysis(video_interview_id=0, recording_path=file_path)

    # Clean up file after analysis
    try:
        os.unlink(file_path)
    except OSError:
        pass

    # Format response
    voice_details = json.loads(results.get("voice_consistency_details", "{}")) if results.get("voice_consistency_details") else {}
    lip_details = json.loads(results.get("lip_sync_details", "{}")) if results.get("lip_sync_details") else {}
    body_details = json.loads(results.get("body_movement_details", "{}")) if results.get("body_movement_details") else {}
    flags = json.loads(results.get("flags", "[]")) if results.get("flags") else []

    return {
        "status": "completed",
        "file": unique_name,
        "file_size_mb": file_size_mb,
        "scores": {
            "voice_consistency": round((results.get("voice_consistency_score") or 0) * 100, 1),
            "lip_sync": round((results.get("lip_sync_score") or 0) * 100, 1),
            "body_movement": round((results.get("body_movement_score") or 0) * 100, 1),
            "overall_trust": round((results.get("overall_trust_score") or 0) * 100, 1),
        },
        "details": {
            "voice": voice_details,
            "lip_sync": lip_details,
            "body_movement": body_details,
        },
        "flags": flags,
        "flag_count": len(flags),
        "is_simulated": not os.path.isfile(file_path),
        "analyzed_at": datetime.utcnow().isoformat(),
    }
