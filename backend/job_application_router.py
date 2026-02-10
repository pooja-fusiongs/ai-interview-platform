"""
Job Application Router
Handles job application endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import get_db
from models import Job, JobApplication, User, InterviewSession, InterviewQuestion, InterviewAnswer
from schemas import JobApplicationCreate, JobApplicationResponse

router = APIRouter()

@router.post("/api/job/apply", response_model=JobApplicationResponse)
def apply_for_job(
    application_data: JobApplicationCreate,
    db: Session = Depends(get_db)
):
    """
    Apply for a job with automatic question generation
    """
    try:
        print(f"🔍 Processing job application for job ID: {application_data.job_id}")
        
        # Validate job exists
        job = db.query(Job).filter(Job.id == application_data.job_id, Job.is_active == True).first()
        if not job:
            raise HTTPException(
                status_code=404,
                detail=f"Job with ID {application_data.job_id} not found or not active"
            )
        
        # Check if user already applied
        existing_application = db.query(JobApplication).filter(
            JobApplication.job_id == application_data.job_id,
            JobApplication.applicant_email == application_data.applicant_email
        ).first()
        
        if existing_application:
            raise HTTPException(
                status_code=400,
                detail="You have already applied for this job"
            )
        
        # Create new application
        from services.encryption_service import encrypt_pii
        new_application = JobApplication(
            job_id=application_data.job_id,
            applicant_name=application_data.applicant_name,
            applicant_email=application_data.applicant_email,
            applicant_phone=encrypt_pii(application_data.applicant_phone) if application_data.applicant_phone else application_data.applicant_phone,
            resume_url=application_data.resume_url,
            cover_letter=application_data.cover_letter,
            experience_years=application_data.experience_years,
            current_company=application_data.current_company,
            current_position=application_data.current_position,
            expected_salary=application_data.expected_salary,
            availability=application_data.availability,
            status="Applied"
        )

        db.add(new_application)
        db.commit()
        db.refresh(new_application)
        
        print(f"✅ Application submitted successfully: ID={new_application.id}")

        return new_application
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error processing application: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to submit application: {str(e)}"
        )

@router.get("/api/job/{job_id}/applications")
def get_job_applications(job_id: int, db: Session = Depends(get_db)):
    """Get all applications for a specific job with real stats"""
    try:
        applications = db.query(JobApplication).filter(
            JobApplication.job_id == job_id
        ).all()

        # Compute real stats: match application → session
        app_ids = [a.id for a in applications]
        app_to_session = {}
        if app_ids:
            # 1) Direct match via InterviewSession.application_id
            matched_sessions = (
                db.query(InterviewSession)
                .filter(
                    InterviewSession.application_id.in_(app_ids),
                    InterviewSession.application_id.isnot(None),
                )
                .order_by(InterviewSession.created_at.desc())
                .all()
            )
            for s in matched_sessions:
                if s.application_id not in app_to_session:
                    app_to_session[s.application_id] = s

            # 2) Fallback for unmatched apps: use InterviewQuestion → InterviewAnswer chain
            unmatched = [aid for aid in app_ids if aid not in app_to_session]
            if unmatched:
                rows = (
                    db.query(InterviewQuestion.candidate_id, InterviewAnswer.session_id)
                    .join(InterviewAnswer, InterviewAnswer.question_id == InterviewQuestion.id)
                    .filter(InterviewQuestion.candidate_id.in_(unmatched))
                    .distinct()
                    .all()
                )
                if rows:
                    sids = list(set(r[1] for r in rows))
                    sess_map = {s.id: s for s in db.query(InterviewSession).filter(InterviewSession.id.in_(sids)).all()}
                    for aid, sid in rows:
                        if aid not in app_to_session and sid in sess_map:
                            s = sess_map[sid]
                            # Only use sessions that belong to this job
                            if s.job_id == job_id:
                                app_to_session[aid] = s

        applied_count = 0
        interview_count = 0
        selected_count = 0
        rejected_count = 0

        for app_item in applications:
            session = app_to_session.get(app_item.id)

            if session and session.recommendation:
                rec = session.recommendation.value if hasattr(session.recommendation, 'value') else str(session.recommendation)
                if rec in ('select', 'next_round'):
                    selected_count += 1
                elif rec == 'reject':
                    rejected_count += 1
                else:
                    applied_count += 1
            elif session and session.status:
                st = session.status.value if hasattr(session.status, 'value') else str(session.status)
                if st in ('in_progress', 'completed', 'scored'):
                    interview_count += 1
                else:
                    applied_count += 1
            else:
                applied_count += 1

        return {
            "job_id": job_id,
            "job_title": "",
            "applications": applications,
            "total_applications": len(applications),
            "stats": {
                "applied": len(applications),
                "interview": interview_count,
                "selected": selected_count,
                "rejected": rejected_count
            }
        }

    except Exception as e:
        print(f"Error fetching applications: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch applications: {str(e)}"
        )

@router.get("/api/job/{job_id}/check-application")
def check_application_status(
    job_id: int, 
    email: str,
    db: Session = Depends(get_db)
):
    """
    Check if a user has already applied for a specific job
    """
    try:
        print(f"🔍 Checking application status for job ID: {job_id}, email: {email}")
        
        # Validate job exists
        job = db.query(Job).filter(Job.id == job_id, Job.is_active == True).first()
        if not job:
            raise HTTPException(
                status_code=404,
                detail=f"Job with ID {job_id} not found or not active"
            )
        
        # Check if user already applied
        existing_application = db.query(JobApplication).filter(
            JobApplication.job_id == job_id,
            JobApplication.applicant_email == email
        ).first()
        
        if existing_application:
            return {
                "has_applied": True,
                "application_id": existing_application.id,
                "application_date": existing_application.applied_at.isoformat(),
                "status": existing_application.status,
                "applicant_name": existing_application.applicant_name
            }
        else:
            return {
                "has_applied": False,
                "application_id": None,
                "application_date": None,
                "status": None,
                "applicant_name": None
            }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error checking application status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check application status: {str(e)}"
        )