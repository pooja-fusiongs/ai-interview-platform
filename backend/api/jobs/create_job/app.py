"""
Create Job Module
Handles job creation functionality
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import User
from schemas import JobCreate, JobResponse
from crud import create_job
from api.auth.jwt_handler import get_current_active_user

# Create router for job creation
router = APIRouter()

@router.post("/api/createJob", response_model=JobResponse)
def create_job_endpoint(
    job_data: JobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new job in YOUR database"""
    try:
        print(f"🔍 Creating job: {job_data.title} at {job_data.company}")
        print(f"👤 Created by user: {current_user.username} (ID: {current_user.id})")
        
        # Create new job
        new_job = create_job(db=db, job=job_data, user_id=current_user.id)
        
        print(f"✅ Job created in YOUR database: ID={new_job.id}")
        
        return new_job
        
    except Exception as e:
        print(f"❌ Error creating job: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create job: {str(e)}")

print("✅ Create Job module loaded")