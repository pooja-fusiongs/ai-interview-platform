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
from passlib.context import CryptContext
from dotenv import load_dotenv

from database import get_db
from models import User, UserRole
from schemas import TokenData

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

security = HTTPBearer()

# Bcrypt context for secure password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    """Verify password with backward compatibility for legacy hashes.
    Supports: bcrypt (new), SHA256 (legacy), simple hash (legacy).
    """
    # Try bcrypt first (new secure format)
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        return pwd_context.verify(plain_password, hashed_password)

    # Try SHA256 hash (legacy — for existing users before bcrypt migration)
    sha256_hash = hashlib.sha256(plain_password.encode()).hexdigest()
    if hashed_password == sha256_hash:
        return True

    # Try simple hash format (oldest legacy format)
    simple_hash = f"hashed_{plain_password}"
    if hashed_password == simple_hash:
        return True

    return False

def needs_password_upgrade(hashed_password):
    """Check if password hash needs upgrade to bcrypt."""
    return not (hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"))

def get_password_hash(password):
    """Create bcrypt hash of password (secure, salted)."""
    return pwd_context.hash(password)

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
    Get current user from database using token data.
    Uses user_id (primary key) for fast indexed lookup instead of username string scan.
    """
    user = None
    # Prefer lookup by id (primary key = instant) over username (string column)
    if token_data.user_id:
        user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None:
        # Fallback to username for old tokens that may not have user_id
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
    Activity tracking moved to dedicated /api/auth/activity endpoint to avoid
    adding a DB write (commit) on EVERY authenticated request.
    """
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
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