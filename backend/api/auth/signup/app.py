"""
User Signup API
Handles user registration functionality
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import User, UserRole
from schemas import UserCreate
from crud import get_user_by_username, get_user_by_email, create_user

router = APIRouter(tags=["Authentication - Signup"])

@router.post("/signup")
def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    print(f"📝 Signup request received for: {user_data.email}")
    
    try:
        # Check if user already exists
        existing_user = get_user_by_email(db, user_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        existing_username = get_user_by_username(db, user_data.username)
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        
        # Create new user
        new_user = create_user(db=db, user=user_data)
        print(f"✅ User created successfully: {new_user.username} (ID: {new_user.id})")
        
        return {
            "id": new_user.id,
            "username": new_user.username,
            "email": new_user.email,
            "company": new_user.company,
            "role": new_user.role.value,
            "is_active": new_user.is_active,
            "message": "User created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Signup error: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user account"
        )