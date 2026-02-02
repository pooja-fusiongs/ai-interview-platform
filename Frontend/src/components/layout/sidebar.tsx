import React from 'react'
import { useNavigate, useLocation,  } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Box, Typography, Button, Avatar, Chip } from '@mui/material'
import { getAccessibleRoutes, getRoleColor } from '../../utils/roleUtils'

interface NavigationProps {
  children: React.ReactNode;
}

const Navigation: React.FC<NavigationProps> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()



  // Get accessible routes based on user role
  const accessibleRoutes = getAccessibleRoutes(user?.role)

  const handleNavigation = (route: string): void => {
    navigate(route)
  }

  const isActive = (route: string): boolean => {
    if (route === '/') return location.pathname === '/'
    
    // Special case: interview-outline pages should show AI Questions as active
    if (route === '/ai-questions' && location.pathname.startsWith('/interview-outline')) {
      return true
    }
    
    // Special case: candidate-matching should show Candidates as active
    if (route === '/jobs' && location.pathname === '/candidate-matching') {
      return true
    }
    
    return location.pathname.startsWith(route)
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' }}>
      {/* Sidebar */}
      <Box sx={{
        width: 280,
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        flexShrink: 0,
        boxShadow: '2px 0 10px rgba(0, 0, 0, 0.1)',
        borderRight: '1px solid #e2e8f0'
      }}>
        <Box sx={{ padding: '24px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
            <Box sx={{
              width: 40,
              height: 40,
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '20px'
            }}>
              <i className="fas fa-robot"></i>
            </Box>
            <span>AI Interview Platform</span>
          </Box>
        </Box>
        
        <Box sx={{ flex: 1, padding: '20px 0', overflowY: 'auto' }}>
          {accessibleRoutes.map(route => (
            <Box key={route.path}>
              <Button
                onClick={() => handleNavigation(route.path)}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 20px',
                  border: 'none',
                  background: isActive(route.path) ? 'rgba(245, 158, 11, 0.1)' : 'none',
                  color: isActive(route.path) ? 'black' : '#64748b',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  textAlign: 'left',
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  '&:hover': {
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#f59e0b'
                  }
                }}
              >
                <i className={route.icon} style={{ width: '20px', textAlign: 'center', fontSize: '16px' }}></i>
                <span>{route.label}</span>
              </Button>
              
              
            </Box>
          ))}
        </Box>

        <Box sx={{ padding: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Avatar sx={{
              width: 40,
              height: 40,
              background: user?.role ? getRoleColor(user.role) : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              fontSize: '16px'
            }}>
              <i className="fas fa-user"></i>
            </Avatar>
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                {user?.name || user?.username || 'User'}
              </Typography>
              <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                {user?.company || 'Company'}
              </Typography>
            </Box>
          </Box>
          <Button
            onClick={logout}
            sx={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '6px',
              minWidth: 'auto',
              '&:hover': {
                background: '#f1f5f9',
                color: '#ef4444'
              }
            }}
          >
            <i className="fas fa-sign-out-alt"></i>
          </Button>
        </Box>
      </Box>

      {/* Main Content */}
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        background: '#f8fafc',
        height: '100vh',
        overflow: 'hidden'
      }}>
        {/* Common Header */}
        <Box sx={{
          background: 'white',
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
              Welcome back, {user?.name || user?.username || 'User'}!
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <Button sx={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: '10px',
              borderRadius: '8px',
              position: 'relative',
              fontSize: '18px',
              minWidth: 'auto',
              '&:hover': {
                background: '#f1f5f9',
                color: '#1e293b'
              }
            }}>
              <i className="fas fa-bell"></i>
              <Chip 
                label="3" 
                size="small"
                sx={{
                  position: 'absolute',
                  top: '6px',
                  right: '6px',
                  background: '#ef4444',
                  color: 'white',
                  fontSize: '10px',
                  height: '18px',
                  minWidth: '18px',
                  fontWeight: 600
                }}
              />
            </Button>
           
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#1e293b',
              border: '1px solid #e2e8f0',
              '&:hover': {
                background: '#f1f5f9',
                borderColor: '#cbd5e1'
              }
            }}
            onClick={() => handleNavigation('/candidate-profile')}
            >
              <Avatar sx={{
                width: 32,
                height: 32,
                background: user?.role ? getRoleColor(user.role) : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                fontSize: '14px'
              }}>
                <i className="fas fa-user"></i>
              </Avatar>
              <span>{user?.name || user?.username || 'User'}</span>
              <i className="fas fa-chevron-down"></i>
            </Box>
          </Box>
        </Box>

        {/* Content Area with Scroll */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}

export default Navigation