/**
 * Role-Based Access Control Utilities
 * Manages user permissions and route access based on roles
 */

import { UserRole, RolePermissions, RouteAccess } from '../types';

// Define role permissions
export const getRolePermissions = (role: UserRole): RolePermissions => {
  switch (role) {
    case 'recruiter':
      return {
        canViewDashboard: true,
        canCreateJob: true,
        canViewJobs: true,
        canViewCandidates: true,
        canManageUsers: false,
        canEvaluateJobs: false,
        canApplyJobs: false,
        canViewProfile: true,
      };
    
    case 'domain_expert':
      return {
        canViewDashboard: true,
        canCreateJob: false,
        canViewJobs: true,
        canViewCandidates: true,
        canManageUsers: false,
        canEvaluateJobs: true,
        canApplyJobs: false,
        canViewProfile: true,
      };
    
    case 'admin':
      return {
        canViewDashboard: true,
        canCreateJob: true,
        canViewJobs: true,
        canViewCandidates: true,
        canManageUsers: true,
        canEvaluateJobs: true,
        canApplyJobs: false,
        canViewProfile: true,
      };
    
    case 'candidate':
      return {
        canViewDashboard: true,
        canCreateJob: false,
        canViewJobs: true,
        canViewCandidates: false,
        canManageUsers: false,
        canEvaluateJobs: false,
        canApplyJobs: true,
        canViewProfile: true,
      };
    
    default:
      return {
        canViewDashboard: false,
        canCreateJob: false,
        canViewJobs: false,
        canViewCandidates: false,
        canManageUsers: false,
        canEvaluateJobs: false,
        canApplyJobs: false,
        canViewProfile: false,
      };
  }
};

// Define route access based on roles
export const getRouteAccess = (): RouteAccess[] => [
  {
    path: '/dashboard',
    allowedRoles: ['recruiter', 'domain_expert', 'admin', 'candidate'],
    label: 'Dashboard',
    icon: 'fas fa-chart-line'
  },
  {
    path: '/jobs',
    allowedRoles: ['recruiter', 'domain_expert', 'admin', 'candidate'],
    label: 'Jobs',
    icon: 'fas fa-briefcase'
  },
  {
    path: '/candidates',
    allowedRoles: ['recruiter', 'domain_expert', 'admin'],
    label: 'Candidates',
    icon: 'fas fa-users'
  },
  {
    path: '/job-creation',
    allowedRoles: ['recruiter', 'admin'],
    label: 'Post a Job',
    icon: 'fas fa-plus-circle'
  },
  {
    path: '/ai-questions',
    allowedRoles: ['recruiter', 'domain_expert', 'admin'],
    label: 'AI Questions',
    icon: 'fas fa-robot'
  },
  {
    path: '/interview',
    allowedRoles: ['candidate'],
    label: 'Interview',
    icon: 'fas fa-video'
  },
  {
    path: '/results',
    allowedRoles: ['recruiter', 'domain_expert', 'admin', 'candidate'],
    label: 'Results',
    icon: 'fas fa-chart-bar'
  },
  // Video Interviews
  {
    path: '/video-interviews',
    allowedRoles: ['recruiter', 'admin', 'candidate'],
    label: 'Video Interviews',
    icon: 'fas fa-video'
  },
  {
    path: '/video-scheduler',
    allowedRoles: ['recruiter', 'admin'],
    label: 'Schedule Interview',
    icon: 'fas fa-calendar-plus'
  },
  // Fraud Detection
  {
    path: '/fraud-dashboard',
    allowedRoles: ['recruiter', 'admin'],
    label: 'Fraud Detection',
    icon: 'fas fa-shield-alt'
  },
  {
    path: '/fraud-monitor',
    allowedRoles: ['recruiter', 'admin'],
    label: 'Live Monitor',
    icon: 'fas fa-broadcast-tower'
  },
  // ATS Integration
  {
    path: '/ats-settings',
    allowedRoles: ['recruiter', 'admin'],
    label: 'ATS Integration',
    icon: 'fas fa-plug'
  },
  // Post-Hire Feedback
  {
    path: '/feedback-list',
    allowedRoles: ['recruiter', 'admin'],
    label: 'Post-Hire Feedback',
    icon: 'fas fa-comment-dots'
  },
  {
    path: '/quality-dashboard',
    allowedRoles: ['recruiter', 'admin'],
    label: 'Quality Metrics',
    icon: 'fas fa-chart-pie'
  },
  // GDPR / Privacy
  {
    path: '/consent-manager',
    allowedRoles: ['candidate'],
    label: 'Privacy & Consent',
    icon: 'fas fa-lock'
  },
  {
    path: '/privacy-notice',
    allowedRoles: ['recruiter', 'domain_expert', 'admin', 'candidate'],
    label: 'Privacy Notice',
    icon: 'fas fa-file-alt'
  },
  {
    path: '/admin-audit-log',
    allowedRoles: ['admin'],
    label: 'Audit Log',
    icon: 'fas fa-clipboard-list'
  },
  {
    path: '/admin-retention',
    allowedRoles: ['admin'],
    label: 'Data Retention',
    icon: 'fas fa-database'
  }
];

// Check if user has access to a specific route
export const hasRouteAccess = (userRole: UserRole | undefined, routePath: string): boolean => {
  if (!userRole) return false;
  
  const routeAccess = getRouteAccess().find(route => route.path === routePath);
  if (!routeAccess) return false;
  
  return routeAccess.allowedRoles.includes(userRole);
};

// Get accessible routes for a user role
export const getAccessibleRoutes = (userRole: UserRole | undefined): RouteAccess[] => {
  if (!userRole) return [];
  
  return getRouteAccess().filter(route => route.allowedRoles.includes(userRole));
};

// Get role display name
export const getRoleDisplayName = (role: UserRole): string => {
  switch (role) {
    case 'recruiter':
      return 'Recruiter';
    case 'domain_expert':
      return 'Domain Expert';
    case 'admin':
      return 'Administrator';
    case 'candidate':
      return 'Candidate';
    default:
      return 'User';
  }
};

// Get role color for UI display
export const getRoleColor = (role: UserRole): string => {
  switch (role) {
    case 'recruiter':
      return '#3b82f6'; // Blue
    case 'domain_expert':
      return '#8b5cf6'; // Purple
    case 'admin':
      return '#ef4444'; // Red
    case 'candidate':
      return '#10b981'; // Green
    default:
      return '#6b7280'; // Gray
  }
};

// Check if user can perform a specific action
export const canPerformAction = (userRole: UserRole | undefined, action: keyof RolePermissions): boolean => {
  if (!userRole) return false;
  
  const permissions = getRolePermissions(userRole);
  return permissions[action];
};

// Get default route for user role
export const getDefaultRoute = (userRole: UserRole | undefined): string => {
  if (!userRole) return '/login';
  
  // Specific default routes for each role
  switch (userRole) {
    case 'admin':
      return '/dashboard';
    case 'recruiter':
      return '/dashboard';
    case 'domain_expert':
      return '/jobs';
    case 'candidate':
      return '/jobs';
    default:
      return '/login';
  }
};