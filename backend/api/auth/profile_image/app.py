from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import os
import uuid
from datetime import datetime
import shutil

# Import from parent directories
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '../../..'))

from database import get_db
from models import User
from api.auth.app import get_current_active_user

router = APIRouter()

# Create uploads directory if it doesn't exist
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads/profile_images")
RESUME_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads/resumes")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(RESUME_UPLOAD_DIR, exist_ok=True)

@router.post("/api/candidate/profile/image")
async def upload_profile_image(
    profile_image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Upload and save profile image for current user"""
    try:
        # Validate file type
        if not profile_image.content_type.startswith('image/'):
            raise HTTPException(
                status_code=400,
                detail="File must be an image"
            )
        
        # Generate unique filename
        file_extension = profile_image.filename.split('.')[-1]
        unique_filename = f"{current_user.id}_{uuid.uuid4().hex[:8]}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        # Save file to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(profile_image.file, buffer)
        
        # Create URL for the image
        image_url = f"/uploads/profile_images/{unique_filename}"
        
        # Update user's profile image in database
        current_user.profile_image = image_url
        db.commit()
        
        return {
            "success": True,
            "message": "Profile image uploaded successfully",
            "image_url": image_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error uploading profile image: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload image: {str(e)}"
        )

@router.post("/api/candidate/profile/resume")
async def upload_profile_resume(
    resume: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Upload and save resume for current user's profile"""
    try:
        # Validate file type
        allowed_types = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        if resume.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail="File must be a PDF or Word document"
            )
        
        # Generate unique filename
        file_extension = resume.filename.split('.')[-1]
        unique_filename = f"{current_user.id}_resume_{uuid.uuid4().hex[:8]}.{file_extension}"
        file_path = os.path.join(RESUME_UPLOAD_DIR, unique_filename)
        
        # Save file to disk
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(resume.file, buffer)
        
        # Create URL for the resume
        resume_url = f"/uploads/resumes/{unique_filename}"
        
        # Update user's resume URL in database
        current_user.resume_url = resume_url
        db.commit()
        
        return {
            "success": True,
            "message": "Resume uploaded successfully",
            "resume_url": resume_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error uploading resume: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload resume: {str(e)}"
        )

@router.delete("/api/candidate/profile/resume")
async def delete_profile_resume(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete current user's profile resume"""
    try:
        if current_user.resume_url:
            # Remove file from disk if it exists
            filename = current_user.resume_url.split('/')[-1]
            file_path = os.path.join(RESUME_UPLOAD_DIR, filename)
            if os.path.exists(file_path):
                os.remove(file_path)
            
            # Remove from database
            current_user.resume_url = None
            db.commit()
        
        return {
            "success": True,
            "message": "Resume deleted successfully"
        }
        
    except Exception as e:
        print(f"❌ Error deleting resume: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete resume: {str(e)}"
        )

@router.delete("/api/candidate/profile/image")
async def delete_profile_image(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete current user's profile image"""
    try:
        if current_user.profile_image:
            # Remove file from disk if it exists
            filename = current_user.profile_image.split('/')[-1]
            file_path = os.path.join(UPLOAD_DIR, filename)
            if os.path.exists(file_path):
                os.remove(file_path)
            
            # Remove from database
            current_user.profile_image = None
            db.commit()
        
        return {
            "success": True,
            "message": "Profile image deleted successfully"
        }
        
    except Exception as e:
        print(f"❌ Error deleting profile image: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete image: {str(e)}"
        )