from sqlalchemy import Column, Integer, String, DateTime, Boolean, Enum, Text, ForeignKey, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import enum

class UserRole(str, enum.Enum):
    RECRUITER = "recruiter"
    DOMAIN_EXPERT = "domain_expert"
    ADMIN = "admin"
    CANDIDATE = "candidate"

class JobStatus(str, enum.Enum):
    OPEN = "Open"
    CLOSED = "Closed"
    PAUSED = "Paused"
    INTERVIEW_IN_PROGRESS = "Interview In Progress"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    company = Column(String, nullable=True)
    role = Column(Enum(UserRole), default=UserRole.CANDIDATE)
    is_active = Column(Boolean, default=True)
    is_online = Column(Boolean, default=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    last_activity = Column(DateTime(timezone=True), nullable=True)
    
    # Profile fields
    full_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    department = Column(String, nullable=True)
    skills = Column(Text, nullable=True)  # JSON string
    experience_years = Column(Integer, nullable=True)
    current_position = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    
    # Extended profile fields for candidates
    mobile = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    location = Column(String, nullable=True)
    education = Column(Text, nullable=True)  # JSON string
    has_internship = Column(Boolean, default=False)
    internship_company = Column(String, nullable=True)
    internship_position = Column(String, nullable=True)
    internship_duration = Column(String, nullable=True)
    internship_salary = Column(String, nullable=True)
    languages = Column(Text, nullable=True)  # JSON string
    preferred_location = Column(String, nullable=True)
    preferred_job_title = Column(String, nullable=True)
    preferred_job_type = Column(String, nullable=True)
    profile_image = Column(String, nullable=True)
    resume_url = Column(String, nullable=True)
    professional_experience = Column(Text, nullable=True)  # JSON string
    certifications = Column(Text, nullable=True)  # JSON string
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship to jobs
    jobs = relationship("Job", back_populates="creator")

class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=False)
    company = Column(String, nullable=False)
    location = Column(String, nullable=False)
    salary_range = Column(String, nullable=True)
    job_type = Column(String, nullable=False)  # Full-time, Part-time, Contract
    work_mode = Column(String, nullable=False)  # Remote, Hybrid, On-site
    experience_level = Column(String, nullable=False)
    department = Column(String, nullable=False)
    skills_required = Column(Text, nullable=True)  # JSON string of skills array
    number_of_openings = Column(Integer, default=1)
    interview_type = Column(String, default="AI")  # AI, Manual, Both
    number_of_questions = Column(Integer, default=10)
    application_deadline = Column(DateTime, nullable=True)
    status = Column(String, default="Open")
    resume_parsing_enabled = Column(Boolean, default=True)
    question_generation_ready = Column(Boolean, default=True)
    expert_review_status = Column(String, default="pending")  # pending, completed
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    creator = relationship("User", back_populates="jobs")
    applications = relationship("JobApplication", back_populates="job")
    
class JobApplication(Base):
    __tablename__ = "job_applications"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    applicant_name = Column(String, nullable=False)
    applicant_email = Column(String, nullable=False)
    applicant_phone = Column(String, nullable=True)
    resume_url = Column(String, nullable=True)
    cover_letter = Column(Text, nullable=True)
    experience_years = Column(Integer, nullable=True)
    current_company = Column(String, nullable=True)
    current_position = Column(String, nullable=True)
    expected_salary = Column(String, nullable=True)
    availability = Column(String, nullable=True)  # Immediate, 2 weeks, 1 month, etc.
    status = Column(String, default="Applied")  # Applied, Reviewed, Interview, Rejected, Hired
    applied_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    job = relationship("Job", back_populates="applications")
    resume = relationship("CandidateResume", back_populates="application", uselist=False)

class ExperienceLevel(str, enum.Enum):
    JUNIOR = "Junior"
    MID = "Mid"
    SENIOR = "Senior"

class CandidateResume(Base):
    __tablename__ = "candidate_resumes"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("job_applications.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    resume_path = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_size = Column(Integer, nullable=True)
    skills = Column(Text, nullable=True)  # JSON string of extracted skills
    experience_years = Column(Integer, nullable=True)
    experience_level = Column(Enum(ExperienceLevel), nullable=True)
    parsed_text = Column(Text, nullable=True)  # Full extracted text
    parsing_status = Column(String, default="pending")  # pending, completed, failed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    application = relationship("JobApplication", back_populates="resume")
    job = relationship("Job")

class QuestionGenerationMode(str, enum.Enum):
    PREVIEW = "preview"  # Mock/rule-based generation
    LIVE = "live"       # OpenAI/Azure OpenAI API

class QuestionDifficulty(str, enum.Enum):
    BASIC = "basic"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"

class QuestionType(str, enum.Enum):
    CONCEPTUAL = "conceptual"
    SCENARIO = "scenario"
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"

class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("job_applications.id"), nullable=False)
    question_text = Column(Text, nullable=False)
    sample_answer = Column(Text, nullable=False)
    question_type = Column(Enum(QuestionType), nullable=False)
    difficulty = Column(Enum(QuestionDifficulty), nullable=False)
    skill_focus = Column(String, nullable=True)  # Primary skill this question tests
    generation_mode = Column(Enum(QuestionGenerationMode), default=QuestionGenerationMode.PREVIEW)
    is_approved = Column(Boolean, default=False)
    expert_reviewed = Column(Boolean, default=False)
    expert_notes = Column(Text, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    job = relationship("Job")
    candidate = relationship("JobApplication")
    reviewer = relationship("User")

class QuestionGenerationSession(Base):
    __tablename__ = "question_generation_sessions"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("job_applications.id"), nullable=False)
    generation_mode = Column(Enum(QuestionGenerationMode), default=QuestionGenerationMode.PREVIEW)
    total_questions = Column(Integer, default=10)
    approved_questions = Column(Integer, default=0)
    status = Column(String, default="pending")  # pending, generated, reviewed, approved
    generated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    generated_at = Column(DateTime, nullable=True)
    expert_review_status = Column(String, default="pending")  # pending, in_review, completed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    job = relationship("Job")
    candidate = relationship("JobApplication")
    generator = relationship("User")


class InterviewSessionStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SCORED = "scored"


class Recommendation(str, enum.Enum):
    SELECT = "select"
    NEXT_ROUND = "next_round"
    REJECT = "reject"


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(Enum(InterviewSessionStatus), default=InterviewSessionStatus.IN_PROGRESS)
    overall_score = Column(Float, nullable=True)
    recommendation = Column(Enum(Recommendation), nullable=True)
    strengths = Column(Text, nullable=True)
    weaknesses = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    job = relationship("Job")
    candidate = relationship("User")
    answers = relationship("InterviewAnswer", back_populates="session")


class InterviewAnswer(Base):
    __tablename__ = "interview_answers"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("interview_sessions.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("interview_questions.id"), nullable=False)
    answer_text = Column(Text, nullable=False)
    score = Column(Float, nullable=True)
    relevance_score = Column(Float, nullable=True)
    completeness_score = Column(Float, nullable=True)
    accuracy_score = Column(Float, nullable=True)
    clarity_score = Column(Float, nullable=True)
    feedback = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    session = relationship("InterviewSession", back_populates="answers")
    question = relationship("InterviewQuestion")