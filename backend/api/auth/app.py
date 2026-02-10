"""
Auth Module - Complete Authentication System
Combines signup, signin, and role-based functionality with organized structure
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import User, UserRole
from schemas import UserResponse, UserLogin
from api.auth.jwt_handler import (
    get_current_active_user, 
    ACCESS_TOKEN_EXPIRE_MINUTES,
    require_role,
    require_any_role,
    verify_password,
    get_password_hash
)
from api.auth.role_manager import RoleManager
from api.auth.signup.app import router as signup_router
from api.auth.signIn.app import router as signin_router
from api.auth.change_password.app import router as change_password_router

# Create main auth router with prefix
auth_router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Include separate signup, signin, and change password routers
auth_router.include_router(signup_router)
auth_router.include_router(signin_router)
auth_router.include_router(change_password_router)

# User info endpoint
@auth_router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_active_user)):
    """Get current user information"""
    return current_user

# Role endpoints
@auth_router.get("/roles")
def get_roles():
    """Get available user roles"""
    return {
        "roles": [
            {"value": "admin", "label": "Administrator"},
            {"value": "recruiter", "label": "Recruiter"},
            {"value": "domain_expert", "label": "Domain Expert"},
            {"value": "candidate", "label": "Candidate"}
        ]
    }

@auth_router.get("/validate-role/{role}")
def validate_role(role: str):
    """Validate if role exists"""
    valid_roles = ["admin", "recruiter", "domain_expert", "candidate"]
    return {
        "role": role,
        "valid": role in valid_roles
    }

# Test endpoints (for debugging)
@auth_router.post("/test-login")
def test_login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """Test endpoint to debug login issues"""
    print(f"🧪 Testing login for: {user_credentials.username}")
    
    # Check if user exists
    user = db.query(User).filter(
        (User.username == user_credentials.username) | 
        (User.email == user_credentials.username)
    ).first()
    
    if not user:
        return {
            "status": "user_not_found",
            "message": f"No user found with username/email: {user_credentials.username}",
            "available_users": [u.username for u in db.query(User).limit(5).all()]
        }
    
    # Test password
    password_match = verify_password(user_credentials.password, user.hashed_password)
    
    return {
        "status": "user_found",
        "username": user.username,
        "email": user.email,
        "password_match": password_match,
        "stored_hash": user.hashed_password[:20] + "...",
        "is_active": user.is_active,
        "role": user.role.value
    }

@auth_router.post("/reset-password")
def reset_password(email: str, new_password: str, db: Session = Depends(get_db)):
    """Reset password for testing - REMOVE IN PRODUCTION"""
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update password
    user.hashed_password = get_password_hash(new_password)
    db.commit()
    
    return {
        "message": f"Password reset for {email}",
        "new_hash": user.hashed_password[:20] + "..."
    }

@auth_router.get("/profile")
def get_user_profile(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get current user's profile data"""
    try:
        # Check if user has profile data
        profile_data = {
            "department": getattr(current_user, 'department', ''),
            "skills": getattr(current_user, 'skills', '').split(',') if getattr(current_user, 'skills', '') else [],
            "experience": getattr(current_user, 'experience', ''),
            "phone": getattr(current_user, 'phone', ''),
            "location": getattr(current_user, 'location', ''),
            "bio": getattr(current_user, 'bio', '')
        }
        
        return {
            "success": True,
            "data": profile_data
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e)
        }

@auth_router.post("/profile")
def update_user_profile(
    profile_data: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update current user's profile data"""
    try:
        # Update user profile fields
        if 'department' in profile_data:
            current_user.department = profile_data['department']
        if 'skills' in profile_data:
            current_user.skills = ','.join(profile_data['skills'])
        if 'experience' in profile_data:
            current_user.experience = profile_data['experience']
        if 'phone' in profile_data:
            current_user.phone = profile_data['phone']
        if 'location' in profile_data:
            current_user.location = profile_data['location']
        if 'bio' in profile_data:
            current_user.bio = profile_data['bio']
        
        db.commit()
        
        return {
            "success": True,
            "message": "Profile updated successfully"
        }
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "message": str(e)
        }

print("✅ Auth module loaded with folder structure (signup/, signIn/, and change_password/ folders)")

# Export commonly used functions for backward compatibility
__all__ = [
    "auth_router",
    "get_current_active_user", 
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "require_role",
    "require_any_role",
    "RoleManager"
]