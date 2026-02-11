from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from models import UserRole, JobStatus

class UserBase(BaseModel):
    username: str
    email: EmailStr
    company: Optional[str] = None
    role: UserRole = UserRole.CANDIDATE

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class User(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None
    user_id: Optional[int] = None

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    company: Optional[str] = None
    role: UserRole
    is_active: bool

    class Config:
        from_attributes = True

# Job Schemas
class JobBase(BaseModel):
    title: str
    description: str
    company: str
    location: str
    salary_range: Optional[str] = None
    job_type: str
    work_mode: str
    experience_level: str
    department: str
    skills_required: Optional[str] = None
    number_of_openings: int = 1
    interview_type: str = "AI"
    number_of_questions: int = 10
    application_deadline: Optional[datetime] = None
    resume_parsing_enabled: bool = True
    question_generation_ready: bool = True
    expert_review_status: str = "pending"

class JobCreate(JobBase):
    pass

class JobUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    job_type: Optional[str] = None
    work_mode: Optional[str] = None
    experience_level: Optional[str] = None
    department: Optional[str] = None
    skills_required: Optional[str] = None
    number_of_openings: Optional[int] = None
    interview_type: Optional[str] = None
    number_of_questions: Optional[int] = None
    application_deadline: Optional[datetime] = None
    status: Optional[str] = None
    resume_parsing_enabled: Optional[bool] = None
    question_generation_ready: Optional[bool] = None
    expert_review_status: Optional[str] = None

class JobResponse(JobBase):
    id: int
    status: str
    created_by: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    application_count: int = 0

    class Config:
        from_attributes = True

# Profile Schemas
class EducationData(BaseModel):
    degree: str
    institution: str
    year: str
    grade: Optional[str] = None

class ProfessionalExperience(BaseModel):
    position: str
    company: str
    duration: str
    description: Optional[str] = None

class Certification(BaseModel):
    name: str
    issuer: str
    date: str
    credential_id: Optional[str] = None

class CandidateProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    gender: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    education: Optional[List[EducationData]] = None
    has_internship: Optional[bool] = None
    internship_company: Optional[str] = None
    internship_position: Optional[str] = None
    internship_duration: Optional[str] = None
    internship_salary: Optional[str] = None
    skills: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    preferred_location: Optional[str] = None
    preferred_job_title: Optional[str] = None
    preferred_job_type: Optional[str] = None
    profile_image: Optional[str] = None
    resume_url: Optional[str] = None
    professional_experience: Optional[List[ProfessionalExperience]] = None
    certifications: Optional[List[Certification]] = None

# Nested objects for candidate data
class InterviewQuestionNested(BaseModel):
    id: int
    job_id: int
    question_text: str
    sample_answer: str
    question_type: str
    difficulty: str
    skill_focus: Optional[str] = None
    is_approved: bool = False
    expert_reviewed: bool = False
    expert_notes: Optional[str] = None
    created_at: datetime

class InterviewTranscriptNested(BaseModel):
    id: int
    job_id: int
    session_id: int
    transcript_text: str
    score: Optional[float] = None
    interview_mode: str
    status: str
    created_at: datetime

class CandidateProfileResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    gender: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    education: List[EducationData] = []
    has_internship: bool = False
    internship_company: Optional[str] = None
    internship_position: Optional[str] = None
    internship_duration: Optional[str] = None
    internship_salary: Optional[str] = None
    skills: List[str] = []
    languages: List[str] = []
    preferred_location: Optional[str] = None
    preferred_job_title: Optional[str] = None
    preferred_job_type: Optional[str] = None
    profile_image: Optional[str] = None
    resume_url: Optional[str] = None
    professional_experience: List[ProfessionalExperience] = []
    certifications: List[Certification] = []
    # Nested objects
    interview_questions: List[InterviewQuestionNested] = []
    interview_transcripts: List[InterviewTranscriptNested] = []
    score: Optional[float] = None
    has_transcript: bool = False

    class Config:
        from_attributes = True

# Job Application Schemas
class JobApplicationBase(BaseModel):
    job_id: int
    applicant_name: str
    applicant_email: str
    applicant_phone: Optional[str] = None
    resume_url: Optional[str] = None
    cover_letter: Optional[str] = None
    experience_years: Optional[int] = None
    current_company: Optional[str] = None
    current_position: Optional[str] = None
    expected_salary: Optional[str] = None
    availability: Optional[str] = None

class JobApplicationCreate(JobApplicationBase):
    pass

class JobApplicationResponse(JobApplicationBase):
    id: int
    status: str
    applied_at: datetime

    class Config:
        from_attributes = True

# Resume Schemas
class ResumeUploadResponse(BaseModel):
    message: str
    resume_id: int
    file_path: str
    original_filename: str

class ResumeParseResponse(BaseModel):
    skills: List[str]
    total_experience_years: int
    experience_level: str
    parsing_status: str

class ResumeDetailsResponse(BaseModel):
    id: int
    candidate_id: int
    job_id: int
    original_filename: str
    file_size: Optional[int]
    skills: Optional[List[str]]
    experience_years: Optional[int]
    experience_level: Optional[str]
    parsing_status: str
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

# Question Generation Schemas
class QuestionGenerateRequest(BaseModel):
    job_id: int
    candidate_id: int
    generation_mode: str = "preview"
    total_questions: int = 10

class InterviewQuestionBase(BaseModel):
    question_text: str
    sample_answer: str
    question_type: str
    difficulty: str
    skill_focus: Optional[str] = None

class InterviewQuestionCreate(InterviewQuestionBase):
    job_id: int
    candidate_id: int
    generation_mode: str = "preview"

class InterviewQuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    sample_answer: Optional[str] = None
    question_type: Optional[str] = None
    difficulty: Optional[str] = None
    skill_focus: Optional[str] = None
    is_approved: Optional[bool] = None
    expert_notes: Optional[str] = None

class InterviewQuestionResponse(InterviewQuestionBase):
    id: int
    job_id: int
    candidate_id: int
    generation_mode: str
    is_approved: bool
    expert_reviewed: bool
    expert_notes: Optional[str] = None
    reviewed_by: Optional[int] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class QuestionGenerationSessionResponse(BaseModel):
    id: int
    job_id: int
    candidate_id: int
    generation_mode: str
    total_questions: int
    approved_questions: int
    status: str
    expert_review_status: str
    generated_at: Optional[datetime] = None
    created_at: datetime
    questions: List[InterviewQuestionResponse] = []

    class Config:
        from_attributes = True

class ExpertReviewRequest(BaseModel):
    question_id: int
    is_approved: bool
    expert_notes: Optional[str] = None
    updated_question: Optional[str] = None
    updated_answer: Optional[str] = None

# Question Version History Schemas
class InterviewQuestionVersionResponse(BaseModel):
    id: int
    question_id: int
    version_number: int
    changed_by: Optional[int] = None
    changer_name: Optional[str] = None
    changed_at: Optional[datetime] = None
    change_type: str
    question_text: str
    sample_answer: Optional[str] = None
    question_type: Optional[str] = None
    difficulty: Optional[str] = None
    skill_focus: Optional[str] = None
    is_approved: bool = False
    expert_notes: Optional[str] = None
    change_summary: Optional[str] = None

    class Config:
        from_attributes = True

# Interview Session Schemas
class InterviewSessionCreate(BaseModel):
    job_id: int

class InterviewAnswerSubmit(BaseModel):
    question_id: int
    answer_text: str

class InterviewAnswerResponse(BaseModel):
    id: int
    session_id: int
    question_id: int
    answer_text: str
    score: Optional[float] = None
    relevance_score: Optional[float] = None
    completeness_score: Optional[float] = None
    accuracy_score: Optional[float] = None
    clarity_score: Optional[float] = None
    feedback: Optional[str] = None
    question_text: Optional[str] = None
    sample_answer: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class InterviewSessionResponse(BaseModel):
    id: int
    job_id: int
    candidate_id: int
    status: str
    overall_score: Optional[float] = None
    recommendation: Optional[str] = None
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    job_title: Optional[str] = None
    candidate_name: Optional[str] = None
    answers: List[InterviewAnswerResponse] = []

    class Config:
        from_attributes = True

class InterviewSessionListResponse(BaseModel):
    id: int
    job_id: int
    candidate_id: int
    status: str
    overall_score: Optional[float] = None
    recommendation: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    job_title: Optional[str] = None
    candidate_name: Optional[str] = None
    total_questions: int = 0
    answered_questions: int = 0

    class Config:
        from_attributes = True


# Recruiter Flow Schemas
class TranscriptSubmit(BaseModel):
    transcript_text: str

class RecruiterCandidateResponse(BaseModel):
    id: int
    applicant_name: str
    applicant_email: str
    applicant_phone: Optional[str] = None
    experience_years: Optional[int] = None
    current_position: Optional[str] = None
    status: str
    applied_at: datetime
    has_resume: bool = False
    resume_parsed: bool = False
    parsed_skills: List[str] = []
    has_questions: bool = False
    questions_status: str = "none"
    question_session_id: Optional[int] = None
    has_transcript: bool = False
    has_scores: bool = False
    overall_score: Optional[float] = None
    recommendation: Optional[str] = None
    session_id: Optional[int] = None

    class Config:
        from_attributes = True


# ==================== GDPR Schemas ====================

class ConsentCreate(BaseModel):
    consent_type: str
    consent_text: str

class ConsentResponse(BaseModel):
    id: int
    user_id: int
    consent_type: str
    status: str
    consent_text: str
    granted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ConsentStatusCheck(BaseModel):
    consent_type: str
    is_granted: bool
    granted_at: Optional[datetime] = None

class DeletionRequestCreate(BaseModel):
    request_type: str = "full_erasure"
    data_categories: Optional[List[str]] = None
    reason: Optional[str] = None

class DeletionRequestResponse(BaseModel):
    id: int
    user_id: int
    request_type: str
    status: str
    reason: Optional[str] = None
    requested_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None
    completion_summary: Optional[str] = None

    class Config:
        from_attributes = True

class DataRetentionPolicyCreate(BaseModel):
    data_category: str
    retention_days: int
    auto_delete: bool = True
    description: Optional[str] = None

class DataRetentionPolicyResponse(BaseModel):
    id: int
    data_category: str
    retention_days: int
    auto_delete: bool
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    resource_type: str
    resource_id: Optional[int] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class DataExportRequestCreate(BaseModel):
    export_format: str = "json"

class DataExportRequestResponse(BaseModel):
    id: int
    user_id: int
    status: str
    export_format: str
    requested_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class PrivacyNoticeResponse(BaseModel):
    version: str
    effective_date: str
    content: str
    data_categories: List[str]
    retention_summary: dict


# ==================== ATS Schemas ====================

class ATSConnectionCreate(BaseModel):
    provider: str
    api_key: str
    api_base_url: Optional[str] = None

class ATSConnectionResponse(BaseModel):
    id: int
    provider: str
    is_active: bool
    last_sync_at: Optional[datetime] = None
    sync_status: str
    sync_error: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ATSConnectionUpdate(BaseModel):
    api_key: Optional[str] = None
    api_base_url: Optional[str] = None
    is_active: Optional[bool] = None

class ATSSyncTrigger(BaseModel):
    sync_type: str = "full"

class ATSSyncLogResponse(BaseModel):
    id: int
    connection_id: int
    sync_type: str
    status: str
    records_synced: int
    records_failed: int
    error_details: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ATSJobMappingResponse(BaseModel):
    id: int
    ats_job_id: str
    local_job_id: int
    last_synced_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ATSCandidateMappingResponse(BaseModel):
    id: int
    ats_candidate_id: str
    local_application_id: int
    resume_synced: bool
    last_synced_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==================== Video Interview Schemas ====================

class VideoInterviewCreate(BaseModel):
    session_id: Optional[int] = None
    job_id: int
    candidate_id: int
    interviewer_id: Optional[int] = None
    scheduled_at: datetime
    duration_minutes: int = 60

class VideoInterviewResponse(BaseModel):
    id: int
    session_id: Optional[int] = None
    job_id: int
    candidate_id: int
    interviewer_id: Optional[int] = None
    zoom_meeting_url: Optional[str] = None
    zoom_passcode: Optional[str] = None
    status: str
    scheduled_at: Optional[datetime] = None
    duration_minutes: int = 60
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    recording_consent: bool = False
    recording_url: Optional[str] = None
    candidate_name: Optional[str] = None
    interviewer_name: Optional[str] = None
    job_title: Optional[str] = None
    transcript: Optional[str] = None
    transcript_generated_at: Optional[datetime] = None
    interview_type: Optional[str] = "Both"  # AI, Manual, Both - from job settings
    # Score fields (from InterviewSession)
    overall_score: Optional[float] = None
    recommendation: Optional[str] = None
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    per_question_scores: Optional[List[dict]] = None
    interview_session_id: Optional[int] = None  # ID to navigate to Results page
    questions_approved: bool = True

    class Config:
        from_attributes = True

class VideoInterviewUpdate(BaseModel):
    status: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None

class VideoInterviewListResponse(BaseModel):
    id: int
    job_title: str
    candidate_name: str
    status: str
    scheduled_at: Optional[datetime] = None
    duration_minutes: int = 60
    has_fraud_analysis: bool = False
    flag_count: int = 0
    overall_trust_score: Optional[float] = None

    class Config:
        from_attributes = True

class FraudAnalysisResponse(BaseModel):
    id: int
    video_interview_id: int
    voice_consistency_score: Optional[float] = None
    voice_consistency_details: Optional[str] = None
    lip_sync_score: Optional[float] = None
    lip_sync_details: Optional[str] = None
    body_movement_score: Optional[float] = None
    body_movement_details: Optional[str] = None
    overall_trust_score: Optional[float] = None
    flags: Optional[str] = None
    flag_count: int = 0
    analysis_status: str = "pending"
    consent_granted: bool = False
    analyzed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class FraudDashboardStats(BaseModel):
    total_interviews: int
    analyzed_count: int
    flagged_count: int
    cleared_count: int
    average_trust_score: float
    flag_breakdown: dict


# ==================== Post-Hire Feedback Schemas ====================

class PostHireFeedbackCreate(BaseModel):
    candidate_id: int
    job_id: int
    session_id: Optional[int] = None
    hire_date: datetime
    overall_performance_score: float
    technical_competence_score: Optional[float] = None
    cultural_fit_score: Optional[float] = None
    communication_score: Optional[float] = None
    initiative_score: Optional[float] = None
    strengths_observed: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    comments: Optional[str] = None
    still_employed: bool = True
    left_reason: Optional[str] = None
    would_rehire: Optional[bool] = None

class PostHireFeedbackResponse(BaseModel):
    id: int
    candidate_id: int
    job_id: int
    session_id: Optional[int] = None
    submitted_by: int
    hire_date: Optional[datetime] = None
    feedback_date: Optional[datetime] = None
    overall_performance_score: float
    technical_competence_score: Optional[float] = None
    cultural_fit_score: Optional[float] = None
    communication_score: Optional[float] = None
    initiative_score: Optional[float] = None
    strengths_observed: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    comments: Optional[str] = None
    still_employed: bool = True
    left_reason: Optional[str] = None
    would_rehire: Optional[bool] = None
    candidate_name: Optional[str] = None
    job_title: Optional[str] = None
    submitter_name: Optional[str] = None

    class Config:
        from_attributes = True

class PostHireFeedbackUpdate(BaseModel):
    overall_performance_score: Optional[float] = None
    technical_competence_score: Optional[float] = None
    cultural_fit_score: Optional[float] = None
    communication_score: Optional[float] = None
    initiative_score: Optional[float] = None
    strengths_observed: Optional[str] = None
    areas_for_improvement: Optional[str] = None
    comments: Optional[str] = None
    still_employed: Optional[bool] = None
    left_reason: Optional[str] = None
    would_rehire: Optional[bool] = None

class QualityMetricResponse(BaseModel):
    id: int
    job_id: Optional[int] = None
    metric_type: str
    metric_value: float
    sample_size: int
    time_period_start: Optional[datetime] = None
    time_period_end: Optional[datetime] = None
    details: Optional[str] = None
    computed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class QualityDashboardResponse(BaseModel):
    overall_prediction_accuracy: float
    score_performance_correlation: float
    total_hires_tracked: int
    hire_success_rate: float
    average_performance_by_recommendation: dict
    metrics_over_time: List[dict]
