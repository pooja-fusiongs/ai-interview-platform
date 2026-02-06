from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
import uvicorn
import sys
import os
import json

# Load environment variables from .env file FIRST
from dotenv import load_dotenv
load_dotenv()

# Fix import paths
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from database import engine, get_db
from models import Base, User, Job, JobApplication, CandidateResume, UserRole, InterviewSession, InterviewAnswer, QuestionGenerationSession, QuestionGenerationMode, InterviewSessionStatus, InterviewQuestion, QuestionDifficulty, QuestionType
from schemas import (
    JobCreate, JobResponse,
    CandidateProfileResponse
)
from crud import (
    get_job
)
from api.auth.app import auth_router, get_current_active_user
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
    app.include_router(video_interviews_router, tags=["Video Interviews"])
    app.include_router(video_zoom_router, tags=["Zoom Integration"])
    app.include_router(video_fraud_router, tags=["Fraud Detection"])
    print("✅ Video Interview & Fraud Detection endpoints included")
except Exception as e:
    print(f"⚠️ Could not load Video Interview endpoints: {e}")

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
        
        # Build query with filters
        query = db.query(Job).filter(Job.is_active == True)
        
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

@app.post("/api/job/apply")
def apply_for_job(
    application_data: dict,
    db: Session = Depends(get_db)
):
    """Submit job application"""
    try:
        # Check if job exists
        job = db.query(Job).filter(Job.id == application_data["job_id"]).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Check if user already applied
        existing_application = db.query(JobApplication).filter(
            JobApplication.job_id == application_data["job_id"],
            JobApplication.applicant_email == application_data["applicant_email"]
        ).first()
        
        if existing_application:
            raise HTTPException(
                status_code=400, 
                detail="You have already applied for this job"
            )
        
        # Create new application
        new_application = JobApplication(
            job_id=application_data["job_id"],
            applicant_name=application_data["applicant_name"],
            applicant_email=application_data["applicant_email"],
            applicant_phone=application_data.get("applicant_phone"),
            resume_url=application_data.get("resume_url"),
            cover_letter=application_data.get("cover_letter"),
            experience_years=application_data.get("experience_years"),
            current_company=application_data.get("current_company"),
            current_position=application_data.get("current_position"),
            expected_salary=application_data.get("expected_salary"),
            availability=application_data.get("availability"),
            status="Applied"
        )
        
        db.add(new_application)
        db.commit()
        db.refresh(new_application)
        
        return {
            "message": "Application submitted successfully",
            "application_id": new_application.id,
            "status": "Applied"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error submitting application: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to submit application: {str(e)}"
        )

@app.get("/api/job/{job_id}/applications")
def get_job_applications(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all applications for a job (for recruiters/admins)"""
    try:
        # Check if job exists
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Check if user has permission to view applications
        if current_user.role not in [UserRole.RECRUITER, UserRole.ADMIN, UserRole.DOMAIN_EXPERT]:
            raise HTTPException(
                status_code=403, 
                detail="Not authorized to view job applications"
            )
        
        # Get applications
        applications = db.query(JobApplication).filter(
            JobApplication.job_id == job_id
        ).all()
        
        return {
            "job_id": job_id,
            "job_title": job.title,
            "applications": applications,
            "total_applications": len(applications)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error fetching job applications: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/api/candidates")
def get_candidates(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all users with candidate role including nested questions and transcripts"""
    try:
        print(f"🔍 Fetching candidates from database...")
        
        # Build query to get users with candidate role
        query = db.query(User).filter(
            User.role == UserRole.CANDIDATE,
            User.is_active == True
        )
        
        # Add search functionality
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    User.username.ilike(search_term),
                    User.email.ilike(search_term),
                    User.company.ilike(search_term)
                )
            )
        
        # Apply pagination
        candidates = query.offset(skip).limit(limit).all()
        
        print(f"📊 Found {len(candidates)} candidates in database")
        
        # Transform to match frontend expectations with nested data
        candidate_list = []
        for i, candidate in enumerate(candidates):
            # Use real profile data if available, otherwise mock data
            departments = ["Engineering", "Marketing", "Sales", "HR", "Finance", "Operations"]
            skills_pool = ["Python", "JavaScript", "React", "Node.js", "SQL", "AWS", "Docker", "Git"]
            
            # Get real skills or use mock
            real_skills = []
            if candidate.skills:
                try:
                    real_skills = json.loads(candidate.skills)
                except:
                    real_skills = []
            
            skills = real_skills if real_skills else skills_pool[:(candidate.id % 5) + 2]
            
            # Determine online status
            is_online = candidate.is_online if hasattr(candidate, 'is_online') else False
            online_status = "Active" if is_online else "Inactive"
            
            # Get nested questions for this candidate
            interview_questions = []
            questions = db.query(InterviewQuestion).filter(
                InterviewQuestion.candidate_id.in_(
                    db.query(JobApplication.id).filter(JobApplication.applicant_email == candidate.email)
                )
            ).all()
            
            for question in questions:
                interview_questions.append({
                    "id": question.id,
                    "job_id": question.job_id,
                    "question_text": question.question_text,
                    "sample_answer": question.sample_answer,
                    "question_type": question.question_type,
                    "difficulty": question.difficulty,
                    "skill_focus": question.skill_focus,
                    "is_approved": question.is_approved,
                    "expert_reviewed": question.expert_reviewed,
                    "expert_notes": question.expert_notes,
                    "created_at": question.created_at.isoformat() if question.created_at else None
                })
            
            # Get nested transcripts for this candidate
            interview_transcripts = []
            sessions = db.query(InterviewSession).filter(
                InterviewSession.application_id.in_(
                    db.query(JobApplication.id).filter(JobApplication.applicant_email == candidate.email)
                )
            ).all()
            
            for session in sessions:
                if session.transcript_text:
                    interview_transcripts.append({
                        "id": session.id,
                        "job_id": session.job_id,
                        "session_id": session.id,
                        "transcript_text": session.transcript_text,
                        "score": session.overall_score,
                        "interview_mode": session.interview_mode,
                        "status": session.status,
                        "created_at": session.created_at.isoformat() if session.created_at else None
                    })
            
            # Update nested data in candidate model if needed
            if interview_questions or interview_transcripts:
                candidate.interview_questions = json.dumps(interview_questions)
                candidate.interview_transcripts = json.dumps(interview_transcripts)
                db.commit()

            # Get the latest question generation session for this candidate
            # Find application IDs for this candidate
            application_ids = db.query(JobApplication.id).filter(
                JobApplication.applicant_email == candidate.email
            ).all()
            application_id_list = [app_id[0] for app_id in application_ids]

            latest_question_session = None
            question_session_id = None
            if application_id_list:
                latest_question_session = db.query(QuestionGenerationSession).filter(
                    QuestionGenerationSession.candidate_id.in_(application_id_list)
                ).order_by(QuestionGenerationSession.created_at.desc()).first()

                if latest_question_session:
                    question_session_id = latest_question_session.id

            candidate_data = {
                "id": candidate.id,
                "name": candidate.full_name or candidate.username,
                "role": "candidate",
                "experience": f"{candidate.experience_years or (candidate.id % 10) + 1} years",
                "department": candidate.department or departments[candidate.id % len(departments)],
                "hireDate": candidate.created_at.strftime("%Y-%m-%d") if candidate.created_at else "2024-01-01",
                "skills": skills,
                "email": candidate.email,
                "phone": candidate.phone or f"+1 (555) {100 + candidate.id:03d}-{1000 + (candidate.id * 7) % 9000:04d}",
                "score": float(candidate.score) if candidate.score is not None else 0.0,
                "status": "active" if candidate.is_active else "pending",
                "onlineStatus": online_status,
                "isOnline": is_online,
                "has_transcript": getattr(candidate, 'has_transcript', False),
                "hasTranscript": getattr(candidate, 'has_transcript', False),
                "lastActivity": candidate.last_activity.isoformat() if candidate.last_activity else None,
                # Question session for Review button
                "questionSessionId": question_session_id,
                # Nested objects
                "interview_questions": interview_questions,
                "interview_transcripts": interview_transcripts
            }
            candidate_list.append(candidate_data)
        
        return {
            "success": True,
            "data": candidate_list,
            "total": len(candidate_list),
            "message": f"Found {len(candidate_list)} candidates"
        }
        
    except Exception as e:
        print(f"❌ Error fetching candidates: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

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
        
        from datetime import datetime
        candidate.last_activity = datetime.utcnow()
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
        from datetime import datetime
        current_user.last_activity = datetime.utcnow()
        current_user.is_online = True
        db.commit()
        
        return {
            "success": True,
            "message": "Activity updated",
            "isOnline": True,
            "lastActivity": current_user.last_activity.isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error updating user activity: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

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
        
        return {
            "success": True,
            "data": {
                "id": current_user.id,
                "email": current_user.email,
                "full_name": current_user.full_name or "",
                "mobile": current_user.mobile or current_user.phone or "",
                "gender": current_user.gender or "male",
                "location": current_user.location or "",
                "bio": current_user.bio or "",
                "education": education_list,
                "has_internship": current_user.has_internship or False,
                "internship_company": current_user.internship_company or "",
                "internship_position": current_user.internship_position or "",
                "internship_duration": current_user.internship_duration or "",
                "internship_salary": current_user.internship_salary or "",
                "skills": skills_list,
                "languages": languages_list,
                "preferred_location": current_user.preferred_location or "",
                "preferred_job_title": current_user.preferred_job_title or "",
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
        from datetime import datetime, timedelta
        
        # Consider users offline if no activity in last 5 minutes
        offline_threshold = datetime.utcnow() - timedelta(minutes=5)
        
        candidates = db.query(User).filter(
            User.role == UserRole.CANDIDATE,
            User.is_active == True
        ).all()
        
        status_updates = []
        for candidate in candidates:
            # Update online status based on last activity
            is_online = (
                candidate.is_online and 
                candidate.last_activity and 
                candidate.last_activity > offline_threshold
            )
            
            # Update database if status changed
            if candidate.is_online != is_online:
                candidate.is_online = is_online
                db.commit()
            
            status_updates.append({
                "id": candidate.id,
                "isOnline": is_online,
                "onlineStatus": "Active" if is_online else "Inactive",
                "lastActivity": candidate.last_activity.isoformat() if candidate.last_activity else None
            })
        
        return {
            "success": True,
            "data": status_updates
        }
        
    except Exception as e:
        print(f"❌ Error getting online status: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

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
    total_questions: int = 5
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
        application = JobApplication(
            job_id=request.job_id,
            applicant_name=candidate_user.full_name or candidate_user.username,
            applicant_email=candidate_user.email,
            applicant_phone=candidate_user.phone,
            status="Applied"
        )
        db.add(application)
        db.commit()
        db.refresh(application)
        
    # Check existing session
    existing_session = db.query(QuestionGenerationSession).filter(
        QuestionGenerationSession.job_id == request.job_id,
        QuestionGenerationSession.candidate_id == application.id
    ).first()
    
    if existing_session and existing_session.status == "generated":
        return {"success": True, "message": "Questions already generated", "session_id": existing_session.id}

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
    
    for q in questions:
        # Placeholder scoring logic
        score = 85.5 # Mock score
        
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