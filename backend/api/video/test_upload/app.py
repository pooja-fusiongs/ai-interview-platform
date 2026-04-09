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


@router.get("/upload-params")
def get_upload_params(
    current_user: User = Depends(require_any_role([UserRole.RECRUITER, UserRole.ADMIN])),
):
    """Get Cloudinary signed upload params for direct frontend upload (bypasses Cloud Run 32MB limit)."""
    import time
    import hashlib
    import config as cfg

    if not cfg.CLOUDINARY_CLOUD_NAME or not cfg.CLOUDINARY_API_KEY or not cfg.CLOUDINARY_API_SECRET:
        raise HTTPException(status_code=400, detail="Cloudinary not configured")

    timestamp = int(time.time())
    folder = "interview_recordings"
    # Generate signature
    params_to_sign = f"folder={folder}&timestamp={timestamp}"
    signature = hashlib.sha1(
        (params_to_sign + cfg.CLOUDINARY_API_SECRET).encode()
    ).hexdigest()

    return {
        "cloud_name": cfg.CLOUDINARY_CLOUD_NAME,
        "api_key": cfg.CLOUDINARY_API_KEY,
        "timestamp": timestamp,
        "signature": signature,
        "folder": folder,
    }


@router.post("/upload-interview-url")
def upload_interview_from_url(
    video_url: str = Form(...),
    job_id: int = Form(...),
    candidate_id: Optional[int] = Form(None),
    current_user: User = Depends(require_any_role([UserRole.RECRUITER, UserRole.ADMIN])),
    db: Session = Depends(get_db),
):
    """
    Create interview from a Cloudinary URL (video already uploaded directly from frontend).
    No file transfer through Cloud Run — bypasses 32MB limit.
    """
    if not ENABLE_TEST_VIDEO_UPLOAD:
        raise HTTPException(status_code=404, detail="Not found")

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Resolve candidate
    actual_candidate_id = current_user.id
    candidate_name = current_user.full_name or current_user.username or "Unknown"
    if candidate_id:
        application = db.query(JobApplication).filter(JobApplication.id == candidate_id).first()
        if application:
            candidate_name = application.applicant_name or candidate_name
            candidate_user = db.query(User).filter(User.email == application.applicant_email).first()
            if candidate_user:
                actual_candidate_id = candidate_user.id
            else:
                candidate_user = User(
                    username=application.applicant_name or application.applicant_email.split("@")[0],
                    email=application.applicant_email,
                    full_name=application.applicant_name or "",
                    role=UserRole.CANDIDATE,
                    hashed_password="test_upload_placeholder",
                    is_active=True,
                )
                db.add(candidate_user)
                db.flush()
                actual_candidate_id = candidate_user.id

    now = datetime.now(timezone.utc)

    vi = VideoInterview(
        job_id=job_id,
        candidate_id=actual_candidate_id,
        interviewer_id=current_user.id,
        scheduled_at=now, started_at=now, ended_at=now,
        duration_minutes=0,
        status=VideoInterviewStatus.COMPLETED.value,
        recording_url=video_url,
        recording_consent=True,
    )
    db.add(vi)
    db.flush()

    session = InterviewSession(
        job_id=job_id,
        candidate_id=actual_candidate_id,
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

    _processing_status[vi_id] = {
        "status": "processing",
        "transcript": "processing",
        "transcript_step": "Downloading video from cloud...",
        "fraud": "pending",
        "scoring": "pending",
        "error": None,
    }

    def _bg_process_url(vi_id, session_id, job_id, video_url, now):
        import traceback
        import tempfile
        import subprocess
        import requests as req
        print(f"[TestUpload URL] Background thread started for vi_id={vi_id}")

        # Step 1: Extract audio from URL (fast — ffmpeg streams only audio, ~15 sec)
        audio_path = os.path.join(RECORDINGS_DIR, f"audio_{vi_id}_{uuid.uuid4().hex[:6]}.mp3")
        try:
            _processing_status[vi_id]["transcript_step"] = "Extracting audio from cloud video..."
            result = subprocess.run([
                "ffmpeg", "-y",
                "-i", video_url,
                "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k",
                "-f", "mp3", audio_path
            ], capture_output=True, text=True, timeout=120)
            if result.returncode != 0 or not os.path.exists(audio_path):
                raise Exception(f"ffmpeg failed: {result.stderr[-300:]}")
            print(f"[TestUpload URL] Audio extracted: {os.path.getsize(audio_path) / 1024:.0f} KB")
        except Exception as e:
            print(f"[TestUpload URL] Audio extraction failed: {e}")
            _processing_status[vi_id]["status"] = "failed"
            _processing_status[vi_id]["error"] = f"Failed to extract audio: {e}"
            return

        # Step 2: Transcript + Scoring using audio (fast — ~1 min)
        _run_background_processing(vi_id, session_id, job_id, audio_path, now)

        # Step 3: Download full video for fraud/face detection (runs after transcript+scoring done)
        video_path = None
        try:
            _processing_status[vi_id]["fraud"] = "processing"
            _processing_status[vi_id]["status"] = "processing"
            print(f"[TestUpload URL] Downloading video for fraud analysis...")
            resp = req.get(video_url, stream=True, timeout=300)
            resp.raise_for_status()
            ext = video_url.rsplit(".", 1)[-1].split("?")[0] if "." in video_url else "mp4"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}", dir=RECORDINGS_DIR)
            for chunk in resp.iter_content(chunk_size=8192):
                tmp.write(chunk)
            tmp.close()
            video_path = tmp.name
            print(f"[TestUpload URL] Video downloaded: {os.path.getsize(video_path) / (1024*1024):.1f} MB")

            # Run fraud analysis on video
            from services.biometric_analyzer import run_real_analysis
            fraud_results = run_real_analysis(video_interview_id=vi_id, recording_path=video_path)
            _processing_status[vi_id]["fraud"] = "completed"
            print(f"[TestUpload URL] Fraud analysis completed")

            # Save fraud to DB
            db2 = SessionLocal()
            try:
                fraud = FraudAnalysis(
                    video_interview_id=vi_id,
                    voice_consistency_score=fraud_results.get("voice_consistency_score"),
                    voice_consistency_details=fraud_results.get("voice_consistency_details"),
                    lip_sync_score=fraud_results.get("lip_sync_score"),
                    lip_sync_details=fraud_results.get("lip_sync_details"),
                    body_movement_score=fraud_results.get("body_movement_score"),
                    body_movement_details=fraud_results.get("body_movement_details"),
                    overall_trust_score=fraud_results.get("overall_trust_score"),
                    flags=fraud_results.get("flags", "[]"),
                    flag_count=len(json.loads(fraud_results.get("flags", "[]")) if isinstance(fraud_results.get("flags"), str) else (fraud_results.get("flags") or [])),
                    face_detection_score=fraud_results.get("face_detection_score"),
                    face_detection_details=fraud_results.get("face_detection_details"),
                    analysis_status="completed",
                    consent_granted=True,
                    analyzed_at=datetime.now(timezone.utc),
                )
                db2.add(fraud)
                db2.commit()
                print(f"[TestUpload URL] Fraud saved to DB")
            finally:
                db2.close()
        except Exception as e:
            print(f"[TestUpload URL] Fraud analysis failed: {e}")
            _processing_status[vi_id]["fraud"] = "failed"

        _processing_status[vi_id]["status"] = "completed"

        # Cleanup
        try:
            os.unlink(audio_path)
        except OSError:
            pass
        if video_path:
            try:
                os.unlink(video_path)
            except OSError:
                pass

    thread = threading.Thread(
        target=_bg_process_url,
        args=(vi_id, session_id, job_id, video_url, now),
        daemon=True,
    )
    thread.start()

    return {
        "status": "processing",
        "video_interview_id": vi_id,
        "job_title": job.title,
        "candidate_name": candidate_name,
        "file_size_mb": None,
        "recording_url": video_url,
        "session_id": session_id,
    }


@router.get("/candidates")
def get_candidates_for_test(
    job_id: int = None,
    current_user: User = Depends(require_any_role([UserRole.RECRUITER, UserRole.ADMIN])),
    db: Session = Depends(get_db),
):
    """Get list of candidates for the test upload candidate selector."""
    if not ENABLE_TEST_VIDEO_UPLOAD:
        raise HTTPException(status_code=404, detail="Not found")

    if job_id:
        # Get candidates who applied for this job
        applications = db.query(JobApplication).filter(
            JobApplication.job_id == job_id
        ).order_by(JobApplication.applied_at.desc()).all()
        return [
            {"id": a.id, "name": a.applicant_name, "email": a.applicant_email, "type": "existing"}
            for a in applications
        ]
    else:
        # Get all candidates (users with candidate role or all job applications)
        applications = db.query(JobApplication).order_by(JobApplication.applied_at.desc()).limit(50).all()
        return [
            {"id": a.id, "name": a.applicant_name, "email": a.applicant_email, "type": "existing"}
            for a in applications
        ]


@router.post("/upload-interview")
async def upload_test_interview(
    file: UploadFile = File(...),
    job_id: int = Form(...),
    candidate_id: Optional[int] = Form(None),
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

    # Resolve candidate — use selected application's candidate or fallback to current user
    actual_candidate_id = current_user.id
    candidate_email = current_user.email
    candidate_name = current_user.full_name or current_user.username or "Unknown"
    application_id = None
    if candidate_id:
        application = db.query(JobApplication).filter(JobApplication.id == candidate_id).first()
        if application:
            application_id = application.id
            candidate_name = application.applicant_name or candidate_name
            candidate_email = application.applicant_email or candidate_email
            # Find user by email — create if not exists
            candidate_user = db.query(User).filter(User.email == application.applicant_email).first()
            if candidate_user:
                actual_candidate_id = candidate_user.id
            else:
                # Create a candidate user so interview shows correct name
                candidate_user = User(
                    username=application.applicant_name or application.applicant_email.split("@")[0],
                    email=application.applicant_email,
                    full_name=application.applicant_name or "",
                    role=UserRole.CANDIDATE,
                    hashed_password="test_upload_placeholder",
                    is_active=True,
                )
                db.add(candidate_user)
                db.flush()
                actual_candidate_id = candidate_user.id
                print(f"[TestUpload] Created candidate user: {candidate_user.full_name} (id={candidate_user.id})")

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
        candidate_id=actual_candidate_id,
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
        candidate_id=actual_candidate_id,
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
        "transcript_step": "Extracting audio from video...",
        "fraud": "pending",
        "scoring": "pending",
        "error": None,
    }

    def _background_process(vi_id, session_id, job_id, file_path, now):
        _run_background_processing(vi_id, session_id, job_id, file_path, now)


def _run_background_processing(vi_id, session_id, job_id, file_path, now):
    """Shared background processing: transcript → fraud → scoring. Uses fresh DB connections per step."""
    import traceback
    print(f"[TestUpload BG] Background thread started for vi_id={vi_id}")

    # --- Fetch questions BEFORE long transcript operation ---
    db = SessionLocal()
    try:
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
    finally:
        db.close()

    # --- Transcript generation (long operation — no DB open) ---
    transcript_text = None
    _processing_status[vi_id]["transcript_step"] = "Extracting audio & sending to AI transcription..."
    try:
        from services.transcript_generator import create_real_transcript, TranscriptionError, validate_recording_file

        validate_recording_file(file_path)
        transcript_data = create_real_transcript(
            interview_id=vi_id,
            recording_path=file_path,
            interview_start_time=now,
            interview_end_time=now,
            question_timestamps=actual_questions if actual_questions else None,
        )
        transcript_text = transcript_data["transcript_text"]
        _processing_status[vi_id]["transcript"] = "completed"
        print(f"[TestUpload BG] Transcript generated ({len(transcript_text)} chars)")

    except Exception as e:
        print(f"[TestUpload BG] Transcript failed: {e}")
        _processing_status[vi_id]["transcript"] = "failed"
        _processing_status[vi_id]["error"] = str(e)

    # --- Save transcript with FRESH connection ---
    db = SessionLocal()
    try:
        vi = db.query(VideoInterview).filter(VideoInterview.id == vi_id).first()
        session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if transcript_text:
            vi.transcript = transcript_text
            vi.transcript_source = "recording"
            vi.transcript_generated_at = now
            if session:
                session.transcript_text = transcript_text
        else:
            vi.transcript_source = "failed"
            vi.transcript_error = _processing_status[vi_id].get("error", "Unknown error")
        db.commit()
        print(f"[TestUpload BG] Transcript saved to DB")
    except Exception as e:
        print(f"[TestUpload BG] Transcript DB save failed: {e}")
        traceback.print_exc()
    finally:
        db.close()

    # --- Fraud detection (only for video files, skip for audio-only) ---
    is_audio_only = file_path and os.path.splitext(file_path)[1].lower() in ('.mp3', '.wav', '.m4a', '.ogg', '.flac')
    fraud_results = None
    if is_audio_only:
        _processing_status[vi_id]["fraud"] = "skipped"
        print(f"[TestUpload BG] Skipping fraud analysis (audio-only file, no video frames)")
    else:
        _processing_status[vi_id]["fraud"] = "processing"
        try:
            from services.biometric_analyzer import run_real_analysis
            fraud_results = run_real_analysis(video_interview_id=vi_id, recording_path=file_path)
            _processing_status[vi_id]["fraud"] = "completed"
            print(f"[TestUpload BG] Fraud analysis completed for interview {vi_id}")
        except Exception as e:
            print(f"[TestUpload BG] Fraud analysis failed: {e}")
            _processing_status[vi_id]["fraud"] = "failed"

    if fraud_results:
        db2 = SessionLocal()
        try:
            fraud = FraudAnalysis(
                video_interview_id=vi_id,
                voice_consistency_score=fraud_results.get("voice_consistency_score"),
                voice_consistency_details=fraud_results.get("voice_consistency_details"),
                lip_sync_score=fraud_results.get("lip_sync_score"),
                lip_sync_details=fraud_results.get("lip_sync_details"),
                body_movement_score=fraud_results.get("body_movement_score"),
                body_movement_details=fraud_results.get("body_movement_details"),
                overall_trust_score=fraud_results.get("overall_trust_score"),
                flags=fraud_results.get("flags", "[]"),
                flag_count=len(json.loads(fraud_results.get("flags", "[]")) if isinstance(fraud_results.get("flags"), str) else (fraud_results.get("flags") or [])),
                analysis_status="completed",
                consent_granted=True,
                analyzed_at=now,
            )
            db2.add(fraud)
            db2.commit()
            print(f"[TestUpload BG] Fraud saved to DB")
        finally:
            db2.close()

    # --- Auto Score Generation ---
    llm_result = None
    if transcript_text:
        _processing_status[vi_id]["scoring"] = "processing"
        try:
            from services.groq_service import score_transcript_directly

            db3 = SessionLocal()
            try:
                job = db3.query(Job).filter(Job.id == job_id).first()
                job_title = job.title if job else ""
                job_desc = job.description if job else ""
                job_skills = job.skills_required if job else ""
            finally:
                db3.close()

            print(f"[TestUpload BG] Starting auto score generation from transcript...")
            llm_result = score_transcript_directly(
                transcript_text=transcript_text,
                job_title=job_title,
                job_description=job_desc,
                skills_required=job_skills,
            )
        except Exception as e:
            print(f"[TestUpload BG] Auto scoring failed: {e}")
            _processing_status[vi_id]["scoring"] = "failed"

        if llm_result:
            db4 = SessionLocal()
            try:
                session = db4.query(InterviewSession).filter(InterviewSession.id == session_id).first()
                if session:
                    session.overall_score = float(llm_result.get("overall_score", 0))
                    rec_str = llm_result.get("recommendation", "reject")
                    session.recommendation = Recommendation(rec_str) if rec_str in ("select", "next_round", "reject") else Recommendation.REJECT
                    session.strengths = llm_result.get("strengths", "")
                    session.weaknesses = llm_result.get("weaknesses", "")
                    session.status = InterviewSessionStatus.SCORED
                    session.completed_at = now

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
                        db4.add(answer)

                    db4.commit()
                    _processing_status[vi_id]["scoring"] = "completed"
                    _processing_status[vi_id]["overall_score"] = session.overall_score
                    _processing_status[vi_id]["recommendation"] = rec_str
                    print(f"[TestUpload BG] Auto scoring completed: {session.overall_score}/100, rec={rec_str}")
                else:
                    _processing_status[vi_id]["scoring"] = "failed"
            finally:
                db4.close()
        elif _processing_status[vi_id].get("scoring") != "failed":
            _processing_status[vi_id]["scoring"] = "failed"
            print(f"[TestUpload BG] Auto scoring returned no result")
    else:
        print(f"[TestUpload BG] Skipping auto scoring — no transcript available")

    _processing_status[vi_id]["status"] = "completed"
    print(f"[TestUpload BG] Thread finished for vi_id={vi_id}")

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
        "candidate_name": candidate_name,
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
        # Check DB directly — maybe server restarted or status not yet set
        vi = db.query(VideoInterview).filter(VideoInterview.id == video_interview_id).first()
        if not vi:
            raise HTTPException(status_code=404, detail="Interview not found")

        # If transcript_source is None and no error, it's likely still processing
        still_processing = (not vi.transcript and not vi.transcript_source and not getattr(vi, 'transcript_error', None))
        fraud = db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id == video_interview_id).first()

        if still_processing:
            return {
                "status": "processing",
                "transcript": "processing",
                "fraud": "processing" if not fraud else ("completed" if fraud.analysis_status == "completed" else fraud.analysis_status),
                "transcript_generated": False,
                "transcript_length": 0,
                "transcript_error": None,
                "fraud_analysis_done": fraud is not None and fraud.analysis_status == "completed",
            }

        return {
            "status": "completed",
            "transcript": "completed" if vi.transcript else "failed",
            "fraud": "completed" if fraud and fraud.analysis_status == "completed" else "failed",
            "transcript_generated": vi.transcript is not None,
            "transcript_length": len(vi.transcript) if vi.transcript else 0,
            "transcript_error": getattr(vi, 'transcript_error', None),
            "fraud_analysis_done": fraud is not None and fraud.analysis_status == "completed",
            "scoring_done": False,
            "overall_score": None,
            "recommendation": None,
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
