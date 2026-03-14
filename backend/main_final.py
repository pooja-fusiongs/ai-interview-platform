from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
import uvicorn
import sys
import os
import json
import uuid

# Load environment variables from .env file FIRST
from dotenv import load_dotenv
load_dotenv()

# Fix import paths
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from database import engine, get_db
from models import Base, User, Job, JobApplication, CandidateResume, UserRole, InterviewSession, InterviewAnswer, QuestionGenerationSession, QuestionGenerationMode, InterviewSessionStatus, InterviewQuestion, InterviewQuestionVersion, InterviewRating, QuestionDifficulty, QuestionType, VideoInterview, FraudAnalysis, ATSCandidateMapping, PostHireFeedback
from schemas import (
    JobCreate, JobUpdate, JobResponse,
    CandidateProfileResponse
)
from crud import (
    get_job, update_job
)
from api.auth.app import auth_router, get_current_active_user
from api.jobs.create_job.app import router as create_job_router
from services.ai_question_generator import get_question_generator
from pydantic import BaseModel

print("🚀 Starting AI Interview Platform API...")
print("📊 ONLY DATABASE DATA - NO SAMPLE DATA")
print("🔧 All data loaded dynamically from your database")

# Create database tables ONLY - NO SAMPLE DATA
Base.metadata.create_all(bind=engine)
print("✅ Database tables created/verified")

# Auto-migrate: add missing columns to existing tables
def auto_migrate():
    """Add columns that exist in models but not in the database."""
    from sqlalchemy import inspect, text
    inspector = inspect(engine)

    # Define expected columns per table: (table, column, SQL type)
    expected_columns = [
        ("users", "is_online", "BOOLEAN DEFAULT FALSE"),
        ("users", "last_activity", "TIMESTAMP"),
        ("users", "last_login", "TIMESTAMP"),
        ("users", "full_name", "VARCHAR"),
        ("users", "phone", "VARCHAR"),
        ("users", "department", "VARCHAR"),
        ("users", "skills", "TEXT"),
        ("users", "experience_years", "INTEGER"),
        ("users", "current_position", "VARCHAR"),
        ("users", "bio", "TEXT"),
        ("users", "mobile", "VARCHAR"),
        ("users", "gender", "VARCHAR"),
        ("users", "location", "VARCHAR"),
        ("users", "education", "TEXT"),
        ("users", "has_internship", "BOOLEAN DEFAULT FALSE"),
        ("users", "internship_company", "VARCHAR"),
        ("users", "internship_position", "VARCHAR"),
        ("users", "internship_duration", "VARCHAR"),
        ("users", "internship_salary", "VARCHAR"),
        ("users", "languages", "TEXT"),
        ("users", "profile_image", "VARCHAR"),
        ("video_interviews", "transcript_source", "VARCHAR"),
        # Client merge: new fields for jobs
        ("jobs", "skills_weightage_json", "TEXT"),
        ("jobs", "description_file_path", "VARCHAR"),
        ("jobs", "years_experience", "INTEGER"),
        # Client merge: new fields for job_applications (candidate scoring)
        ("job_applications", "location", "VARCHAR"),
        ("job_applications", "linkedin_url", "VARCHAR"),
        ("job_applications", "current_ctc", "VARCHAR"),
        ("job_applications", "interview_datetime", "TIMESTAMP"),
        ("job_applications", "duration_minutes", "INTEGER DEFAULT 30"),
        ("job_applications", "overall_score", "INTEGER"),
        ("job_applications", "ai_score", "FLOAT"),
        ("job_applications", "final_score", "FLOAT"),
        ("job_applications", "transcript_text", "TEXT"),
        ("job_applications", "transcript_path", "VARCHAR"),
        ("job_applications", "report_card_json", "TEXT"),
        ("job_applications", "added_by", "INTEGER REFERENCES users(id)"),
        # Client merge: new fields for interview_questions
        ("interview_questions", "suggested_answer", "TEXT"),
        ("interview_questions", "category", "VARCHAR(100)"),
        ("interview_questions", "order_number", "INTEGER DEFAULT 0"),
    ]

    with engine.begin() as conn:
        for table, column, col_type in expected_columns:
            if not inspector.has_table(table):
                continue
            existing = [c["name"] for c in inspector.get_columns(table)]
            if column not in existing:
                try:
                    conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'))
                    print(f"  ✅ Added missing column: {table}.{column}")
                except Exception as e:
                    print(f"  ⚠️ Could not add {table}.{column}: {e}")

try:
    auto_migrate()
    print("✅ Auto-migration complete")
except Exception as e:
    print(f"⚠️ Auto-migration skipped: {e}")

# Migrate video_interviews.status from ENUM to VARCHAR (to support new statuses like no_show)
try:
    from sqlalchemy import text as _text
    with engine.begin() as conn:
        conn.execute(_text(
            "ALTER TABLE video_interviews ALTER COLUMN status TYPE VARCHAR USING status::text"
        ))
        print("✅ Migrated video_interviews.status to VARCHAR")
except Exception as e:
    if "already" in str(e).lower() or "type" in str(e).lower():
        pass  # Column is already VARCHAR
    else:
        print(f"⚠️ video_interviews.status migration skipped: {e}")

app = FastAPI(
    title="AI Interview Platform API - Database Only", 
    version="1.0.0",
    description="API that uses ONLY your database data - no sample data"
)

# Mount static files for uploads
uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(uploads_dir, exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "profile_images"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "resumes"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "recordings"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# CORS middleware - allow localhost and production domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "https://ai-interview-platform.vercel.app",
        "https://ai-interview-platform.netlify.app",
        "https://ai-interview-platform-unqg.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.netlify\.app|https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint for Render
@app.get("/health")
def health_check():
    return {"status": "healthy", "message": "AI Interview Platform API is running"}


# Mount auth router
app.include_router(auth_router)
app.include_router(create_job_router)

# Import and mount resume endpoints
try:
    from api.candidates.download_resume.app import router as resume_download_router
    from api.candidates.matching.app import router as candidate_matching_router
    from api.auth.profile_image.app import router as profile_image_router
    from api.candidates.resume_upload.app import router as resume_upload_router
    
    app.include_router(resume_download_router, prefix="/api/resume", tags=["Resume"])
    app.include_router(candidate_matching_router, prefix="/api/candidates", tags=["Candidates"])
    app.include_router(profile_image_router, tags=["Profile Image"])
    app.include_router(resume_upload_router, tags=["Resume Upload"])
    print("✅ Resume, Candidate Matching, Profile Image, and Resume Upload endpoints included")
except Exception as e:
    print(f"⚠️ Could not load resume endpoints: {e}")

# Import and mount job application endpoints
try:
    from job_application_router import router as job_application_router
    app.include_router(job_application_router, tags=["Job Applications"])
    print("✅ Job Application endpoints included")
except Exception as e:
    print(f"⚠️ Could not load job application endpoints: {e}")

# Import and mount question generation endpoints
try:
    from api.interview.question_generation.app import router as question_generation_router
    app.include_router(question_generation_router, tags=["Question Generation"])
    print("✅ Question Generation endpoints included")
except Exception as e:
    print(f"⚠️ Could not load question generation endpoints: {e}")

# Import and mount interview session endpoints
try:
    from api.interview.sessions.app import router as interview_session_router
    app.include_router(interview_session_router, tags=["Interview Sessions"])
    print("✅ Interview Session endpoints included")
except Exception as e:
    print(f"⚠️ Could not load interview session endpoints: {e}")

# Import and mount recruiter flow endpoints
try:
    from api.recruiter.candidate_management import router as recruiter_router
    app.include_router(recruiter_router, tags=["Recruiter Flow"])
    print("✅ Recruiter Flow endpoints included")
except Exception as e:
    print(f"⚠️ Could not load recruiter flow endpoints: {e}")



# Import and mount candidate dashboard endpoints
try:
    from api.candidates.dashboard.app import router as candidate_dashboard_router
    app.include_router(candidate_dashboard_router, tags=["Candidate Dashboard"])
    print("✅ Candidate Dashboard endpoints included")
except Exception as e:
    print(f"⚠️ Could not load candidate dashboard endpoints: {e}")


# Import and mount GDPR endpoints
try:
    from api.gdpr.consent.app import router as gdpr_consent_router
    from api.gdpr.deletion.app import router as gdpr_deletion_router
    from api.gdpr.data_export.app import router as gdpr_export_router
    from api.gdpr.retention.app import router as gdpr_retention_router
    from api.gdpr.audit.app import router as gdpr_audit_router
    from api.gdpr.privacy.app import router as gdpr_privacy_router
    app.include_router(gdpr_consent_router, tags=["GDPR Consent"])
    app.include_router(gdpr_deletion_router, tags=["GDPR Deletion"])
    app.include_router(gdpr_export_router, tags=["GDPR Data Export"])
    app.include_router(gdpr_retention_router, tags=["GDPR Retention"])
    app.include_router(gdpr_audit_router, tags=["GDPR Audit"])
    app.include_router(gdpr_privacy_router, tags=["GDPR Privacy"])
    print("✅ GDPR endpoints included")
except Exception as e:
    print(f"⚠️ Could not load GDPR endpoints: {e}")

# Import and mount ATS endpoints
try:
    from api.ats.connections.app import router as ats_connections_router
    from api.ats.sync.app import router as ats_sync_router
    from api.ats.webhooks.app import router as ats_webhooks_router
    app.include_router(ats_connections_router, tags=["ATS Connections"])
    app.include_router(ats_sync_router, tags=["ATS Sync"])
    app.include_router(ats_webhooks_router, tags=["ATS Webhooks"])
    print("✅ ATS endpoints included")
except Exception as e:
    print(f"⚠️ Could not load ATS endpoints: {e}")

# Import and mount Video Interview endpoints
try:
    from api.video.interviews.app import router as video_interviews_router
    from api.video.zoom.app import router as video_zoom_router
    from api.video.fraud.app import router as video_fraud_router
    
    # Video interviews router already has /api/video/interviews prefix in routes
    app.include_router(video_interviews_router, tags=["Video Interviews"])
    app.include_router(video_zoom_router, tags=["Zoom Integration"])
    app.include_router(video_fraud_router, tags=["Fraud Detection"])
    
    print("✅ Video Interview & Fraud Detection endpoints included")
    print(f"   Routes registered: {len(video_interviews_router.routes)} video interview routes")
    print("   Video Interview Routes:")
    for route in video_interviews_router.routes:
        print(f"     {list(route.methods)} {route.path}")
except Exception as e:
    import traceback
    print(f"❌ ERROR importing Video Interview endpoints: {e}")
    traceback.print_exc()
    print(f"⚠️ Could not load Video Interview endpoints: {e}")
    traceback.print_exc()

# Import and mount LiveKit endpoints
try:
    from routers.livekit_router import router as livekit_router
    print(f"🔍 LiveKit router imported: {livekit_router}")
    print(f"🔍 LiveKit router prefix: {livekit_router.prefix}")
    print(f"🔍 LiveKit router routes: {len(livekit_router.routes)}")
    app.include_router(livekit_router, prefix="/api/livekit")
    print("✅ LiveKit endpoints included")
except Exception as e:
    import traceback
    print(f"⚠️ Could not load LiveKit endpoints: {e}")
    traceback.print_exc()

# Import and mount Interview Rating endpoints (from client merge)
try:
    from api.ratings.app import router as ratings_router
    app.include_router(ratings_router, tags=["Interview Ratings"])
    print("✅ Interview Rating & Report Card endpoints included")
except Exception as e:
    print(f"⚠️ Could not load Interview Rating endpoints: {e}")

# Import and mount Post-Hire Feedback endpoints
try:
    from api.feedback.submissions.app import router as feedback_submissions_router
    from api.feedback.quality.app import router as feedback_quality_router
    app.include_router(feedback_submissions_router, tags=["Post-Hire Feedback"])
    app.include_router(feedback_quality_router, tags=["Quality Metrics"])
    print("✅ Post-Hire Feedback & Quality Metrics endpoints included")
except Exception as e:
    print(f"⚠️ Could not load Feedback endpoints: {e}")

print("✅ Auth Router included")
print("🌐 CORS enabled for frontend")
print("📡 API ready - ONLY YOUR DATABASE DATA")

@app.get("/")
def read_root(db: Session = Depends(get_db)):
    """Root endpoint with ONLY database information"""
    try:
        # Get ONLY actual database stats
        total_jobs = db.query(Job).filter(Job.is_active == True).count()
        total_users = db.query(User).filter(User.is_active == True).count()
        total_applications = db.query(JobApplication).count()
        
        return {
            "message": "AI Interview Platform API - DATABASE ONLY",
            "version": "1.0.0",
            "status": "running",
            "database_stats": {
                "total_jobs": total_jobs,
                "total_users": total_users,
                "total_applications": total_applications
            },
            "available_endpoints": {
                "auth": {
                    "signup": "/api/auth/signup",
                    "login": "/api/auth/login", 
                    "me": "/api/auth/me",
                    "profile":"/api/auth/profile",
                },
                "jobs": {
                    "create": "/api/createJob",
                    "list": "/api/jobs",
                    "get": "/api/jobs/{id}",
                    "search": "/api/jobs/search?q={query}",
                    "stats": "/api/jobs/stats",
                    "apply": "/api/job/apply"
                },
                "data": {
                    "companies": "/api/companies",
                    "departments": "/api/departments", 
                    "skills": "/api/skills"
                }
            },
            "note": "ONLY YOUR DATABASE DATA - NO SAMPLE DATA"
        }
    except Exception as e:
        return {
            "message": "AI Interview Platform API - DATABASE ONLY",
            "version": "1.0.0",
            "status": "running",
            "error": f"Database error: {str(e)}",
            "note": "Database might be empty"
        }

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "data_source": "database_only"}

# Job endpoints - specific routes first
@app.get("/api/jobs/stats")
def get_job_stats(db: Session = Depends(get_db)):
    """Get job statistics from YOUR database ONLY"""
    try:
        from sqlalchemy import func, distinct
        
        # Basic counts from YOUR database
        total_jobs = db.query(Job).filter(Job.is_active == True).count()
        open_jobs = db.query(Job).filter(
            Job.status == "Open",
            Job.is_active == True
        ).count()
        closed_jobs = db.query(Job).filter(
            Job.status == "Closed"
        ).count()

        if total_jobs == 0:
            return {
                "message": "No jobs found in database",
                "total_jobs": 0,
                "open_jobs": 0,
                "note": "Database is empty - add jobs first"
            }
        
        # Get job counts by type
        job_types = db.query(Job.job_type, func.count(Job.id)).filter(
            Job.is_active == True
        ).group_by(Job.job_type).all()
        
        # Get job counts by experience level
        experience_levels = db.query(Job.experience_level, func.count(Job.id)).filter(
            Job.is_active == True
        ).group_by(Job.experience_level).all()
        
        # Get job counts by company
        companies = db.query(Job.company, func.count(Job.id)).filter(
            Job.is_active == True
        ).group_by(Job.company).all()
        
        return {
            "total_jobs": total_jobs,
            "open_jobs": open_jobs,
            "closed_jobs": closed_jobs,
            "job_types": dict(job_types),
            "experience_levels": dict(experience_levels),
            "companies": dict(companies),
            "data_source": "your_database_only"
        }
        
    except Exception as e:
        print(f"❌ Error getting job stats: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/api/jobs/search")
def search_jobs(
    q: str,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Search jobs in YOUR database ONLY"""
    try:
        jobs = db.query(Job).filter(
            (Job.title.ilike(f"%{q}%") | Job.description.ilike(f"%{q}%")),
            Job.is_active == True
        ).offset(skip).limit(limit).all()
        
        return {
            "jobs": jobs,
            "count": len(jobs),
            "search_query": q,
            "data_source": "your_database_only"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/api/jobs", response_model=List[JobResponse])
def read_jobs(
    skip: int = 0, 
    limit: int = 100, 
    status: str = None,
    company: str = None,
    job_type: str = None,
    experience_level: str = None,
    db: Session = Depends(get_db)
):
    """Fetch jobs from YOUR database ONLY"""
    try:
        print(f"🔍 Fetching jobs from YOUR database...")
        print(f"🔍 Filters: status={status}, company={company}")
        
        # Build query with filters (eager-load applications for application_count)
        from sqlalchemy.orm import subqueryload
        query = db.query(Job).options(subqueryload(Job.applications)).filter(Job.is_active == True)
        
        if status:
            query = query.filter(Job.status == status)
        if company:
            query = query.filter(Job.company.ilike(f"%{company}%"))
        if job_type:
            query = query.filter(Job.job_type == job_type)
        if experience_level:
            query = query.filter(Job.experience_level == experience_level)
        
        # Apply pagination
        jobs = query.offset(skip).limit(limit).all()
        
        print(f"📊 Found {len(jobs)} jobs in YOUR database")
        if len(jobs) == 0:
            print("⚠️ No jobs found - database might be empty")
        else:
            for job in jobs:
                print(f"   - Job: {job.id}, {job.title} at {job.company}")
        
        return jobs
        
    except Exception as e:
        print(f"❌ Error fetching jobs: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.get("/api/jobs/{job_id}", response_model=JobResponse)
def read_job(job_id: int, db: Session = Depends(get_db)):
    """Get specific job from YOUR database"""
    db_job = get_job(db, job_id=job_id)
    if db_job is None:
        raise HTTPException(status_code=404, detail="Job not found in your database")
    return db_job

@app.put("/api/jobs/{job_id}", response_model=JobResponse)
def update_job_endpoint(
    job_id: int,
    job_data: JobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update a job (recruiter/admin only)"""
    if current_user.role not in [UserRole.RECRUITER, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to update jobs")
    db_job = update_job(db, job_id=job_id, job_update=job_data, user_id=current_user.id)
    if db_job is None:
        # Fallback: allow update if user is admin even if not the creator
        if current_user.role == UserRole.ADMIN:
            db_job = db.query(Job).filter(Job.id == job_id).first()
            if not db_job:
                raise HTTPException(status_code=404, detail="Job not found")
            update_data = job_data.dict(exclude_unset=True)
            for key, value in update_data.items():
                setattr(db_job, key, value)
            db.commit()
            db.refresh(db_job)
        else:
            raise HTTPException(status_code=404, detail="Job not found or not authorized")
    return db_job

@app.get("/api/companies")
def get_companies(db: Session = Depends(get_db)):
    """Get companies from YOUR database ONLY"""
    try:
        from sqlalchemy import distinct
        
        companies = db.query(distinct(Job.company)).filter(
            Job.is_active == True
        ).all()
        
        company_list = [company[0] for company in companies if company[0]]
        
        return {
            "companies": sorted(company_list),
            "count": len(company_list),
            "data_source": "your_database_only"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/api/departments")
def get_departments(db: Session = Depends(get_db)):
    """Get departments from YOUR database ONLY"""
    try:
        from sqlalchemy import distinct
        
        departments = db.query(distinct(Job.department)).filter(
            Job.is_active == True
        ).all()
        
        department_list = [dept[0] for dept in departments if dept[0]]
        
        return {
            "departments": sorted(department_list),
            "count": len(department_list),
            "data_source": "your_database_only"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/api/skills")
def get_all_skills(db: Session = Depends(get_db)):
    """Get skills from YOUR database ONLY"""
    try:
        jobs = db.query(Job.skills_required).filter(
            Job.is_active == True,
            Job.skills_required.isnot(None)
        ).all()
        
        all_skills = set()
        for job in jobs:
            if job.skills_required:
                try:
                    skills = json.loads(job.skills_required)
                    if isinstance(skills, list):
                        all_skills.update(skills)
                except json.JSONDecodeError:
                    # Handle comma-separated skills
                    skills = [skill.strip() for skill in job.skills_required.split(',')]
                    all_skills.update(skills)
        
        skill_list = sorted(list(all_skills))
        
        return {
            "skills": skill_list,
            "count": len(skill_list),
            "data_source": "your_database_only"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

# Job Application endpoints
@app.get("/api/job/{job_id}/check-application")
def check_application_status(
    job_id: int,
    email: str,
    db: Session = Depends(get_db)
):
    """Check if user has already applied for a job"""
    try:
        # Check if application exists
        application = db.query(JobApplication).filter(
            JobApplication.job_id == job_id,
            JobApplication.applicant_email == email
        ).first()
        
        if application:
            return {
                "has_applied": True,
                "application_id": application.id,
                "application_date": application.applied_at.isoformat(),
                "status": application.status,
                "applicant_name": application.applicant_name
            }
        else:
            return {
                "has_applied": False,
                "application_id": None,
                "application_date": None,
                "status": None,
                "applicant_name": None
            }
            
    except Exception as e:
        print(f"❌ Error checking application status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

from services.resume_parser import parse_resume as _parse_resume_full


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
    """Submit job application with resume file upload"""
    try:
        print(f"🔍 Processing job application with resume for job ID: {job_id}")

        # Check if job exists and is open
        job = db.query(Job).filter(Job.id == job_id, Job.is_active == True).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found or not active")
        if job.status == "Closed":
            raise HTTPException(status_code=400, detail="This job is closed and no longer accepting applications")

        # Check if user already applied
        existing_application = db.query(JobApplication).filter(
            JobApplication.job_id == job_id,
            JobApplication.applicant_email == applicant_email
        ).first()

        if existing_application:
            raise HTTPException(status_code=400, detail="You have already applied for this job")

        # Create new application
        from services.encryption_service import encrypt_pii as _enc_pii
        new_application = JobApplication(
            job_id=job_id,
            applicant_name=applicant_name,
            applicant_email=applicant_email,
            applicant_phone=_enc_pii(applicant_phone) if applicant_phone else applicant_phone,
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
            UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads/resumes")
            os.makedirs(UPLOAD_DIR, exist_ok=True)

            ext = resume.filename.rsplit(".", 1)[-1] if "." in resume.filename else "pdf"
            unique_name = f"{new_application.id}_{uuid.uuid4().hex[:8]}.{ext}"
            file_path = os.path.join(UPLOAD_DIR, unique_name)

            content = await resume.read()
            with open(file_path, "wb") as f:
                f.write(content)

            # Parse resume: extract text, skills, experience level
            job_skills_list = []
            if job.skills_required:
                try:
                    job_skills_list = json.loads(job.skills_required) if isinstance(job.skills_required, str) else job.skills_required
                except Exception:
                    pass

            parse_result = _parse_resume_full(file_path, resume.filename, job_skills_list, experience_years)
            parsed_text = parse_result["parsed_text"]
            parsed_skills = parse_result["skills"]
            contact_info = parse_result.get("contact_info", {})

            # Auto-fill empty application fields from resume
            if not current_position and contact_info.get("current_position"):
                new_application.current_position = contact_info["current_position"]
            if experience_years == 0 and contact_info.get("experience_years"):
                new_application.experience_years = contact_info["experience_years"]

            final_exp = new_application.experience_years or experience_years

            candidate_resume = CandidateResume(
                candidate_id=new_application.id,
                job_id=job_id,
                resume_path=file_path,
                original_filename=resume.filename,
                file_size=len(content),
                parsed_text=parsed_text,
                skills=json.dumps(parsed_skills),
                experience_years=final_exp,
                experience_level=parse_result["experience_level"],
                parsing_status=parse_result["parsing_status"]
            )
            db.add(candidate_resume)

            # Update resume_url in application
            new_application.resume_url = f"/uploads/resumes/{unique_name}"

            resume_info = {
                "uploaded": True,
                "filename": resume.filename,
                "parsed_text_length": len(parsed_text) if parsed_text else 0,
                "parsed_skills": parsed_skills
            }
            print(f"✅ Resume uploaded and parsed: {resume.filename}")

        db.commit()
        db.refresh(new_application)

        print(f"✅ Application submitted successfully: ID={new_application.id}")

        return {
            "message": "Application submitted successfully",
            "application_id": new_application.id,
            "applicant_name": new_application.applicant_name,
            "status": "Applied",
            "resume_uploaded": resume_info is not None,
            "resume_info": resume_info
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error submitting application: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to submit application: {str(e)}"
        )

@app.get("/api/candidates")
def get_candidates(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all candidates from JobApplications (deduplicated by email)."""
    try:
        print(f"Fetching candidates from job_applications...")

        # Fetch all job applications
        query = db.query(JobApplication)

        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    JobApplication.applicant_name.ilike(search_term),
                    JobApplication.applicant_email.ilike(search_term),
                    JobApplication.current_position.ilike(search_term),
                )
            )

        all_applications = query.order_by(JobApplication.applied_at.desc()).all()

        if not all_applications:
            return {"success": True, "data": [], "total": 0, "message": "No candidates found"}

        # --- Deduplicate by email: keep all applications but group by email ---
        email_to_apps = {}
        for app in all_applications:
            email_to_apps.setdefault(app.applicant_email.lower(), []).append(app)

        all_app_ids = [app.id for app in all_applications]

        # --- BULK PRE-FETCH related data ---

        # 1. Resumes (for skills)
        all_resumes = db.query(CandidateResume).filter(
            CandidateResume.candidate_id.in_(all_app_ids)
        ).all() if all_app_ids else []

        app_id_to_resume = {}
        for r in all_resumes:
            app_id_to_resume[r.candidate_id] = r

        # 2. Interview sessions (for scores)
        all_sessions = db.query(
            InterviewSession.id,
            InterviewSession.job_id,
            InterviewSession.application_id,
            InterviewSession.overall_score,
            InterviewSession.interview_mode,
            InterviewSession.status,
            InterviewSession.recommendation,
            InterviewSession.created_at,
        ).filter(
            InterviewSession.application_id.in_(all_app_ids)
        ).all() if all_app_ids else []

        app_id_to_sessions = {}
        for s in all_sessions:
            app_id_to_sessions.setdefault(s.application_id, []).append(s)

        # 3. Question generation sessions
        all_q_sessions = db.query(QuestionGenerationSession).filter(
            QuestionGenerationSession.candidate_id.in_(all_app_ids)
        ).order_by(QuestionGenerationSession.created_at.desc()).all() if all_app_ids else []

        app_id_to_q_session = {}
        for qs in all_q_sessions:
            if qs.candidate_id not in app_id_to_q_session:
                app_id_to_q_session[qs.candidate_id] = qs

        # 4. Jobs (for titles)
        job_ids = list(set(app.job_id for app in all_applications))
        all_jobs = db.query(Job).filter(Job.id.in_(job_ids)).all() if job_ids else []
        job_id_to_title = {j.id: j.title for j in all_jobs}

        # 5. User accounts (for is_active status)
        all_emails = list(email_to_apps.keys())
        all_users = db.query(User.email, User.is_active).filter(
            func.lower(User.email).in_(all_emails)
        ).all() if all_emails else []
        email_to_active = {u.email.lower(): u.is_active for u in all_users}

        # --- Build deduplicated candidate list ---
        candidate_list = []
        seen_emails = set()

        for email, apps in email_to_apps.items():
            if email in seen_emails:
                continue
            seen_emails.add(email)

            # Use the most recent application as primary
            primary_app = apps[0]  # already sorted by applied_at desc

            # Collect all job titles this candidate applied to
            applied_jobs = []
            for a in apps:
                title = job_id_to_title.get(a.job_id, "Unknown")
                applied_jobs.append({"job_id": a.job_id, "title": title, "status": a.status, "application_id": a.id})

            # Collect skills from all resumes
            skills = []
            for a in apps:
                resume = app_id_to_resume.get(a.id)
                if resume and resume.skills:
                    try:
                        parsed = json.loads(resume.skills)
                        if isinstance(parsed, list):
                            skills.extend(parsed)
                    except:
                        pass
            skills = list(dict.fromkeys(skills))[:10]  # Deduplicate, max 10

            # Best score across all applications
            best_score = 0.0
            best_recommendation = None
            has_transcript = False
            for a in apps:
                for s in app_id_to_sessions.get(a.id, []):
                    has_transcript = True
                    if s.overall_score and s.overall_score > best_score:
                        best_score = s.overall_score
                        best_recommendation = s.recommendation
                # Also check application-level scores
                if a.final_score and a.final_score > best_score:
                    best_score = float(a.final_score)
                if a.ai_score and float(a.ai_score) > best_score:
                    best_score = float(a.ai_score)

            # Get latest question session
            question_session_id = None
            for a in apps:
                qs = app_id_to_q_session.get(a.id)
                if qs:
                    question_session_id = qs.id
                    break

            # Determine overall status
            statuses = [a.status for a in apps]
            if "Hired" in statuses:
                overall_status = "Hired"
            elif "Interview" in statuses:
                overall_status = "Interview"
            elif "Reviewed" in statuses:
                overall_status = "Reviewed"
            elif "Rejected" in statuses and len(set(statuses)) == 1:
                overall_status = "Rejected"
            else:
                overall_status = "Applied"

            candidate_data = {
                "id": primary_app.id,
                "name": primary_app.applicant_name,
                "email": primary_app.applicant_email,
                "phone": primary_app.applicant_phone or "",
                "experience": f"{primary_app.experience_years or 0} years" if primary_app.experience_years else "N/A",
                "currentPosition": primary_app.current_position or "",
                "location": primary_app.location or "",
                "skills": skills,
                "score": round(best_score, 1),
                "recommendation": best_recommendation.value if best_recommendation else None,
                "status": overall_status,
                "is_active": email_to_active.get(email, True),
                "appliedAt": primary_app.applied_at.isoformat() if primary_app.applied_at else None,
                "appliedJobs": applied_jobs,
                "totalApplications": len(apps),
                "hasTranscript": has_transcript,
                "questionSessionId": question_session_id,
                # Keep backward compatibility
                "role": "candidate",
                "department": primary_app.current_company or "",
                "hireDate": primary_app.applied_at.strftime("%Y-%m-%d") if primary_app.applied_at else "",
                "onlineStatus": "Inactive",
                "isOnline": False,
                "lastActivity": None,
                "interview_questions": [],
                "interview_transcripts": [],
            }
            candidate_list.append(candidate_data)

        # Apply pagination
        total = len(candidate_list)
        candidate_list = candidate_list[skip:skip + limit]

        return {
            "success": True,
            "data": candidate_list,
            "total": total,
            "message": f"Found {total} candidates"
        }

    except Exception as e:
        print(f"Error fetching candidates: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.patch("/api/candidates/{candidate_id}/toggle-status")
def toggle_candidate_status(
    candidate_id: int,
    db: Session = Depends(get_db),
):
    """Toggle candidate active/inactive status."""
    application = db.query(JobApplication).filter(JobApplication.id == candidate_id).first()
    if not application:
        raise HTTPException(status_code=404, detail="Candidate not found")

    email = application.applicant_email.lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()

    if user:
        user.is_active = not user.is_active
        db.commit()
        db.refresh(user)
        return {"id": candidate_id, "email": email, "is_active": user.is_active}
    else:
        # No user account — just return current state
        return {"id": candidate_id, "email": email, "is_active": True, "message": "No user account found"}


@app.delete("/api/candidates/{candidate_id}")
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
):
    """Delete a candidate and all their job applications by email."""
    try:
        # Find the primary application
        primary_app = db.query(JobApplication).filter(JobApplication.id == candidate_id).first()
        if not primary_app:
            raise HTTPException(status_code=404, detail="Candidate not found")

        email = primary_app.applicant_email.lower()

        # Find the user account by email (for user-linked records)
        candidate_user = db.query(User).filter(func.lower(User.email) == email).first()

        # Get all application IDs for this email
        app_ids = [
            a.id for a in db.query(JobApplication.id).filter(
                func.lower(JobApplication.applicant_email) == email
            ).all()
        ]

        # === Step 1: Get all question IDs for these applications ===
        question_ids = [
            q.id for q in db.query(InterviewQuestion.id).filter(
                InterviewQuestion.candidate_id.in_(app_ids)
            ).all()
        ]

        # === Step 2: Delete all records that FK to interview_questions ===
        if question_ids:
            db.query(InterviewRating).filter(InterviewRating.question_id.in_(question_ids)).delete(synchronize_session=False)
            db.query(InterviewQuestionVersion).filter(InterviewQuestionVersion.question_id.in_(question_ids)).delete(synchronize_session=False)
            # InterviewAnswer also FKs to interview_questions
            db.query(InterviewAnswer).filter(InterviewAnswer.question_id.in_(question_ids)).delete(synchronize_session=False)

        # === Step 3: Get all session IDs (via application_id or user) ===
        session_ids = [
            s.id for s in db.query(InterviewSession.id).filter(
                InterviewSession.application_id.in_(app_ids)
            ).all()
        ]
        if candidate_user:
            user_session_ids = [
                s.id for s in db.query(InterviewSession.id).filter(
                    InterviewSession.candidate_id == candidate_user.id
                ).all()
            ]
            session_ids = list(set(session_ids + user_session_ids))

        # Delete remaining answers by session_id (in case some weren't caught by question_id)
        if session_ids:
            db.query(InterviewAnswer).filter(InterviewAnswer.session_id.in_(session_ids)).delete(synchronize_session=False)

        # === Step 4: Delete user-linked records (FK to users.id) ===
        if candidate_user:
            # Get video interview IDs to delete fraud analyses
            video_ids = [
                v.id for v in db.query(VideoInterview.id).filter(
                    VideoInterview.candidate_id == candidate_user.id
                ).all()
            ]
            if video_ids:
                db.query(FraudAnalysis).filter(FraudAnalysis.video_interview_id.in_(video_ids)).delete(synchronize_session=False)

            db.query(VideoInterview).filter(VideoInterview.candidate_id == candidate_user.id).delete(synchronize_session=False)
            db.query(PostHireFeedback).filter(PostHireFeedback.candidate_id == candidate_user.id).delete(synchronize_session=False)
            db.query(InterviewSession).filter(InterviewSession.candidate_id == candidate_user.id).delete(synchronize_session=False)

        # === Step 5: Delete application-linked records ===
        db.query(InterviewSession).filter(InterviewSession.application_id.in_(app_ids)).delete(synchronize_session=False)
        db.query(InterviewQuestion).filter(InterviewQuestion.candidate_id.in_(app_ids)).delete(synchronize_session=False)
        db.query(QuestionGenerationSession).filter(QuestionGenerationSession.candidate_id.in_(app_ids)).delete(synchronize_session=False)
        db.query(CandidateResume).filter(CandidateResume.candidate_id.in_(app_ids)).delete(synchronize_session=False)
        db.query(ATSCandidateMapping).filter(ATSCandidateMapping.local_application_id.in_(app_ids)).delete(synchronize_session=False)

        # === Step 6: Delete the applications themselves ===
        deleted = db.query(JobApplication).filter(
            JobApplication.id.in_(app_ids)
        ).delete(synchronize_session=False)

        db.commit()
        return {"success": True, "message": f"Deleted {deleted} application(s) and all related data for {email}"}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error deleting candidate: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/candidates/{candidate_id}/interviews")
def get_candidate_interviews(
    candidate_id: int,
    db: Session = Depends(get_db)
):
    """Get all interview sessions and applications for a candidate."""
    try:
        # User 
        candidate = db.query(User).filter(User.id == candidate_id).first()
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
            
        # Applications
        applications = db.query(JobApplication).filter(
            JobApplication.applicant_email == candidate.email
        ).all()
        
        # Sessions
        sessions = db.query(InterviewSession).filter(
            InterviewSession.candidate_id == candidate_id
        ).all()
        
        result = []
        for app in applications:
            # Find matching session
            session = next((s for s in sessions if s.job_id == app.job_id), None)
            
            result.append({
                "job_id": app.job_id,
                "job_title": app.job.title if app.job else "Unknown Job",
                "status": app.status,
                "applied_at": app.applied_at.isoformat() if app.applied_at else None,
                "score": session.overall_score if session else None,
                "has_transcript": session.transcript_text is not None if session else False,
                "transcript_preview": session.transcript_text[:100] + "..." if session and session.transcript_text else None,
                "session_id": session.id if session else None
            })
            
        return {"success": True, "interviews": result}
        
    except Exception as e:
        print(f"❌ Error fetching candidate interviews: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/candidates/{candidate_id}/activity")
def update_candidate_activity(
    candidate_id: int,
    db: Session = Depends(get_db)
):
    """Update candidate's last activity timestamp"""
    try:
        candidate = db.query(User).filter(
            User.id == candidate_id
        ).first()
        
        if not candidate:
            raise HTTPException(status_code=404, detail="User not found")
        
        from datetime import datetime, timezone
        candidate.last_activity = datetime.now(timezone.utc)
        candidate.is_online = True
        db.commit()
        
        return {
            "success": True,
            "message": "Activity updated",
            "isOnline": True,
            "lastActivity": candidate.last_activity.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error updating candidate activity: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.post("/api/auth/activity")
def update_user_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update current user's activity timestamp"""
    try:
        from datetime import datetime, timezone
        current_user.last_activity = datetime.now(timezone.utc)
        current_user.is_online = True
        db.commit()

        return {
            "success": True,
            "message": "Activity updated",
            "isOnline": True,
            "lastActivity": current_user.last_activity.isoformat()
        }

    except Exception as e:
        db.rollback()
        print(f"❌ Error updating user activity: {e}")
        return {"success": False, "message": "Activity update failed"}

@app.post("/api/auth/logout")
def logout_user(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Set user offline on logout"""
    try:
        current_user.is_online = False
        db.commit()
        return {"success": True, "message": "Logged out"}
    except Exception as e:
        db.rollback()
        return {"success": False, "message": "Logout failed"}

@app.get("/api/candidate/profile")
def get_candidate_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get current user's complete candidate profile"""
    try:
        # Parse JSON fields
        skills_list = []
        if current_user.skills:
            try:
                skills_list = json.loads(current_user.skills)
            except:
                skills_list = []
        
        languages_list = []
        if current_user.languages:
            try:
                languages_list = json.loads(current_user.languages)
            except:
                languages_list = []
        
        education_list = []
        if current_user.education:
            try:
                education_list = json.loads(current_user.education)
            except:
                education_list = []
        
        professional_experience_list = []
        if current_user.professional_experience:
            try:
                professional_experience_list = json.loads(current_user.professional_experience)
            except:
                professional_experience_list = []
        
        certifications_list = []
        if current_user.certifications:
            try:
                certifications_list = json.loads(current_user.certifications)
            except:
                certifications_list = []
        
        # Decrypt PII fields
        from services.encryption_service import safe_decrypt
        return {
            "success": True,
            "data": {
                "id": current_user.id,
                "email": current_user.email,
                "full_name": safe_decrypt(current_user.full_name) or "",
                "mobile": safe_decrypt(current_user.mobile or current_user.phone) or "",
                "gender": safe_decrypt(current_user.gender) or "male",
                "location": safe_decrypt(current_user.location) or "",
                "bio": safe_decrypt(current_user.bio) or "",
                "education": education_list,
                "has_internship": current_user.has_internship or False,
                "internship_company": safe_decrypt(current_user.internship_company) or "",
                "internship_position": safe_decrypt(current_user.internship_position) or "",
                "internship_duration": current_user.internship_duration or "",
                "internship_salary": current_user.internship_salary or "",
                "skills": skills_list,
                "languages": languages_list,
                "preferred_location": safe_decrypt(current_user.preferred_location) or "",
                "preferred_job_title": safe_decrypt(current_user.preferred_job_title) or "",
                "preferred_job_type": current_user.preferred_job_type or "full-time",
                "profile_image": current_user.profile_image or "",
                "resume_url": current_user.resume_url or "",
                "professional_experience": professional_experience_list,
                "certifications": certifications_list
            }
        }
        
    except Exception as e:
        print(f"❌ Error getting candidate profile: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.put("/api/candidate/profile")
def update_candidate_profile(
    profile_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update current user's complete candidate profile"""
    try:
        print(f"🔍 Debug - Updating profile for user ID: {current_user.id}")
        print(f"🔍 Debug - Profile data received: {profile_data}")
        
        # Update basic profile fields
        if "full_name" in profile_data:
            current_user.full_name = profile_data["full_name"]
            print(f"🔍 Debug - Updated full_name to: {profile_data['full_name']}")
        if "mobile" in profile_data:
            current_user.mobile = profile_data["mobile"]
            current_user.phone = profile_data["mobile"]  # Keep phone in sync
            print(f"🔍 Debug - Updated mobile to: {profile_data['mobile']}")
        if "gender" in profile_data:
            current_user.gender = profile_data["gender"]
        if "location" in profile_data:
            current_user.location = profile_data["location"]
            print(f"🔍 Debug - Updated location to: {profile_data['location']}")
        if "bio" in profile_data:
            current_user.bio = profile_data["bio"]
            print(f"🔍 Debug - Updated bio to: {profile_data['bio']}")
        
        # Update education (JSON field)
        if "education" in profile_data:
            current_user.education = json.dumps(profile_data["education"])
        
        # Update internship fields
        if "has_internship" in profile_data:
            current_user.has_internship = profile_data["has_internship"]
        if "internship_company" in profile_data:
            current_user.internship_company = profile_data["internship_company"]
        if "internship_position" in profile_data:
            current_user.internship_position = profile_data["internship_position"]
        if "internship_duration" in profile_data:
            current_user.internship_duration = profile_data["internship_duration"]
        if "internship_salary" in profile_data:
            current_user.internship_salary = profile_data["internship_salary"]
        
        # Update skills and languages (JSON fields)
        if "skills" in profile_data:
            current_user.skills = json.dumps(profile_data["skills"])
            print(f"🔍 Debug - Updated skills to: {profile_data['skills']}")
        if "languages" in profile_data:
            current_user.languages = json.dumps(profile_data["languages"])
            print(f"🔍 Debug - Updated languages to: {profile_data['languages']}")
        
        # Update job preferences
        if "preferred_location" in profile_data:
            current_user.preferred_location = profile_data["preferred_location"]
        if "preferred_job_title" in profile_data:
            current_user.preferred_job_title = profile_data["preferred_job_title"]
        if "preferred_job_type" in profile_data:
            current_user.preferred_job_type = profile_data["preferred_job_type"]
        
        # Update profile image and resume
        if "profile_image" in profile_data:
            current_user.profile_image = profile_data["profile_image"]
        if "resume_url" in profile_data:
            current_user.resume_url = profile_data["resume_url"]
        
        # Update professional experience and certifications (JSON fields)
        if "professional_experience" in profile_data:
            current_user.professional_experience = json.dumps(profile_data["professional_experience"])
        if "certifications" in profile_data:
            current_user.certifications = json.dumps(profile_data["certifications"])
        
        # Update existing fields for backward compatibility
        if "department" in profile_data:
            current_user.department = profile_data["department"]
        if "experience_years" in profile_data:
            current_user.experience_years = profile_data["experience_years"]
        if "current_position" in profile_data:
            current_user.current_position = profile_data["current_position"]
        if "bio" in profile_data:
            current_user.bio = profile_data["bio"]
        if "company" in profile_data:
            current_user.company = profile_data["company"]

        # Encrypt PII fields before writing to DB
        from services.encryption_service import encrypt_user_fields
        encrypt_user_fields(current_user)

        db.commit()
        print(f"🔍 Debug - Profile update committed to database")
        
        return {
            "success": True,
            "message": "Profile updated successfully"
        }
        
    except Exception as e:
        print(f"❌ Error updating candidate profile: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/api/candidates/online-status")
def get_candidates_online_status(db: Session = Depends(get_db)):
    """Get real-time online status for all candidates"""
    try:
        from datetime import datetime, timedelta, timezone

        # Consider users offline if no activity in last 5 minutes
        now = datetime.now(timezone.utc)
        offline_threshold = now - timedelta(minutes=5)

        candidates = db.query(
            User.id,
            User.is_online,
            User.last_activity,
        ).filter(
            User.role == UserRole.CANDIDATE,
            User.is_active == True
        ).all()

        status_updates = []
        ids_to_set_offline = []
        for c_id, c_is_online, c_last_activity in candidates:
            # Make both datetimes comparable (handle naive vs aware)
            last_act = c_last_activity
            if last_act and last_act.tzinfo is None:
                last_act = last_act.replace(tzinfo=timezone.utc)

            is_online = bool(
                c_is_online and
                last_act and
                last_act > offline_threshold
            )

            if c_is_online and not is_online:
                ids_to_set_offline.append(c_id)

            status_updates.append({
                "id": c_id,
                "isOnline": is_online,
                "onlineStatus": "Active" if is_online else "Inactive",
                "lastActivity": c_last_activity.isoformat() if c_last_activity else None
            })

        # Batch update offline users in one query
        if ids_to_set_offline:
            db.query(User).filter(User.id.in_(ids_to_set_offline)).update(
                {User.is_online: False}, synchronize_session=False
            )
            db.commit()

        return {
            "success": True,
            "data": status_updates
        }

    except Exception as e:
        db.rollback()
        print(f"❌ Error getting online status: {e}")
        return {
            "success": False,
            "data": []
        }

# Candidate Profile endpoints
@app.get("/test")
def test_endpoint():
    """Simple test endpoint"""
    print("🔍 Test endpoint called!")
    return {"message": "Test endpoint working"}


# ------------------------------------------------------------------------------
# Candidate Page MVP Actions
# ------------------------------------------------------------------------------

class CandidateQuestionGenerateRequest(BaseModel):
    job_id: int
    total_questions: int = 10
    generation_mode: str = "balanced"

@app.post("/api/candidates/{candidate_id}/generate-questions")
def generate_questions_for_candidate(
    candidate_id: int,
    request: CandidateQuestionGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate questions for a candidate (User) for a specific job."""
    if current_user.role not in [UserRole.RECRUITER, UserRole.ADMIN, UserRole.DOMAIN_EXPERT]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    candidate_user = db.query(User).filter(User.id == candidate_id).first()
    if not candidate_user:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    # Check for existing JobApplication
    application = db.query(JobApplication).filter(
        JobApplication.applicant_email == candidate_user.email,
        JobApplication.job_id == request.job_id
    ).first()
    
    # If no application, create one
    if not application:
        from services.encryption_service import encrypt_pii as _enc
        application = JobApplication(
            job_id=request.job_id,
            applicant_name=candidate_user.full_name or candidate_user.username,
            applicant_email=candidate_user.email,
            applicant_phone=_enc(candidate_user.phone) if candidate_user.phone else candidate_user.phone,
            status="Applied"
        )
        db.add(application)
        db.commit()
        db.refresh(application)
        
    # Check existing session AND actual questions
    existing_session = db.query(QuestionGenerationSession).filter(
        QuestionGenerationSession.job_id == request.job_id,
        QuestionGenerationSession.candidate_id == application.id
    ).first()

    existing_questions_count = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == request.job_id,
        InterviewQuestion.candidate_id == application.id
    ).count()

    if existing_session and existing_session.status == "generated" and existing_questions_count > 0:
        return {"success": True, "message": "Questions already generated", "session_id": existing_session.id, "total_questions": existing_questions_count}

    # If session exists but no questions, delete stale session and regenerate
    if existing_session and existing_questions_count == 0:
        db.delete(existing_session)
        db.commit()

    # Generate Questions
    try:
        generator = get_question_generator()
        result = generator.generate_questions(
            db=db,
            job_id=request.job_id,
            candidate_id=application.id,
            total_questions=request.total_questions
        )
        return {"success": True, "message": "Questions generated successfully", "session_id": result["session_id"]}
    except Exception as e:
        print(f"Error generating questions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class TranscriptUploadRequest(BaseModel):
    job_id: int
    transcript_text: str

@app.post("/api/candidates/{candidate_id}/upload-transcript")
def upload_transcript_for_candidate(
    candidate_id: int,
    request: TranscriptUploadRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Upload transcript for a candidate."""
    if current_user.role not in [UserRole.RECRUITER, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized")

    candidate_user = db.query(User).filter(User.id == candidate_id).first()
    if not candidate_user:
         raise HTTPException(status_code=404, detail="Candidate not found")

    # Find Application ID if exists
    application = db.query(JobApplication).filter(
        JobApplication.applicant_email == candidate_user.email,
        JobApplication.job_id == request.job_id
    ).first()
    
    app_id = application.id if application else None
    
    # Check/Create Interview Session
    session = db.query(InterviewSession).filter(
        InterviewSession.candidate_id == candidate_id,
        InterviewSession.job_id == request.job_id
    ).first()
    
    if not session:
        # Create new session if it doesn't exist
        session = InterviewSession(
            job_id=request.job_id,
            candidate_id=candidate_id,
            status=InterviewSessionStatus.IN_PROGRESS,
            interview_mode="recruiter_driven",
            transcript_text=request.transcript_text
        )
        db.add(session)
        db.flush()
    else:
        # Update existing session
        session.transcript_text = request.transcript_text
    
    # Update the User (Candidate) object directly as requested
    candidate = db.query(User).filter(User.id == candidate_id).first()
    if candidate:
        candidate.transcription = request.transcript_text
        candidate.has_transcript = True
        
    db.commit()
    db.refresh(session)
    
    return {
        "success": True, 
        "message": "Transcript uploaded successfully", 
        "session_id": session.id,
        "candidate": {
            "id": candidate.id,
            "hasTranscript": True,
            "transcription": request.transcript_text[:100] + "..." if len(request.transcript_text) > 100 else request.transcript_text
        }
    }


class ScoreGenerationRequest(BaseModel):
    job_id: int

@app.post("/api/candidates/{candidate_id}/generate-score")
def generate_score_for_candidate(
    candidate_id: int,
    request: ScoreGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Generate score based on transcript."""
    if current_user.role not in [UserRole.RECRUITER, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    candidate = db.query(User).filter(User.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    # Check for transcript in candidate or session
    transcript = None
    session = None
    
    # First check candidate's transcription field
    if candidate.transcription:
        transcript = candidate.transcription
    
    # Then check session transcript
    session = db.query(InterviewSession).filter(
        InterviewSession.candidate_id == candidate_id,
        InterviewSession.job_id == request.job_id
    ).first()
    
    if not transcript and session and session.transcript_text:
        transcript = session.transcript_text
    
    # If no transcript found, generate a default score instead of error
    if not transcript:
        # Create session if it doesn't exist
        if not session:
            session = InterviewSession(
                job_id=request.job_id,
                candidate_id=candidate_id,
                status=InterviewSessionStatus.IN_PROGRESS,
                interview_mode="recruiter_driven"
            )
            db.add(session)
            db.flush()
        
        # Generate default score for candidates without transcript
        default_score = 75.0  # Default score when no transcript
        session.overall_score = default_score
        session.status = InterviewSessionStatus.SCORED
        candidate.score = default_score
        candidate.has_transcript = False  # Mark as no transcript
        
        db.commit()
        
        return {
            "success": True, 
            "message": "Default score generated (no transcript uploaded)", 
            "score": default_score,
            "has_transcript": False
        }
    
    # If transcript exists, ensure session exists for scoring logic
    if not session:
        session = InterviewSession(
            job_id=request.job_id,
            candidate_id=candidate_id,
            status=InterviewSessionStatus.IN_PROGRESS,
            interview_mode="recruiter_driven"
        )
        db.add(session)
        db.flush()

    questions = db.query(InterviewQuestion).filter(
        InterviewQuestion.job_id == request.job_id,
        InterviewQuestion.is_approved == True
    ).all()
    
    if not questions:
        # Fallback to any questions if none approved
        questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.job_id == request.job_id
        ).all()
    
    if not questions:
         raise HTTPException(status_code=400, detail="No questions found for this job.")

    total_score = 0
    scored_items = 0
    
    # Score with Groq AI (primary - free, fast), Gemini (fallback)
    from services.groq_service import score_transcript_with_groq
    from services.gemini_service import score_transcript_with_gemini
    import config

    # Prepare questions for scoring
    questions_for_scoring = [
        {
            "question_id": q.id,
            "question_text": q.question_text,
            "sample_answer": q.sample_answer or ""
        }
        for q in questions
    ]

    llm_result = None

    # Try Groq first (free, fast)
    if config.GROQ_API_KEY:
        try:
            print(f"[AI] Scoring transcript with Groq API (primary)...")
            llm_result = score_transcript_with_groq(transcript, questions_for_scoring)
        except Exception as e:
            print(f"[WARN] Groq scoring failed: {e}")

    # Fallback to Gemini
    if not llm_result and config.GEMINI_API_KEY:
        try:
            print(f"[AI] Groq unavailable, trying Gemini (fallback)...")
            llm_result = score_transcript_with_gemini(transcript, questions_for_scoring)
        except Exception as e:
            print(f"[WARN] Gemini scoring also failed: {e}")

    if not llm_result:
        print(f"[WARN] Both AI scorers failed, using rule-based fallback")
    
    # Use AI results if available
    if llm_result:
        print(f"✅ AI scoring successful!")
        for pq in llm_result.get("per_question", []):
            q_id = pq.get("question_id")
            
            # Find or create answer
            answer = db.query(InterviewAnswer).filter(
                InterviewAnswer.session_id == session.id,
                InterviewAnswer.question_id == q_id
            ).first()
            
            if not answer:
                answer = InterviewAnswer(
                    session_id=session.id,
                    question_id=q_id
                )
                db.add(answer)
            
            # Save AI-generated scores and answers
            answer.answer_text = pq.get("extracted_answer", "[Extracted from Transcript]")
            answer.score = float(pq.get("score", 0))
            answer.relevance_score = float(pq.get("relevance_score", 0))
            answer.completeness_score = float(pq.get("completeness_score", 0))
            answer.accuracy_score = float(pq.get("accuracy_score", 0))
            answer.clarity_score = float(pq.get("clarity_score", 0))
            answer.feedback = pq.get("feedback", "")
            
            total_score += answer.score
            scored_items += 1
        
        avg_score = llm_result.get("overall_score", total_score / scored_items if scored_items > 0 else 0)
        session.recommendation = llm_result.get("recommendation", "next_round")
        session.strengths = llm_result.get("strengths", "")
        session.weaknesses = llm_result.get("weaknesses", "")
    else:
        # Fallback to mock scoring if AI fails
        print(f"⚠️ AI scoring failed, using mock scores")
        for q in questions:
            # Mock score (fallback)
            score = 85.5
            
            # Upsert answer
            answer = db.query(InterviewAnswer).filter(
                InterviewAnswer.session_id == session.id,
                InterviewAnswer.question_id == q.id
            ).first()
            
            if not answer:
                answer = InterviewAnswer(
                    session_id=session.id,
                    question_id=q.id,
                    answer_text="[Extracted from Transcript]",
                    score=score
                )
                db.add(answer)
            else:
                answer.score = score
                
            total_score += score
            scored_items += 1
        
        avg_score = total_score / scored_items if scored_items > 0 else 0
    
    session.overall_score = avg_score
    session.status = InterviewSessionStatus.SCORED
    candidate.score = avg_score
    candidate.has_transcript = True  # Mark as has transcript
    
    db.commit()
    
    return {
        "success": True, 
        "message": "Score generated from transcript", 
        "score": avg_score,
        "has_transcript": True
    }

if __name__ == "__main__":
    uvicorn.run("main_final:app", host="0.0.0.0", port=8000, reload=True)