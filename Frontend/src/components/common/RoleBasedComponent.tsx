/**
 * Role-Based Component Wrapper
 * Shows/hides components based on user roles and permissions
 */

import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { canPerformAction } from '../../utils/roleUtils';
import { UserRole, RolePermissions } from '../../types';

interface RoleBasedComponentProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requiredPermission?: keyof RolePermissions;
  fallback?: React.ReactNode;
  hideIfNoAccess?: boolean;
}

const RoleBasedComponent: React.FC<RoleBasedComponentProps> = ({
  children,
  allowedRoles,
  requiredPermission,
  fallback = null,
  hideIfNoAccess = true
}) => {
  const { user } = useAuth();

  // If user is not logged in or has no role, hide component
  if (!user || !user.role) {
    return hideIfNoAccess ? null : <>{fallback}</>;
  }

  // Check role-based access
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return hideIfNoAccess ? null : <>{fallback}</>;
  }

  // Check permission-based access
  if (requiredPermission && !canPerformAction(user.role, requiredPermission)) {
    return hideIfNoAccess ? null : <>{fallback}</>;
  }

  // User has access, render the component
  return <>{children}</>;
};

// Specific role-based components for common use cases
export const RecruiterOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => (
  <RoleBasedComponent allowedRoles={['recruiter']} fallback={fallback}>
    {children}
  </RoleBasedComponent>
);

export const AdminOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => (
  <RoleBasedComponent allowedRoles={['admin']} fallback={fallback}>
    {children}
  </RoleBasedComponent>
);

export const DomainExpertOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => (
  <RoleBasedComponent allowedRoles={['domain_expert']} fallback={fallback}>
    {children}
  </RoleBasedComponent>
);

export const CandidateOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => (
  <RoleBasedComponent allowedRoles={['candidate']} fallback={fallback}>
    {children}
  </RoleBasedComponent>
);

export const RecruiterOrAdmin: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => (
  <RoleBasedComponent allowedRoles={['recruiter', 'admin']} fallback={fallback}>
    {children}
  </RoleBasedComponent>
);

export const StaffOnly: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => (
  <RoleBasedComponent allowedRoles={['recruiter', 'domain_expert', 'admin']} fallback={fallback}>
    {children}
  </RoleBasedComponent>
);

// Permission-based components
export const CanCreateJob: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => (
  <RoleBasedComponent requiredPermission="canCreateJob" fallback={fallback}>
    {children}
  </RoleBasedComponent>
);

export const CanViewCandidates: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => (
  <RoleBasedComponent requiredPermission="canViewCandidates" fallback={fallback}>
    {children}
  </RoleBasedComponent>
);

export const CanManageUsers: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => (
  <RoleBasedComponent requiredPermission="canManageUsers" fallback={fallback}>
    {children}
  </RoleBasedComponent>
);

export const CanApplyJobs: React.FC<{ children: React.ReactNode; fallback?: React.ReactNode }> = ({ children, fallback }) => (
  <RoleBasedComponent requiredPermission="canApplyJobs" fallback={fallback}>
    {children}
  </RoleBasedComponent>
);

export default RoleBasedComponent;