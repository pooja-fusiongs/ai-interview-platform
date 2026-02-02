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
from models import Job, JobApplication
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
        new_application = JobApplication(
            job_id=application_data.job_id,
            applicant_name=application_data.applicant_name,
            applicant_email=application_data.applicant_email,
            applicant_phone=application_data.applicant_phone,
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
        
        # 🚀 TRIGGER AUTOMATIC QUESTION GENERATION
        try:
            print(f"🤖 Triggering automatic question generation for application {new_application.id}")
            
            # Import question generator
            from services.ai_question_generator import get_question_generator
            
            # Generate questions automatically
            generator = get_question_generator()
            result = generator.generate_questions(
                db=db,
                job_id=application_data.job_id,
                candidate_id=new_application.id,
                total_questions=10
            )
            
            print(f"✅ Questions generated successfully: {result['total_questions']} questions in {result['mode']} mode")
            
        except Exception as e:
            print(f"⚠️ Question generation failed (non-critical): {e}")
            # Don't fail the application if question generation fails
            pass
        
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
    """Get all applications for a specific job"""
    try:
        applications = db.query(JobApplication).filter(
            JobApplication.job_id == job_id
        ).all()
        
        return {
            "success": True,
            "data": applications,
            "total": len(applications)
        }
        
    except Exception as e:
        print(f"❌ Error fetching applications: {e}")
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