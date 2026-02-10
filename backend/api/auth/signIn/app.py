"""
User Signin API
Handles user authentication and login functionality
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from database import get_db
from models import User
from schemas import UserLogin, Token
from crud import authenticate_user
from api.auth.jwt_handler import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter(tags=["Authentication - Signin"])

@router.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token with role information"""
    print(f"🔐 Login request received for: {user_credentials.username}")
    
    try:
        user = authenticate_user(db, user_credentials.username, user_credentials.password)
        if not user:
            print(f"❌ Authentication failed for: {user_credentials.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        print(f"✅ Authentication successful for: {user.username}")
        
        # Update user online status and activity
        from datetime import datetime, timezone
        user.is_online = True
        user.last_login = datetime.now(timezone.utc)
        user.last_activity = datetime.now(timezone.utc)
        db.commit()
        print(f"🟢 Set user {user.username} as online")
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username, "role": user.role.value, "user_id": user.id},
            expires_delta=access_token_expires
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": user.role.value,
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "company": user.company,
                "role": user.role.value,
                "is_active": user.is_active
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Login error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during login"
        )