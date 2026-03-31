"""
Create Job Module
Handles job creation functionality with optional JD file upload
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from typing import Optional
import os, json
from database import get_db
from models import User
from schemas import JobCreate, JobResponse
from crud import create_job
from api.auth.jwt_handler import get_current_active_user

router = APIRouter()

@router.post("/api/createJob", response_model=JobResponse)
async def create_job_endpoint(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new job. Accepts JSON body or multipart/form-data with optional JD file."""
    try:
        content_type = request.headers.get("content-type", "")
        description_file_path = None

        if "multipart/form-data" in content_type:
            # Multipart: form fields + optional file
            form = await request.form()
            job_dict = {}
            for key in ["title", "company", "description", "location", "job_type",
                         "experience_level", "salary_range", "skills_required",
                         "status", "interview_type"]:
                val = form.get(key)
                if val is not None:
                    job_dict[key] = str(val)

            if not job_dict.get("title"):
                raise HTTPException(status_code=400, detail="Job title is required")

            job_data = JobCreate(**job_dict)

            # Handle file upload
            uploaded_file = form.get("description_file")
            if uploaded_file and hasattr(uploaded_file, 'filename') and uploaded_file.filename:
                uploads_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "uploads", "job_descriptions")
                os.makedirs(uploads_dir, exist_ok=True)
                content = await uploaded_file.read()
                file_path = os.path.join(uploads_dir, f"jd_{current_user.id}_{uploaded_file.filename}")
                with open(file_path, "wb") as f:
                    f.write(content)
                description_file_path = file_path
        else:
            # JSON body
            body = await request.json()
            job_data = JobCreate(**body)

        new_job = create_job(db=db, job=job_data, user_id=current_user.id)

        # Save file path if uploaded
        if description_file_path:
            new_job.description_file_path = description_file_path
            db.commit()
            db.refresh(new_job)

        return new_job

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create job: {str(e)}")
