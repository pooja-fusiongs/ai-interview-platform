/**
 * Role Constants
 */

export const ROLES = {
  RECRUITER: 'recruiter',
  DOMAIN_EXPERT: 'domain_expert',
  ADMIN: 'admin',
} as const;

export const ROLE_HIERARCHY = {
  [ROLES.RECRUITER]: 1,
  [ROLES.DOMAIN_EXPERT]: 2,
  [ROLES.ADMIN]: 3,
} as const;

export const ROLE_DISPLAY_NAMES = {
  [ROLES.RECRUITER]: 'Recruiter',
  [ROLES.DOMAIN_EXPERT]: 'Domain Expert',
  [ROLES.ADMIN]: 'Administrator',
} as const;

export const ROLE_COLORS = {
  [ROLES.RECRUITER]: '#3b82f6',
  [ROLES.DOMAIN_EXPERT]: '#8b5cf6',
  [ROLES.ADMIN]: '#ef4444',
} as const;

export default ROLES;