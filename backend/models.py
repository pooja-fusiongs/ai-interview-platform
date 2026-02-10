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
    
    # GDPR fields
    is_anonymized = Column(Boolean, default=False)
    anonymized_at = Column(DateTime(timezone=True), nullable=True)
    score = Column(Float, default=0)
    transcription = Column(Text, nullable=True)
    has_transcript = Column(Boolean, default=False)
    
    # Nested objects for questions and transcripts (JSON fields)
    interview_questions = Column(Text, nullable=True)  # JSON string of questions array
    interview_transcripts = Column(Text, nullable=True)  # JSON string of transcripts array

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
    
    # ATS fields
    ats_source = Column(String, nullable=True)
    ats_external_id = Column(String, nullable=True)

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

    # ATS fields
    ats_source = Column(String, nullable=True)
    ats_external_id = Column(String, nullable=True)

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

class InterviewQuestionVersion(Base):
    __tablename__ = "interview_question_versions"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("interview_questions.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    changed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())
    change_type = Column(String, nullable=False)  # "created", "edit", "approve", "reject"

    # Snapshot of all fields at this version
    question_text = Column(Text, nullable=False)
    sample_answer = Column(Text, nullable=True)
    question_type = Column(String, nullable=True)
    difficulty = Column(String, nullable=True)
    skill_focus = Column(String, nullable=True)
    is_approved = Column(Boolean, default=False)
    expert_notes = Column(Text, nullable=True)
    change_summary = Column(Text, nullable=True)

    # Relationships
    question = relationship("InterviewQuestion")
    changer = relationship("User")


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

    # Recruiter-driven flow fields
    application_id = Column(Integer, ForeignKey("job_applications.id"), nullable=True)
    transcript_text = Column(Text, nullable=True)
    interview_mode = Column(String, default="self_service")  # "self_service" or "recruiter_driven"

    # Relationships
    job = relationship("Job")
    candidate = relationship("User")
    application = relationship("JobApplication")
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


# ==================== GDPR Models ====================

class ConsentType(str, enum.Enum):
    INTERVIEW_DATA = "interview_data"
    VIDEO_RECORDING = "video_recording"
    BIOMETRIC_ANALYSIS = "biometric_analysis"
    DATA_PROCESSING = "data_processing"

class ConsentStatus(str, enum.Enum):
    GRANTED = "granted"
    REVOKED = "revoked"
    EXPIRED = "expired"

class ConsentRecord(Base):
    __tablename__ = "consent_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    consent_type = Column(Enum(ConsentType), nullable=False)
    status = Column(Enum(ConsentStatus), default=ConsentStatus.GRANTED)
    consent_text = Column(Text, nullable=False)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    granted_at = Column(DateTime(timezone=True), server_default=func.now())
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")

class DataRetentionPolicy(Base):
    __tablename__ = "data_retention_policies"

    id = Column(Integer, primary_key=True, index=True)
    data_category = Column(String, nullable=False, unique=True)
    retention_days = Column(Integer, nullable=False)
    auto_delete = Column(Boolean, default=True)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class DeletionRequest(Base):
    __tablename__ = "deletion_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    request_type = Column(String, nullable=False, default="full_erasure")
    data_categories = Column(Text, nullable=True)
    status = Column(String, default="pending")
    reason = Column(Text, nullable=True)
    processed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)
    completion_summary = Column(Text, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    processor = relationship("User", foreign_keys=[processed_by])

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)
    resource_type = Column(String, nullable=False)
    resource_id = Column(Integer, nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class DataExportRequest(Base):
    __tablename__ = "data_export_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending")
    export_format = Column(String, default="json")
    file_path = Column(String, nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    download_count = Column(Integer, default=0)

    user = relationship("User")


# ==================== ATS Models ====================

class ATSProvider(str, enum.Enum):
    GREENHOUSE = "greenhouse"
    LEVER = "lever"
    BAMBOOHR = "bamboohr"

class ATSSyncStatus(str, enum.Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

class ATSConnection(Base):
    __tablename__ = "ats_connections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider = Column(Enum(ATSProvider), nullable=False)
    api_key_encrypted = Column(String, nullable=False)
    api_base_url = Column(String, nullable=True)
    webhook_secret = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    sync_status = Column(Enum(ATSSyncStatus), default=ATSSyncStatus.PENDING)
    sync_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User")

class ATSSyncLog(Base):
    __tablename__ = "ats_sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    connection_id = Column(Integer, ForeignKey("ats_connections.id"), nullable=False)
    sync_type = Column(String, nullable=False)
    status = Column(Enum(ATSSyncStatus), nullable=False)
    records_synced = Column(Integer, default=0)
    records_failed = Column(Integer, default=0)
    error_details = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    connection = relationship("ATSConnection")

class ATSJobMapping(Base):
    __tablename__ = "ats_job_mappings"

    id = Column(Integer, primary_key=True, index=True)
    connection_id = Column(Integer, ForeignKey("ats_connections.id"), nullable=False)
    ats_job_id = Column(String, nullable=False)
    local_job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    ats_job_data = Column(Text, nullable=True)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    connection = relationship("ATSConnection")
    job = relationship("Job")

class ATSCandidateMapping(Base):
    __tablename__ = "ats_candidate_mappings"

    id = Column(Integer, primary_key=True, index=True)
    connection_id = Column(Integer, ForeignKey("ats_connections.id"), nullable=False)
    ats_candidate_id = Column(String, nullable=False)
    local_application_id = Column(Integer, ForeignKey("job_applications.id"), nullable=False)
    ats_candidate_data = Column(Text, nullable=True)
    resume_synced = Column(Boolean, default=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    connection = relationship("ATSConnection")
    application = relationship("JobApplication")


# ==================== Video Interview Models ====================

class VideoInterviewStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    WAITING = "waiting"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class VideoInterview(Base):
    __tablename__ = "video_interviews"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("interview_sessions.id"), nullable=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    interviewer_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    zoom_meeting_id = Column(String, nullable=True)
    zoom_meeting_url = Column(String, nullable=True)
    zoom_host_url = Column(String, nullable=True)
    zoom_passcode = Column(String, nullable=True)

    status = Column(Enum(VideoInterviewStatus), default=VideoInterviewStatus.SCHEDULED)
    scheduled_at = Column(DateTime(timezone=True), nullable=False)
    duration_minutes = Column(Integer, default=60)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    recording_url = Column(String, nullable=True)
    recording_consent = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    transcript = Column(Text, nullable=True)
    transcript_generated_at = Column(DateTime(timezone=True), nullable=True)
    transcript_source = Column(String, nullable=True)  # "recording", "upload", or "mock"

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    session = relationship("InterviewSession")
    job = relationship("Job")
    candidate = relationship("User", foreign_keys=[candidate_id])
    interviewer = relationship("User", foreign_keys=[interviewer_id])

class FraudAnalysis(Base):
    __tablename__ = "fraud_analyses"

    id = Column(Integer, primary_key=True, index=True)
    video_interview_id = Column(Integer, ForeignKey("video_interviews.id"), nullable=False)

    voice_consistency_score = Column(Float, nullable=True)
    voice_consistency_details = Column(Text, nullable=True)
    lip_sync_score = Column(Float, nullable=True)
    lip_sync_details = Column(Text, nullable=True)
    body_movement_score = Column(Float, nullable=True)
    body_movement_details = Column(Text, nullable=True)

    overall_trust_score = Column(Float, nullable=True)
    flags = Column(Text, nullable=True)
    flag_count = Column(Integer, default=0)

    analysis_status = Column(String, default="pending")
    consent_granted = Column(Boolean, default=False)
    consent_record_id = Column(Integer, ForeignKey("consent_records.id"), nullable=True)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    video_interview = relationship("VideoInterview")


# ==================== Post-Hire Feedback Models ====================

class FeedbackStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"

class PostHireFeedback(Base):
    __tablename__ = "post_hire_feedback"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("interview_sessions.id"), nullable=True)
    submitted_by = Column(Integer, ForeignKey("users.id"), nullable=False)

    hire_date = Column(DateTime(timezone=True), nullable=False)
    feedback_date = Column(DateTime(timezone=True), server_default=func.now())
    overall_performance_score = Column(Float, nullable=False)
    technical_competence_score = Column(Float, nullable=True)
    cultural_fit_score = Column(Float, nullable=True)
    communication_score = Column(Float, nullable=True)
    initiative_score = Column(Float, nullable=True)

    strengths_observed = Column(Text, nullable=True)
    areas_for_improvement = Column(Text, nullable=True)
    comments = Column(Text, nullable=True)

    still_employed = Column(Boolean, default=True)
    left_reason = Column(String, nullable=True)
    would_rehire = Column(Boolean, nullable=True)

    status = Column(Enum(FeedbackStatus), default=FeedbackStatus.SUBMITTED)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    candidate = relationship("User", foreign_keys=[candidate_id])
    job = relationship("Job")
    session = relationship("InterviewSession")
    submitter = relationship("User", foreign_keys=[submitted_by])

class QualityMetric(Base):
    __tablename__ = "quality_metrics"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=True)
    metric_type = Column(String, nullable=False)
    metric_value = Column(Float, nullable=False)
    sample_size = Column(Integer, nullable=False)
    time_period_start = Column(DateTime(timezone=True), nullable=True)
    time_period_end = Column(DateTime(timezone=True), nullable=True)
    details = Column(Text, nullable=True)
    computed_at = Column(DateTime(timezone=True), server_default=func.now())

    job = relationship("Job")