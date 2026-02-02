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
}