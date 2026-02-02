#!/usr/bin/env python3
"""
FastAPI GET endpoint to fetch job data from PostgreSQL
"""

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
import sys
import os
from dotenv import load_dotenv

# Add parent directories to path to import models and database
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

from models import Job, User
from schemas import JobResponse
from database import get_db, engine

# Test database connection on startup
print("🔍 Testing database connection...")
try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT COUNT(*) FROM jobs"))
        count = result.fetchone()[0]
        print(f"✅ Database connected! Found {count} jobs in database")
except Exception as e:
    print(f"❌ Database connection failed: {e}")

# Create FastAPI app
app = FastAPI(
    title="Job View API",
    version="1.0.0",
    description="FastAPI endpoint to fetch job data from PostgreSQL"
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
        "message": "Job View API",
        "status": "running",
        "database": "PostgreSQL"
    }

@app.get("/api/jobs", response_model=List[JobResponse])
def get_all_jobs(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of records to return"),
    status: Optional[str] = Query(None, description="Filter by job status"),
    company: Optional[str] = Query(None, description="Filter by company name"),
    job_type: Optional[str] = Query(None, description="Filter by job type"),
    experience_level: Optional[str] = Query(None, description="Filter by experience level"),
    db: Session = Depends(get_db)
):
    """
    Fetch all jobs from PostgreSQL database with optional filtering
    
    - **skip**: Number of records to skip (pagination)
    - **limit**: Maximum number of records to return
    - **status**: Filter by job status (Open, Closed, Paused, etc.)
    - **company**: Filter by company name
    - **job_type**: Filter by job type (Full-time, Part-time, Contract)
    - **experience_level**: Filter by experience level
    """
    try:
        print(f"🔍 Fetching jobs with filters: status={status}, company={company}, job_type={job_type}, experience_level={experience_level}")
        
        # Build query with filters
        query = db.query(Job).filter(Job.is_active == True)
        
        # Debug: Check total count before filters
        total_count = db.query(Job).count()
        active_count = db.query(Job).filter(Job.is_active == True).count()
        print(f"📊 Total jobs in DB: {total_count}, Active jobs: {active_count}")
        
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
        
        print(f"✅ Found {len(jobs)} jobs matching criteria")
        
        # Debug: Print first job details
        if jobs:
            first_job = jobs[0]
            print(f"📝 First job: ID={first_job.id}, Title={first_job.title}, Active={first_job.is_active}")
        
        return jobs
        
    except Exception as e:
        print(f"❌ Error in get_all_jobs: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/api/jobs/{job_id}", response_model=JobResponse)
def get_job_by_id(job_id: int, db: Session = Depends(get_db)):
    """
    Fetch a specific job by ID from PostgreSQL database
    
    - **job_id**: The ID of the job to retrieve
    """
    try:
        job = db.query(Job).filter(
            Job.id == job_id,
            Job.is_active == True
        ).first()
        
        if not job:
            raise HTTPException(
                status_code=404,
                detail=f"Job with ID {job_id} not found"
            )
        
        return job
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/api/jobs/company/{company_name}", response_model=List[JobResponse])
def get_jobs_by_company(
    company_name: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """
    Fetch all jobs for a specific company
    
    - **company_name**: Name of the company
    - **skip**: Number of records to skip
    - **limit**: Maximum number of records to return
    """
    try:
        jobs = db.query(Job).filter(
            Job.company.ilike(f"%{company_name}%"),
            Job.is_active == True
        ).offset(skip).limit(limit).all()
        
        return jobs
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/api/jobs/search", response_model=List[JobResponse])
def search_jobs(
    q: str = Query(..., description="Search query for job title or description"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """
    Search jobs by title or description
    
    - **q**: Search query string
    - **skip**: Number of records to skip
    - **limit**: Maximum number of records to return
    """
    try:
        jobs = db.query(Job).filter(
            (Job.title.ilike(f"%{q}%") | Job.description.ilike(f"%{q}%")),
            Job.is_active == True
        ).offset(skip).limit(limit).all()
        
        return jobs
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/api/jobs/stats")
def get_job_stats(db: Session = Depends(get_db)):
    """
    Get job statistics from the database
    """
    try:
        total_jobs = db.query(Job).filter(Job.is_active == True).count()
        open_jobs = db.query(Job).filter(
            Job.status == "Open",
            Job.is_active == True
        ).count()
        
        # Get job counts by type
        job_types = db.query(Job.job_type, db.func.count(Job.id)).filter(
            Job.is_active == True
        ).group_by(Job.job_type).all()
        
        # Get job counts by experience level
        experience_levels = db.query(Job.experience_level, db.func.count(Job.id)).filter(
            Job.is_active == True
        ).group_by(Job.experience_level).all()
        
        return {
            "total_jobs": total_jobs,
            "open_jobs": open_jobs,
            "job_types": dict(job_types),
            "experience_levels": dict(experience_levels)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

@app.get("/debug/jobs")
def debug_jobs(db: Session = Depends(get_db)):
    """Debug endpoint to check jobs in database"""
    try:
        # Get all jobs without any filters
        all_jobs = db.query(Job).all()
        active_jobs = db.query(Job).filter(Job.is_active == True).all()
        
        return {
            "total_jobs": len(all_jobs),
            "active_jobs": len(active_jobs),
            "database_type": "PostgreSQL",
            "jobs": [
                {
                    "id": job.id,
                    "title": job.title,
                    "company": job.company,
                    "status": job.status,
                    "is_active": job.is_active,
                    "created_at": job.created_at.isoformat() if job.created_at else None
                }
                for job in all_jobs
            ]
        }
    except Exception as e:
        return {
            "error": str(e),
            "total_jobs": 0,
            "active_jobs": 0
        }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Job View API",
        "database": "PostgreSQL"
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Job View API")
    print("🌐 Server: http://localhost:8003")
    print("📚 API Docs: http://localhost:8003/docs")
    uvicorn.run("app:app", host="0.0.0.0", port=8003, reload=True)