import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  Box,
  Typography,
  Button,
  Avatar,
  Chip,
  Menu,
  MenuItem,
  Divider,
  Drawer,
  IconButton,
  useMediaQuery,
} from '@mui/material'
import { getAccessibleRoutes, getRoleColor } from '../../utils/roleUtils'

interface NavigationProps {
  children: React.ReactNode;
  noScroll?: boolean;
}

const SIDEBAR_WIDTH = 260

const Navigation: React.FC<NavigationProps> = ({ children, noScroll = false }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const menuOpen = Boolean(anchorEl)

  // Responsive breakpoints
  const isMobile = useMediaQuery('(max-width:768px)')
  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

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
    if (isMobile) {
      setMobileOpen(false)
    }
  }

  const isActive = (route: string): boolean => {
    if (route === '/') return location.pathname === '/'

    if (route === '/ai-questions' && location.pathname.startsWith('/interview-outline')) {
      return true
    }

    if (route === '/jobs' && location.pathname === '/candidate-matching') {
      return true
    }

    if (route === '/jobs' && location.pathname === '/recruiter-candidates') {
      return true
    }

    return location.pathname.startsWith(route)
  }

  // Sidebar content - reused for both mobile drawer and desktop sidebar
  const sidebarContent = (
    <Box sx={{
      width: isMobile ? 280 : SIDEBAR_WIDTH,
      background: 'white',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      flexShrink: 0,
    }}>
      {/* Logo Section */}
      <Box sx={{
        padding: { xs: '16px', sm: '20px', md: '24px 20px' },
        borderBottom: '1px solid #e2e8f0'
      }}>
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: { xs: '10px', md: '12px' },
          fontSize: { xs: '15px', md: '18px' },
          fontWeight: 700,
          color: 'text.primary'
        }}>
          <Box sx={{
            width: { xs: 36, md: 40 },
            height: { xs: 36, md: 40 },
            backgroundColor: 'primary.main',
            borderRadius: { xs: '8px', md: '10px' },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: { xs: '16px', md: '20px' }
          }}>
            <i className="fas fa-robot"></i>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ lineHeight: 1.2 }}>AI Interview</span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>Platform</span>
          </Box>
        </Box>
      </Box>

      {/* Navigation Items */}
      <Box sx={{
        flex: 1,
        padding: { xs: '12px 0', md: '20px 0' },
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
        },
        '&::-webkit-scrollbar-thumb:hover': {
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
              gap: { xs: '10px', md: '12px' },
              padding: { xs: '10px 16px', md: '11px 20px' },
              border: 'none',
              borderLeft: isActive(route.path) ? `3px solid ${'#020291'}` : '3px solid transparent',
              background: isActive(route.path) ? `${'#EEF0FF'}` : 'transparent',
              color: isActive(route.path) ? '#020291' : '#6b7280',
              fontSize: { xs: '13px', md: '13px' },
              fontWeight: isActive(route.path) ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'left',
              justifyContent: 'flex-start',
              textTransform: 'none',
              borderRadius: 0,
              '&:hover': {
                background: '#EEF0FF',
                color: '#020291',
                borderLeftColor: '#020291'
              }
            }}
          >
            <i className={route.icon} style={{ width: '18px', textAlign: 'center', fontSize: '14px' }}></i>
            <span>{route.label}</span>
          </Button>
        ))}
      </Box>

      {/* User Info at Bottom */}
      <Box sx={{
        padding: { xs: '16px', md: '20px' },
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '10px', md: '12px' }, flex: 1, minWidth: 0 }}>
          <Avatar sx={{
            width: { xs: 36, md: 40 },
            height: { xs: 36, md: 40 },
            backgroundColor: user?.role ? getRoleColor(user.role) : 'primary.main',
            fontSize: { xs: '14px', md: '16px' },
            flexShrink: 0
          }}>
            <i className="fas fa-user"></i>
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{
              fontSize: { xs: '13px', md: '14px' },
              fontWeight: 600,
              color: '#1e293b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {user?.name || user?.username || 'User'}
            </Typography>
            <Typography sx={{
              fontSize: { xs: '11px', md: '12px' },
              color: '#64748b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
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
            padding: { xs: '6px', md: '8px' },
            borderRadius: '6px',
            minWidth: 'auto',
            flexShrink: 0,
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
  )

  return (
    <Box sx={{ display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' }}>
      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile
          }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: 280,
              boxShadow: '4px 0 20px rgba(0, 0, 0, 0.15)',
            },
          }}
        >
          {sidebarContent}
        </Drawer>
      )}

      {/* Desktop Sidebar */}
      {!isMobile && (
        <Box sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          boxShadow: '2px 0 10px rgba(0, 0, 0, 0.1)',
          borderRight: '1px solid #e2e8f0',
          height: '100vh',
        }}>
          {sidebarContent}
        </Box>
      )}

      {/* Main Content */}
      <Box sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        height: '100vh',
        overflow: 'hidden',
        width: isMobile ? '100%' : `calc(100% - ${SIDEBAR_WIDTH}px)`
      }}>
        {/* Header */}
        <Box sx={{
          background: 'white',
          padding: { xs: '12px 16px', sm: '14px 20px', md: '16px 24px' },
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          gap: { xs: '8px', sm: '12px', md: '16px' }
        }}>
          {/* Left side - Hamburger (mobile) + Welcome */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '8px', sm: '12px', md: '16px' }, flex: 1, minWidth: 0 }}>
            {/* Hamburger Menu Button - Mobile Only */}
            {isMobile && (
              <IconButton
                color="inherit"
                aria-label="open drawer"
                edge="start"
                onClick={handleDrawerToggle}
                sx={{
                  color: '#64748b',
                  padding: '8px',
                  '&:hover': {
                    background: '#f1f5f9'
                  }
                }}
              >
                <i className="fas fa-bars" style={{ fontSize: '18px' }}></i>
              </IconButton>
            )}

            <Typography sx={{
              fontSize: { xs: '14px', sm: '15px', md: '16px' },
              fontWeight: 600,
              color: '#1e293b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {isMobile ? `Hi, ${user?.name?.split(' ')[0] || user?.username || 'User'}!` : `Welcome back, ${user?.name || user?.username || 'User'}!`}
            </Typography>
          </Box>

          {/* Right side - Notifications + User Menu */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '8px', sm: '12px', md: '20px' }, flexShrink: 0 }}>
            {/* Notification Bell */}
            <Button sx={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: { xs: '6px', sm: '8px', md: '10px' },
              borderRadius: '8px',
              position: 'relative',
              fontSize: { xs: '16px', md: '18px' },
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
                  top: { xs: '2px', md: '6px' },
                  right: { xs: '2px', md: '6px' },
                  background: '#ef4444',
                  color: 'white',
                  fontSize: { xs: '9px', md: '10px' },
                  height: { xs: '16px', md: '18px' },
                  minWidth: { xs: '16px', md: '18px' },
                  fontWeight: 600,
                  '& .MuiChip-label': {
                    padding: '0 4px'
                  }
                }}
              />
            </Button>

            {/* User Menu Button */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: '6px', sm: '8px', md: '12px' },
                padding: { xs: '6px 10px', sm: '7px 12px', md: '8px 16px' },
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: { xs: '12px', sm: '13px', md: '14px' },
                color: '#1e293b',
                border: menuOpen ? '1px solid' : '1px solid #e2e8f0',
                borderColor: menuOpen ? 'primary.main' : '#e2e8f0',
                background: menuOpen ? 'rgba(2, 2, 145, 0.05)' : 'transparent',
                transition: 'all 0.2s',
                '&:hover': {
                  background: 'rgba(2, 2, 145, 0.05)',
                  borderColor: 'primary.main'
                }
              }}
              onClick={handleMenuOpen}
            >
              <Avatar sx={{
                width: { xs: 26, sm: 28, md: 32 },
                height: { xs: 26, sm: 28, md: 32 },
                backgroundColor: user?.role ? getRoleColor(user.role) : 'primary.main',
                fontSize: { xs: '11px', sm: '12px', md: '14px' }
              }}>
                <i className="fas fa-user"></i>
              </Avatar>
              {/* Hide name on very small screens */}
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                <span>{user?.name || user?.username || 'User'}</span>
              </Box>
              <i
                className="fas fa-chevron-down"
                style={{
                  fontSize: '10px',
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
                  minWidth: { xs: 200, md: 220 },
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
                <Typography sx={{ fontSize: { xs: '13px', md: '14px' }, fontWeight: 600, color: '#1e293b' }}>
                  {user?.name || user?.username || 'User'}
                </Typography>
                <Typography sx={{
                  fontSize: { xs: '11px', md: '12px' },
                  color: '#64748b',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '180px'
                }}>
                  {user?.email || 'user@example.com'}
                </Typography>
              </Box>

              <MenuItem
                onClick={() => handleMenuItemClick('/candidate-profile')}
                sx={{
                  py: 1.5,
                  px: 2,
                  fontSize: { xs: '13px', md: '14px' },
                  gap: '12px'
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
                  fontSize: { xs: '13px', md: '14px' },
                  gap: '12px'
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
                  fontSize: { xs: '13px', md: '14px' },
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
        <Box sx={{
          flex: 1,
          overflow: noScroll ? 'hidden' : 'auto',
          padding: { xs: 0, sm: 0, md: 0 }
        }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}

export default Navigation
