"""
JWT Token Handler - Refactored from auth/app.py
Handles JWT token creation, validation, and user authentication
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import os
import hashlib
from dotenv import load_dotenv

from database import get_db
from models import User, UserRole
from schemas import TokenData

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

security = HTTPBearer()

def verify_password(plain_password, hashed_password):
    """Enhanced password verification with backward compatibility"""
    # Try SHA256 hash first (for existing users)
    sha256_hash = hashlib.sha256(plain_password.encode()).hexdigest()
    if hashed_password == sha256_hash:
        return True
    
    # Try simple hash format (for backward compatibility)
    simple_hash = f"hashed_{plain_password}"
    if hashed_password == simple_hash:
        return True
    
    return False

def get_password_hash(password):
    """Create SHA256 hash of password"""
    return hashlib.sha256(password.encode()).hexdigest()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Create JWT access token with user data and role information
    
    - **data**: Token payload (should include sub, role, user_id, email)
    - **expires_delta**: Token expiration time
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify JWT token and extract user information
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        role: str = payload.get("role")
        user_id: int = payload.get("user_id")
        
        if username is None:
            raise credentials_exception
            
        token_data = TokenData(
            username=username,
            role=role,
            user_id=user_id
        )
    except JWTError:
        raise credentials_exception
    return token_data

def get_current_user(token_data: TokenData = Depends(verify_token), db: Session = Depends(get_db)):
    """
    Get current user from database using token data
    """
    user = db.query(User).filter(User.username == token_data.username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

def get_current_active_user(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Get current active user (role-based access ready).
    Also updates last_activity so online status stays accurate.
    """
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # Auto-update activity: only write to DB if stale (>2 min)
    try:
        now = datetime.utcnow()
        if not current_user.last_activity or (now - current_user.last_activity).total_seconds() > 120:
            current_user.last_activity = now
            current_user.is_online = True
            db.commit()
    except Exception:
        pass  # Non-critical, don't break the request

    return current_user

def require_role(required_role: UserRole):
    """
    Dependency factory for role-based access control

    Usage: @app.get("/admin-only", dependencies=[Depends(require_role(UserRole.ADMIN))])
    """
    def role_checker(current_user: User = Depends(get_current_active_user)):
        if current_user.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {required_role.value}, Your role: {current_user.role.value}"
            )
        return current_user
    return role_checker

def require_any_role(allowed_roles: list[UserRole]):
    """
    Dependency factory for multiple role access control
    
    Usage: @app.get("/multi-role", dependencies=[Depends(require_any_role([UserRole.ADMIN, UserRole.RECRUITER]))])
    """
    def role_checker(current_user: User = Depends(get_current_active_user)):
        if current_user.role not in allowed_roles:
            allowed_role_names = [role.value for role in allowed_roles]
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {allowed_role_names}, Your role: {current_user.role.value}"
            )
        return current_user
    return role_checker