/**
 * Role Testing Component - FOR TESTING ONLY
 * Allows switching between different roles to test role-based access
 * This component should be removed in production
 */

import React, { useState } from 'react';
import { Box, Typography, Button, Select, MenuItem, FormControl, InputLabel, Paper, Chip } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';
import { getRoleDisplayName, getRoleColor, getAccessibleRoutes, getRolePermissions } from '../utils/roleUtils';

const RoleTester: React.FC = () => {
  const { user } = useAuth();
  const [selectedRole, setSelectedRole] = useState<UserRole>('candidate');

  // This is for testing only - simulates role switching
  const simulateRoleSwitch = (role: UserRole) => {
    // In a real app, this would be handled by the backend
    // For testing, we'll just update the user object directly
    
    // Update the auth context (this is a hack for testing)
    if (user) {
      (user as any).role = role;
    }
    
    // Force a page refresh to apply the new role
    window.location.reload();
  };

  const roles: UserRole[] = ['recruiter', 'domain_expert', 'admin', 'candidate'];
  const currentRole = user?.role || 'candidate';
  const accessibleRoutes = getAccessibleRoutes(currentRole);
  const permissions = getRolePermissions(currentRole);

  return (
    <Paper sx={{ 
      position: 'fixed', 
      top: 20, 
      right: 20, 
      padding: '20px', 
      minWidth: '300px',
      zIndex: 9999,
      background: 'white',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      borderRadius: '12px',
      border: '2px solid #f59e0b'
    }}>
      <Typography sx={{ 
        fontSize: '16px', 
        fontWeight: 700, 
        marginBottom: '16px',
        color: '#1e293b',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <i className="fas fa-flask" style={{ color: '#f59e0b' }}></i>
        Role Tester (DEV ONLY)
      </Typography>
      
      <Box sx={{ marginBottom: '16px' }}>
        <Typography sx={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
          Current Role:
        </Typography>
        <Chip
          label={getRoleDisplayName(currentRole)}
          sx={{
            background: getRoleColor(currentRole),
            color: 'white',
            fontWeight: 600
          }}
        />
      </Box>

      <FormControl fullWidth sx={{ marginBottom: '16px' }}>
        <InputLabel>Switch Role</InputLabel>
        <Select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value as UserRole)}
          label="Switch Role"
        >
          {roles.map(role => (
            <MenuItem key={role} value={role}>
              {getRoleDisplayName(role)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Button
        onClick={() => simulateRoleSwitch(selectedRole)}
        sx={{
          background: '#f59e0b',
          color: 'white',
          width: '100%',
          marginBottom: '16px',
          '&:hover': {
            background: '#d97706'
          }
        }}
      >
        Switch to {getRoleDisplayName(selectedRole)}
      </Button>

      <Box sx={{ marginBottom: '16px' }}>
        <Typography sx={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
          Accessible Routes:
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {accessibleRoutes.map(route => (
            <Typography key={route.path} sx={{ fontSize: '12px', color: '#64748b' }}>
              <i className={route.icon} style={{ width: '16px', marginRight: '8px' }}></i>
              {route.label}
            </Typography>
          ))}
        </Box>
      </Box>

      <Box>
        <Typography sx={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
          Permissions:
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {Object.entries(permissions).map(([key, value]) => (
            <Typography key={key} sx={{ 
              fontSize: '11px', 
              color: value ? '#10b981' : '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <i className={value ? 'fas fa-check' : 'fas fa-times'}></i>
              {key.replace('can', '').replace(/([A-Z])/g, ' $1').trim()}
            </Typography>
          ))}
        </Box>
      </Box>

      <Typography sx={{ 
        fontSize: '10px', 
        color: '#ef4444', 
        marginTop: '12px',
        fontWeight: 600,
        textAlign: 'center'
      }}>
        ⚠️ REMOVE IN PRODUCTION
      </Typography>
    </Paper>
  );
};

export default RoleTester;