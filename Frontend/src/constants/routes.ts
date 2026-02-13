/**
 * Application Routes Constants
 */

export const ROUTES = {
  // Public routes
  LOGIN: '/login',
  SIGNUP: '/signup',

  // Protected routes
  HOME: '/',
  DASHBOARD: '/dashboard',

  // Job routes
  JOBS: '/jobs',
  JOB_CREATION: '/job-creation',
  JOB_DETAILS: '/jobs/:id',

  // Candidate routes
  CANDIDATES: '/candidates',
  CANDIDATE_UPLOAD: '/candidate-upload',
  CANDIDATE_PROFILE: '/profile',

  // Interview routes
  INTERVIEW: '/interview',
  AI_QUESTIONS: '/ai-questions',
  RESULTS: '/results',

  // Admin routes
  USER_MANAGEMENT: '/user-management',

  // GDPR routes
  PRIVACY_SETTINGS: '/privacy-settings',
  CONSENT_MANAGER: '/consent-manager',
  DATA_EXPORT: '/data-export',
  DELETION_REQUEST: '/deletion-request',
  PRIVACY_NOTICE: '/privacy-notice',
  ADMIN_AUDIT_LOG: '/admin-audit-log',
  ADMIN_RETENTION: '/admin-retention',
  ADMIN_DELETION_REQUESTS: '/admin-deletion-requests',

  // ATS routes
  ATS_SETTINGS: '/ats-settings',
  ATS_SYNC: '/ats-sync',
  ATS_MAPPINGS: '/ats-mappings',

  // Video Interview routes
  VIDEO_INTERVIEWS: '/video-interviews',
  VIDEO_SCHEDULER: '/video-scheduler',
  VIDEO_ROOM: '/video-room/:videoId',
  VIDEO_DETAIL: '/video-detail/:videoId',
  VIDEO_CONSENT: '/video-consent',

  // Fraud Detection routes
  FRAUD_DASHBOARD: '/fraud-dashboard',
  FRAUD_ANALYSIS: '/fraud-analysis/:videoId',
  FRAUD_MONITOR: '/fraud-monitor',

  // Post-Hire Feedback routes
  FEEDBACK_FORM: '/feedback-form',
  FEEDBACK_LIST: '/feedback-list',
  FEEDBACK_DETAIL: '/feedback/:feedbackId',
  QUALITY_DASHBOARD: '/quality-dashboard',
  PERFORMANCE_TRACKER: '/performance-tracker',
  SCORING_REFINEMENT: '/scoring-refinement',
} as const;

export const PUBLIC_ROUTES = [
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
];

export const PROTECTED_ROUTES = Object.values(ROUTES).filter(
  route => !(PUBLIC_ROUTES as readonly string[]).includes(route)
);

export default ROUTES;