from sqlalchemy.orm import Session
from typing import List, Optional
from models import User, Job
from schemas import UserCreate, JobCreate, JobUpdate
import json
import hashlib

def get_password_hash(password: str) -> str:
    """Create SHA256 hash of password"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    # Try SHA256 hash first (for existing users)
    sha256_hash = hashlib.sha256(plain_password.encode()).hexdigest()
    if hashed_password == sha256_hash:
        return True
    
    # Try simple hash format (for backward compatibility)
    simple_hash = f"hashed_{plain_password}"
    if hashed_password == simple_hash:
        return True
    
    return False

def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()

def create_user(db: Session, user: UserCreate):
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        company=user.company,
        role=user.role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, username: str, password: str):
    """Authenticate user with enhanced debugging"""
    print(f"🔍 Login attempt - Username/Email: {username}")
    
    # Try to find user by username first
    user = get_user_by_username(db, username)
    
    # If not found by username, try by email
    if not user:
        user = get_user_by_email(db, username)
    
    if not user:
        print(f"❌ User not found: {username}")
        return False
    
    print(f"✅ User found: {user.username} (ID: {user.id})")
    print(f"🔐 Stored hash: {user.hashed_password[:20]}...")
    
    # Test different password combinations
    test_passwords = [
        password,  # Original password
        password.lower(),  # Lowercase
        password.upper(),  # Uppercase
        password.strip(),  # Remove whitespace
    ]
    
    for test_pwd in test_passwords:
        if verify_password(test_pwd, user.hashed_password):
            print(f"✅ Password verified with: '{test_pwd}'")
            return user
    
    print(f"❌ Password verification failed for all attempts")
    return False

# Job CRUD operations
def create_job(db: Session, job: JobCreate, user_id: int):
    # Convert skills list to JSON string if it's a list
    skills_json = job.skills_required
    if isinstance(job.skills_required, list):
        skills_json = json.dumps(job.skills_required)
    
    db_job = Job(
        title=job.title,
        description=job.description,
        company=job.company,
        location=job.location,
        salary_range=job.salary_range,
        job_type=job.job_type,
        work_mode=job.work_mode,
        experience_level=job.experience_level,
        department=job.department,
        skills_required=skills_json,
        number_of_openings=job.number_of_openings,
        interview_type=job.interview_type,
        number_of_questions=job.number_of_questions,
        application_deadline=job.application_deadline,
        resume_parsing_enabled=job.resume_parsing_enabled,
        question_generation_ready=job.question_generation_ready,
        expert_review_status=job.expert_review_status,
        created_by=user_id
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

def get_jobs(db: Session, skip: int = 0, limit: int = 100):
    return db.query(Job).filter(Job.is_active == True).offset(skip).limit(limit).all()

def get_job(db: Session, job_id: int):
    return db.query(Job).filter(Job.id == job_id, Job.is_active == True).first()

def get_jobs_by_user(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    return db.query(Job).filter(Job.created_by == user_id, Job.is_active == True).offset(skip).limit(limit).all()

def update_job(db: Session, job_id: int, job_update: JobUpdate, user_id: int):
    db_job = db.query(Job).filter(Job.id == job_id, Job.created_by == user_id).first()
    if not db_job:
        return None
    
    update_data = job_update.dict(exclude_unset=True)
    
    # Handle skills_required if it's a list
    if 'skills_required' in update_data and isinstance(update_data['skills_required'], list):
        update_data['skills_required'] = json.dumps(update_data['skills_required'])
    
    for field, value in update_data.items():
        setattr(db_job, field, value)
    
    db.commit()
    db.refresh(db_job)
    return db_job

def delete_job(db: Session, job_id: int, user_id: int):
    db_job = db.query(Job).filter(Job.id == job_id, Job.created_by == user_id).first()
    if not db_job:
        return None
    
    db_job.is_active = False
    db.commit()
    return db_job