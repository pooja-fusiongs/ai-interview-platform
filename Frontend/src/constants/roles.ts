/**
 * Role Constants
 */

export const ROLES = {
  CANDIDATE: 'candidate',
  RECRUITER: 'recruiter',
  DOMAIN_EXPERT: 'domain_expert',
  ADMIN: 'admin',
} as const;

export const ROLE_HIERARCHY = {
  [ROLES.CANDIDATE]: 1,
  [ROLES.RECRUITER]: 2,
  [ROLES.DOMAIN_EXPERT]: 3,
  [ROLES.ADMIN]: 4,
} as const;

export const ROLE_DISPLAY_NAMES = {
  [ROLES.CANDIDATE]: 'Candidate',
  [ROLES.RECRUITER]: 'Recruiter',
  [ROLES.DOMAIN_EXPERT]: 'Domain Expert',
  [ROLES.ADMIN]: 'Administrator',
} as const;

export const ROLE_COLORS = {
  [ROLES.CANDIDATE]: '#10b981',
  [ROLES.RECRUITER]: '#3b82f6',
  [ROLES.DOMAIN_EXPERT]: '#8b5cf6',
  [ROLES.ADMIN]: '#ef4444',
} as const;

export default ROLES;