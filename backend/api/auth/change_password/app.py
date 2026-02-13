"""
Change Password Module
Handles password change functionality for authenticated users
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import User
from api.auth.jwt_handler import (
    get_current_active_user,
    verify_password,
    get_password_hash
)

# Create router for change password
router = APIRouter()

@router.post("/change-password")
def change_password(
    password_data: dict,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Change current user's password"""
    try:
        old_password = password_data.get("old_password")
        new_password = password_data.get("new_password")
        
        if not old_password or not new_password:
            raise HTTPException(
                status_code=400,
                detail="Both old and new passwords are required"
            )
        
        # Verify old password
        if not verify_password(old_password, current_user.hashed_password):
            raise HTTPException(
                status_code=400,
                detail="Current password is incorrect"
            )
        
        # Validate new password (basic validation)
        if len(new_password) < 6:
            raise HTTPException(
                status_code=400,
                detail="New password must be at least 6 characters long"
            )
        
        # Update password
        current_user.hashed_password = get_password_hash(new_password)
        db.commit()
        
        return {
            "success": True,
            "message": "Password changed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to change password: {str(e)}"
        )

print("✅ Change Password module loaded")