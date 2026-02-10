#!/usr/bin/env python3
"""
FastAPI POST endpoint for job applications
"""

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
import sys
import os
import uuid
import json
from typing import Optional
from dotenv import load_dotenv

# Add parent directories to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

from models import Job, JobApplication, CandidateResume
from schemas import JobApplicationCreate, JobApplicationResponse
from database import get_db, engine

# Create uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads/resumes")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _parse_resume_text(file_path: str, filename: str) -> str:
    """Extract text from PDF or DOCX file."""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    text = ""

    if ext == "pdf":
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(file_path)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        except Exception as e:
            print(f"PDF parsing error: {e}")

    elif ext in ("docx", "doc"):
        try:
            from docx import Document
            doc = Document(file_path)
            for para in doc.paragraphs:
                text += para.text + "\n"
        except Exception as e:
            print(f"DOCX parsing error: {e}")

    elif ext == "txt":
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                text = f.read()
        except Exception as e:
            print(f"TXT parsing error: {e}")

    return text.strip()

# Test database connection
print("🔍 Testing database connection for job applications...")
try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT COUNT(*) FROM jobs"))
        count = result.fetchone()[0]
        print(f"✅ Database connected! Found {count} jobs available for applications")
except Exception as e:
    print(f"❌ Database connection failed: {e}")

# Create FastAPI app
app = FastAPI(
    title="Job Application API",
    version="1.0.0",
    description="FastAPI endpoint for job applications"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "message": "Job Application API",
        "status": "running",
        "database": "PostgreSQL",
        "endpoint": "/api/job/apply"
    }

@app.get("/api/job/{job_id}/check-application")
def check_application_status(
    job_id: int, 
    email: str,
    db: Session = Depends(get_db)
):
    """
    Check if a user has already applied for a specific job
    
    - **job_id**: ID of the job to check
    - **email**: Email of the applicant to check
    
    Returns:
    - **has_applied**: Boolean indicating if user has applied
    - **application_date**: Date when application was submitted (if applied)
    - **status**: Current application status (if applied)
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

@app.post("/api/job/apply", response_model=JobApplicationResponse)
def apply_for_job(
    application_data: JobApplicationCreate,
    db: Session = Depends(get_db)
):
    """
    Apply for a job
    
    - **job_id**: ID of the job to apply for (required)
    - **applicant_name**: Full name of applicant (required)
    - **applicant_email**: Email of applicant (required)
    - **applicant_phone**: Phone number (optional)
    - **resume_url**: URL to resume file (optional)
    - **cover_letter**: Cover letter text (optional)
    - **experience_years**: Years of experience (optional)
    - **current_company**: Current company name (optional)
    - **current_position**: Current job position (optional)
    - **expected_salary**: Expected salary range (optional)
    - **availability**: When can start (optional)
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

@app.post("/api/job/apply-with-resume")
async def apply_for_job_with_resume(
    job_id: int = Form(...),
    applicant_name: str = Form(...),
    applicant_email: str = Form(...),
    applicant_phone: str = Form(""),
    experience_years: int = Form(0),
    current_company: str = Form(""),
    current_position: str = Form(""),
    cover_letter: str = Form(""),
    expected_salary: str = Form(""),
    availability: str = Form(""),
    resume: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    """
    Apply for a job with resume file upload

    - **job_id**: ID of the job to apply for (required)
    - **applicant_name**: Full name of applicant (required)
    - **applicant_email**: Email of applicant (required)
    - **resume**: Resume file (PDF/DOCX) (optional but recommended)
    """
    try:
        print(f"🔍 Processing job application with resume for job ID: {job_id}")

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
            JobApplication.applicant_email == applicant_email
        ).first()

        if existing_application:
            raise HTTPException(
                status_code=400,
                detail="You have already applied for this job"
            )

        # Create new application
        new_application = JobApplication(
            job_id=job_id,
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            applicant_phone=applicant_phone,
            cover_letter=cover_letter,
            experience_years=experience_years,
            current_company=current_company,
            current_position=current_position,
            expected_salary=expected_salary,
            availability=availability,
            status="Applied"
        )

        db.add(new_application)
        db.flush()  # Get application.id

        resume_info = None
        if resume and resume.filename:
            # Save resume file
            ext = resume.filename.rsplit(".", 1)[-1] if "." in resume.filename else "pdf"
            unique_name = f"{new_application.id}_{uuid.uuid4().hex[:8]}.{ext}"
            file_path = os.path.join(UPLOAD_DIR, unique_name)

            content = await resume.read()
            with open(file_path, "wb") as f:
                f.write(content)

            # Parse resume text
            parsed_text = _parse_resume_text(file_path, resume.filename)

            # Extract skills by matching against job skills
            parsed_skills = []
            if parsed_text and job.skills_required:
                try:
                    job_skills = json.loads(job.skills_required) if isinstance(job.skills_required, str) else job.skills_required
                    text_lower = parsed_text.lower()
                    parsed_skills = [s for s in job_skills if s.lower() in text_lower]
                except Exception:
                    pass

            # Create CandidateResume record
            candidate_resume = CandidateResume(
                candidate_id=new_application.id,
                job_id=job_id,
                resume_path=file_path,
                original_filename=resume.filename,
                file_size=len(content),
                parsed_text=parsed_text,
                skills=json.dumps(parsed_skills),
                experience_years=experience_years,
                parsing_status="completed" if parsed_text else "failed"
            )
            db.add(candidate_resume)

            # Update resume_url in application
            new_application.resume_url = f"/uploads/resumes/{unique_name}"

            resume_info = {
                "uploaded": True,
                "filename": resume.filename,
                "parsed_text_length": len(parsed_text),
                "parsed_skills": parsed_skills
            }
            print(f"✅ Resume uploaded and parsed: {resume.filename}")

        db.commit()
        db.refresh(new_application)

        print(f"✅ Application submitted successfully: ID={new_application.id}")

        return {
            "id": new_application.id,
            "job_id": new_application.job_id,
            "applicant_name": new_application.applicant_name,
            "applicant_email": new_application.applicant_email,
            "status": new_application.status,
            "applied_at": new_application.applied_at.isoformat() if new_application.applied_at else None,
            "resume_uploaded": resume_info is not None,
            "resume_info": resume_info
        }

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


@app.get("/api/job/{job_id}/applications")
def get_job_applications(job_id: int, db: Session = Depends(get_db)):
    """Get all applications for a specific job"""
    try:
        applications = db.query(JobApplication).filter(
            JobApplication.job_id == job_id
        ).all()
        
        return {
            "job_id": job_id,
            "total_applications": len(applications),
            "applications": applications
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/applications/stats")
def get_application_stats(db: Session = Depends(get_db)):
    """Get application statistics"""
    try:
        total_applications = db.query(JobApplication).count()
        
        # Get applications by status
        status_counts = db.query(
            JobApplication.status, 
            db.func.count(JobApplication.id)
        ).group_by(JobApplication.status).all()
        
        return {
            "total_applications": total_applications,
            "status_breakdown": dict(status_counts)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Job Application API",
        "database": "PostgreSQL"
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Job Application API")
    print("🌐 Server: http://localhost:8005")
    print("📚 API Docs: http://localhost:8005/docs")
    print("📝 Apply for Job: POST http://localhost:8005/api/job/apply")
    uvicorn.run("app:app", host="0.0.0.0", port=8005, reload=True)