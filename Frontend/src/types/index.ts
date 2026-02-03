// Common types for the AI Interview Platform

export type UserRole = 'recruiter' | 'domain_expert' | 'admin' | 'candidate';

export interface User {
  id: string;
  username: string;
  email?: string;
  name?: string;
  company?: string;
  role?: UserRole;
}

export interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  signup: (userData: SignupData) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  demoLogin: () => Promise<{ success: boolean }>;
  loading: boolean;
}

export interface SignupData {
  username: string;
  email: string;
  password: string;
  company?: string;
  role?: UserRole;
}

// Role-based access control types
export interface RolePermissions {
  canViewDashboard: boolean;
  canCreateJob: boolean;
  canViewJobs: boolean;
  canViewCandidates: boolean;
  canManageUsers: boolean;
  canEvaluateJobs: boolean;
  canApplyJobs: boolean;
  canViewProfile: boolean;
}

export interface RouteAccess {
  path: string;
  allowedRoles: UserRole[];
  label: string;
  icon: string;
}

export interface Job {
  id: number;
  title: string;
  company: string;
  salary: string;
  postedTime: string;
  type: string;
  location: string;
  status: 'Open' | 'Interview In Progress' | 'Closed' | 'Paused';
  appliedCount: number;
  interviewPending: number;
  selected: number;
  rejected: number;
  experienceLevel: string;
  numberOfQuestions: number;
  interviewType: string;
  resumeParsingEnabled: boolean;
  questionGenerationReady: boolean;
  expertReviewStatus: 'pending' | 'completed';
  description: string;
  fullDescription?: string;
  requirements?: string[];
  responsibilities?: string[];
  benefits?: string[];
  icon: string;
  color: string;
}

// API Job types
export interface ApiJob {
  id: number;
  title: string;
  description: string;
  company: string;
  location: string;
  salary_range?: string;
  job_type: string;
  experience_level: string;
  skills_required?: string;
  created_by: number;
  is_active: boolean;
  created_at: string;
}

export interface JobCreate {
  title: string;
  description: string;
  company: string;
  location: string;
  salary_range?: string;
  job_type: string;
  experience_level: string;
  skills_required?: string;
}

// Nested objects for candidate data
export interface InterviewQuestion {
  id: number;
  job_id: number;
  question_text: string;
  sample_answer: string;
  question_type: string;
  difficulty: string;
  skill_focus?: string;
  is_approved: boolean;
  expert_reviewed: boolean;
  expert_notes?: string;
  created_at?: string;
}

export interface InterviewTranscript {
  id: number;
  job_id: number;
  session_id: number;
  transcript_text: string;
  score?: number;
  interview_mode: string;
  status: string;
  created_at?: string;
}

export interface Candidate {
  id: number;
  name: string;
  role: string;
  experience: string;
  department: string;
  hireDate: string;
  skills: string[];
  email: string;
  phone: string;
  score: number;
  status: 'active' | 'pending';
  onlineStatus?: 'Active' | 'Inactive';
  isOnline?: boolean;
  lastActivity?: string;
  hasTranscript?: boolean;
  // Nested objects
  interview_questions?: InterviewQuestion[];
  interview_transcripts?: InterviewTranscript[];
}

export interface JobFormData {
  title: string;
  department: string;
  experienceRequired: string;
  employmentType: string;
  location: string;
  workMode: string;
  jobSummary: string;
  requiredSkills: string[];
  numberOfOpenings: number;
  interviewType: string;
  applicationDeadline: string;
  salary: string;
  experienceLevel: string;
  numberOfQuestions: number;
  resumeParsingEnabled: boolean;
  questionGenerationReady: boolean;
  expertReviewStatus: 'pending' | 'completed';
}

export interface ApplicationFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  experience: string;
  currentSalary: string;
  expectedSalary: string;
  noticePeriod: string;
  coverLetter: string;
  resume: File | null;
  portfolio: string;
  linkedin: string;
  github: string;
  agreeTerms: boolean;
}

export interface CandidateFilters {
  statuses: { [key: string]: boolean };
  departments: { [key: string]: boolean };
  minScore: number;
}

export interface ProfileData {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  phone?: string;
  gender?: string;
  bio?: string;
  role: string;
  profile_photo?: string;
}

export interface EducationData {
  degree: string;
  institution: string;
  year: string;
  grade?: string;
}

export interface ProfessionalExperience {
  position: string;
  company: string;
  duration: string;
  description?: string;
}

export interface Certification {
  name: string;
  issuer: string;
  date: string;
  credential_id?: string;
}

export interface CandidateProfileData {
  id: number;
  email: string;
  full_name: string;
  mobile: string;
  gender: 'male' | 'female' | 'other';
  location: string;
  bio?: string;
  education: EducationData[];
  has_internship: boolean;
  internship_company?: string;
  internship_position?: string;
  internship_duration?: string;
  internship_salary?: string;
  skills: string[];
  languages: string[];
  preferred_location: string;
  preferred_job_title: string;
  preferred_job_type: 'full-time' | 'part-time' | 'contract' | 'internship';
  profile_image?: string;
  resume_url?: string;
  professional_experience?: ProfessionalExperience[];
  certifications?: Certification[];
  // Nested objects
  interview_questions?: InterviewQuestion[];
  interview_transcripts?: InterviewTranscript[];
}

// ===== GDPR Types =====

export type ConsentType = 'data_processing' | 'interview_recording' | 'ai_analysis' | 'data_sharing' | 'marketing';
export type ConsentStatus = 'granted' | 'revoked' | 'expired';

export interface ConsentRecord {
  id: number;
  user_id: number;
  consent_type: ConsentType;
  status: ConsentStatus;
  consent_text: string;
  ip_address?: string;
  granted_at: string;
  revoked_at?: string;
  expires_at?: string;
}

export interface DeletionRequest {
  id: number;
  user_id: number;
  reason: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  requested_at: string;
  processed_at?: string;
  processed_by?: number;
}

export interface DataExportRequest {
  id: number;
  user_id: number;
  status: 'pending' | 'processing' | 'ready' | 'expired';
  requested_at: string;
  completed_at?: string;
  download_url?: string;
  expires_at?: string;
}

export interface DataRetentionPolicy {
  id: number;
  data_category: string;
  retention_days: number;
  description: string;
  is_active: boolean;
  auto_delete: boolean;
}

export interface AuditLogEntry {
  id: number;
  user_id: number;
  action: string;
  resource_type: string;
  resource_id?: string;
  ip_address?: string;
  details?: string;
  created_at: string;
}

// ===== ATS Types =====

export type ATSProvider = 'greenhouse' | 'lever' | 'bamboohr';
export type ATSSyncStatus = 'idle' | 'syncing' | 'completed' | 'failed';

export interface ATSConnection {
  id: number;
  provider: ATSProvider;
  company_name: string;
  api_key_masked: string;
  base_url?: string;
  is_active: boolean;
  last_sync_at?: string;
  sync_status: ATSSyncStatus;
  created_at: string;
}

export interface ATSSyncLog {
  id: number;
  connection_id: number;
  sync_type: string;
  status: ATSSyncStatus;
  records_synced: number;
  errors: number;
  error_details?: string;
  started_at: string;
  completed_at?: string;
}

export interface ATSJobMapping {
  id: number;
  connection_id: number;
  ats_job_id: string;
  local_job_id: number;
  ats_job_title: string;
  last_synced_at: string;
}

export interface ATSCandidateMapping {
  id: number;
  connection_id: number;
  ats_candidate_id: string;
  local_application_id: number;
  ats_candidate_name: string;
  last_synced_at: string;
}

// ===== Video Interview Types =====

export type VideoInterviewStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface VideoInterview {
  id: number;
  job_id: number;
  candidate_id: number;
  interviewer_id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: VideoInterviewStatus;
  zoom_meeting_id?: string;
  zoom_join_url?: string;
  zoom_host_url?: string;
  recording_url?: string;
  candidate_name?: string;
  job_title?: string;
  created_at: string;
}

// ===== Fraud Detection Types =====

export interface FraudAnalysis {
  id: number;
  video_interview_id: number;
  voice_consistency_score: number;
  voice_pitch_variation: number;
  voice_speaking_rate: number;
  lip_sync_score: number;
  lip_sync_offset_ms: number;
  body_movement_score: number;
  posture_score: number;
  eye_contact_score: number;
  trust_score: number;
  is_flagged: boolean;
  flag_count: number;
  flags: FraudFlag[];
  analyzed_at: string;
  candidate_name?: string;
}

export interface FraudFlag {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp: string;
  metric: string;
  value: number;
  threshold: number;
}

export interface FraudDashboardStats {
  total_analyzed: number;
  flagged_count: number;
  cleared_count: number;
  avg_trust_score: number;
}

// ===== Post-Hire Feedback Types =====

export type FeedbackStatus = 'draft' | 'submitted' | 'reviewed';

export interface PostHireFeedback {
  id: number;
  candidate_id: number;
  job_id: number;
  reviewer_id: number;
  overall_score: number;
  technical_score: number;
  cultural_fit_score: number;
  communication_score: number;
  initiative_score: number;
  qualitative_feedback: string;
  employment_status: string;
  status: FeedbackStatus;
  review_period_months: number;
  candidate_name?: string;
  job_title?: string;
  reviewer_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface QualityMetric {
  id: number;
  job_id?: number;
  metric_type: string;
  metric_value: number;
  sample_size: number;
  computed_at: string;
}

export interface QualityDashboardData {
  prediction_accuracy: number;
  score_correlation: number;
  hire_success_rate: number;
  total_feedbacks: number;
  metrics_history: QualityMetric[];
}