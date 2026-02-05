import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Box, Typography, Button, Avatar, Chip, Menu, MenuItem, Divider } from '@mui/material'
import { getAccessibleRoutes, getRoleColor } from '../../utils/roleUtils'

interface NavigationProps {
  children: React.ReactNode;
  noScroll?: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ children, noScroll = false }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const menuOpen = Boolean(anchorEl)

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  const handleMenuItemClick = (path: string) => {
    handleMenuClose()
    navigate(path)
  }

  const handleLogout = () => {
    handleMenuClose()
    logout()
  }



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

    // Special case: recruiter-candidates should show Jobs as active
    if (route === '/jobs' && location.pathname === '/recruiter-candidates') {
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
        
        <Box sx={{
          flex: 1,
          padding: '20px 0',
          overflowY: 'auto',
          overflowX: 'hidden',
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '&::-webkit-scrollbar-thumb': {
            background: '#e2e8f0',
            borderRadius: '10px',
            transition: 'background 0.2s',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: '#cbd5e1',
          },
          '&:hover::-webkit-scrollbar-thumb': {
            background: '#cbd5e1',
          },
          scrollbarWidth: 'thin',
          scrollbarColor: '#e2e8f0 transparent',
        }}>
          {accessibleRoutes.map(route => (
            <Button
              key={route.path}
              onClick={() => handleNavigation(route.path)}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '11px 20px',
                border: 'none',
                borderLeft: isActive(route.path) ? '3px solid #f59e0b' : '3px solid transparent',
                background: isActive(route.path) ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                color: isActive(route.path) ? '#f59e0b' : '#64748b',
                fontSize: '13px',
                fontWeight: isActive(route.path) ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left',
                justifyContent: 'flex-start',
                textTransform: 'none',
                borderRadius: 0,
                '&:hover': {
                  background: 'rgba(245, 158, 11, 0.08)',
                  color: '#f59e0b',
                  borderLeftColor: '#f59e0b'
                }
              }}
            >
              <i className={route.icon} style={{ width: '18px', textAlign: 'center', fontSize: '14px' }}></i>
              <span>{route.label}</span>
            </Button>
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
           
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#1e293b',
                border: menuOpen ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                background: menuOpen ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                transition: 'all 0.2s',
                '&:hover': {
                  background: 'rgba(245, 158, 11, 0.05)',
                  borderColor: '#f59e0b'
                }
              }}
              onClick={handleMenuOpen}
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
              <i
                className="fas fa-chevron-down"
                style={{
                  fontSize: '12px',
                  transition: 'transform 0.2s',
                  transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                }}
              ></i>
            </Box>

            {/* User Dropdown Menu */}
            <Menu
              anchorEl={anchorEl}
              open={menuOpen}
              onClose={handleMenuClose}
              onClick={handleMenuClose}
              PaperProps={{
                elevation: 0,
                sx: {
                  overflow: 'visible',
                  filter: 'drop-shadow(0px 4px 20px rgba(0,0,0,0.12))',
                  mt: 1.5,
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  minWidth: 220,
                  '&:before': {
                    content: '""',
                    display: 'block',
                    position: 'absolute',
                    top: 0,
                    right: 20,
                    width: 12,
                    height: 12,
                    bgcolor: 'background.paper',
                    transform: 'translateY(-50%) rotate(45deg)',
                    zIndex: 0,
                    borderLeft: '1px solid #e2e8f0',
                    borderTop: '1px solid #e2e8f0',
                  },
                },
              }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              {/* User Info Header */}
              <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f1f5f9' }}>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                  {user?.name || user?.username || 'User'}
                </Typography>
                <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                  {user?.email || 'user@example.com'}
                </Typography>
              </Box>

              <MenuItem
                onClick={() => handleMenuItemClick('/candidate-profile')}
                sx={{
                  py: 1.5,
                  px: 2,
                  fontSize: '14px',
                  gap: '12px',
                  '&:hover': { background: 'rgba(245, 158, 11, 0.08)' }
                }}
              >
                <i className="fas fa-user-circle" style={{ width: 20, color: '#64748b' }}></i>
                My Profile
              </MenuItem>

              <MenuItem
                onClick={() => handleMenuItemClick('/consent-manager')}
                sx={{
                  py: 1.5,
                  px: 2,
                  fontSize: '14px',
                  gap: '12px',
                  '&:hover': { background: 'rgba(245, 158, 11, 0.08)' }
                }}
              >
                <i className="fas fa-shield-alt" style={{ width: 20, color: '#64748b' }}></i>
                Privacy & Consent
              </MenuItem>

              <Divider sx={{ my: 1 }} />

              <MenuItem
                onClick={handleLogout}
                sx={{
                  py: 1.5,
                  px: 2,
                  fontSize: '14px',
                  gap: '12px',
                  color: '#ef4444',
                  '&:hover': { background: 'rgba(239, 68, 68, 0.08)' }
                }}
              >
                <i className="fas fa-sign-out-alt" style={{ width: 20 }}></i>
                Sign Out
              </MenuItem>
            </Menu>
          </Box>
        </Box>

        {/* Content Area with Scroll */}
        <Box sx={{ flex: 1, overflow: noScroll ? 'hidden' : 'auto' }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}

export default Navigation