/**
 * Role-Based Route Protection Component
 * Restricts access to routes based on user roles
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { getDefaultRoute, getRoleDisplayName } from '../../utils/roleUtils';
import { UserRole } from '../../types';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
}

const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({ 
  children, 
  allowedRoles, 
  redirectTo 
}) => {
  const { user } = useAuth();

  // If user is not logged in, redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user doesn't have a role, show error
  if (!user.role) {
    return <AccessDeniedPage message="User role not assigned. Please contact administrator." />;
  }

  // Check if user has access to this route
  if (!allowedRoles.includes(user.role)) {
    // Redirect to user's default route or specified redirect
    const defaultRoute = redirectTo || getDefaultRoute(user.role);
    
    if (defaultRoute === '/login') {
      return <AccessDeniedPage message="You don't have access to any pages. Please contact administrator." />;
    }
    
    return <Navigate to={defaultRoute} replace />;
  }

  // User has access, render the component
  return <>{children}</>;
};

// Access Denied Page Component
const AccessDeniedPage: React.FC<{ message: string }> = ({ message }) => {
  const { user, logout } = useAuth();

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: '#f8fafc',
      padding: '20px'
    }}>
      <Box sx={{
        background: 'white',
        borderRadius: '12px',
        padding: '40px',
        textAlign: 'center',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        maxWidth: '500px',
        width: '100%'
      }}>
        <Box sx={{
          width: '80px',
          height: '80px',
          background: '#fee2e2',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          color: '#dc2626',
          fontSize: '32px'
        }}>
          <i className="fas fa-lock"></i>
        </Box>
        
        <Typography sx={{
          fontSize: '24px',
          fontWeight: 700,
          color: '#1e293b',
          marginBottom: '12px'
        }}>
          Access Denied
        </Typography>
        
        <Typography sx={{
          fontSize: '16px',
          color: '#64748b',
          marginBottom: '8px'
        }}>
          {message}
        </Typography>
        
        {user?.role && (
          <Typography sx={{
            fontSize: '14px',
            color: '#94a3b8',
            marginBottom: '24px'
          }}>
            Current Role: {getRoleDisplayName(user.role)}
          </Typography>
        )}
        
        <Button
          onClick={logout}
          sx={{
            background: '#f59e0b',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            textTransform: 'none',
            '&:hover': {
              background: '#d97706'
            }
          }}
        >
          Logout & Login with Different Account
        </Button>
      </Box>
    </Box>
  );
};

export default RoleProtectedRoute;