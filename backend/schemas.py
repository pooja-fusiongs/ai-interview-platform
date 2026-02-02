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
    created_at: datetime

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
    started_at: datetime
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
    started_at: datetime
    completed_at: Optional[datetime] = None
    job_title: Optional[str] = None
    candidate_name: Optional[str] = None
    total_questions: int = 0
    answered_questions: int = 0

    class Config:
        from_attributes = True
