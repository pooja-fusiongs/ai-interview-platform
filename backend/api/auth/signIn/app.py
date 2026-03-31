"""
User Signin API
Handles user authentication and login functionality
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import timedelta
from collections import defaultdict
import time
from database import get_db
from models import User
from schemas import UserLogin, Token
from crud import authenticate_user
from api.auth.jwt_handler import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES

router = APIRouter(tags=["Authentication - Signin"])

# Simple in-memory rate limiter: max 5 failed attempts per IP per 15 min
_failed_attempts: dict = defaultdict(list)
MAX_ATTEMPTS = 5
WINDOW_SECONDS = 900  # 15 minutes

def _check_rate_limit(ip: str):
    now = time.time()
    # Clean old entries
    _failed_attempts[ip] = [t for t in _failed_attempts[ip] if now - t < WINDOW_SECONDS]
    if len(_failed_attempts[ip]) >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again in 15 minutes."
        )

def _record_failed_attempt(ip: str):
    _failed_attempts[ip].append(time.time())

def _clear_attempts(ip: str):
    _failed_attempts.pop(ip, None)

@router.post("/login", response_model=Token)
def login(user_credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    """Authenticate user and return JWT token with role information"""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    try:
        user = authenticate_user(db, user_credentials.username, user_credentials.password)
        if not user:
            _record_failed_attempt(client_ip)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        _clear_attempts(client_ip)
        
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