
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import os
import sys
import json

# Ensure root imports work when running as a module
sys.path.append(os.path.join(os.path.dirname(__file__), "../../.."))

from database import get_db
from models import User
from api.auth.app import get_current_active_user

router = APIRouter()


@router.get("/api/candidate/profile")
def get_candidate_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get current user's complete candidate profile (wrapped in success/data)."""
    try:
        # Parse JSON fields
        skills_list = []
        if current_user.skills:
            try:
                skills_list = json.loads(current_user.skills)
            except Exception:
                skills_list = []

        languages_list = []
        if current_user.languages:
            try:
                languages_list = json.loads(current_user.languages)
            except Exception:
                languages_list = []

        education_list = []
        if current_user.education:
            try:
                education_list = json.loads(current_user.education)
            except Exception:
                education_list = []

        professional_experience_list = []
        if current_user.professional_experience:
            try:
                professional_experience_list = json.loads(
                    current_user.professional_experience
                )
            except Exception:
                professional_experience_list = []

        certifications_list = []
        if current_user.certifications:
            try:
                certifications_list = json.loads(current_user.certifications)
            except Exception:
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
                "certifications": certifications_list,
            },
        }

    except Exception as e:
        print(f"❌ Error getting candidate profile: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}",
        )


@router.put("/api/candidate/profile")
def update_candidate_profile(
    profile_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update current user's complete candidate profile."""
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
            current_user.professional_experience = json.dumps(
                profile_data["professional_experience"]
            )
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
        print("🔍 Debug - Profile update committed to database")

        return {
            "success": True,
            "message": "Profile updated successfully",
        }

    except Exception as e:
        print(f"❌ Error updating candidate profile: {e}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}",
        )

