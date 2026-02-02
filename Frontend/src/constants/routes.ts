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
} as const;

export const PUBLIC_ROUTES = [
  ROUTES.LOGIN,
  ROUTES.SIGNUP,
];

export const PROTECTED_ROUTES = Object.values(ROUTES).filter(
  route => !(PUBLIC_ROUTES as readonly string[]).includes(route)
);

export default ROUTES;