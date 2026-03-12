import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { showError, showSuccess } from '../../utils/toast'
import { Box, Typography, TextField, Button, IconButton, InputAdornment } from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'
import { apiClient } from '../../services/api'

const ResetPassword = () => {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!token) {
      showError('Invalid reset link. Please request a new one.')
      return
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      showError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await apiClient.post('/api/auth/reset-password-confirm', {
        token,
        new_password: password
      })
      setSuccess(true)
      showSuccess('Password reset successfully!')
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Reset failed. The link may have expired.'
      showError(msg)
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <Box sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8f9fa'
      }}>
        <Box sx={{ textAlign: 'center', maxWidth: 400, p: 4 }}>
          <Typography sx={{ fontSize: '48px', mb: 2 }}>
            <i className="fas fa-exclamation-triangle" style={{ color: '#dc2626' }}></i>
          </Typography>
          <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#111827', mb: 1 }}>
            Invalid Reset Link
          </Typography>
          <Typography sx={{ fontSize: '14px', color: '#6b7280', mb: 3 }}>
            This password reset link is invalid or has expired. Please request a new one.
          </Typography>
          <Button
            onClick={() => navigate('/forgot-password')}
            sx={{
              background: '#020291',
              color: 'white',
              padding: '10px 24px',
              borderRadius: '8px',
              textTransform: 'none',
              '&:hover': { background: '#0303b8' }
            }}
          >
            Request New Link
          </Button>
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: { xs: 'column', md: 'row' } }}>
      <Box sx={{
        flex: 1,
        background: '#f8f9fa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: { xs: '40px 20px', sm: '50px 30px', md: '60px 40px' },
        minHeight: { xs: '100vh', md: 'auto' }
      }}>
        <Box sx={{ width: '100%', maxWidth: { xs: '100%', sm: 400 }, textAlign: 'center' }}>
          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: { xs: '16px', md: '20px' }
          }}>
            <Box sx={{
              width: { xs: 80, md: 100 },
              height: { xs: 80, md: 100 },
              background: '#EEF0FF',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '36px',
              color: '#020291'
            }}>
              <i className="fas fa-lock"></i>
            </Box>
          </Box>

          <Box sx={{ marginBottom: { xs: '16px', md: '20px' }, textAlign: 'left' }}>
            <Typography variant="h2" sx={{
              fontSize: { xs: '28px', sm: '32px', md: '36px' },
              fontWeight: 700,
              color: '#111827',
              margin: '0 0 10px 0'
            }}>
              Reset Password
            </Typography>
            <Box sx={{ width: '80px', height: '4px', background: '#020291', borderRadius: '2px' }} />
          </Box>

          {!success ? (
            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Typography sx={{ color: '#6b7280', fontSize: '14px', textAlign: 'left', mb: 3 }}>
                Enter your new password below.
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: '15px', mb: 3 }}>
                <Box sx={{
                  width: 50, height: 50,
                  color: '#020291',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#DDE1FF',
                  fontSize: '18px',
                  flexShrink: 0
                }}>
                  <i className="fas fa-lock"></i>
                </Box>
                <TextField
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New Password"
                  variant="outlined"
                  fullWidth
                  disabled={loading}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword(!showPassword)}
                            edge="end"
                            sx={{ color: password ? '#6c757d' : '#d1d5db' }}
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      )
                    }
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: 'white',
                      '& fieldset': { borderColor: '#e5e7eb' },
                      '&.Mui-focused fieldset': {
                        borderColor: 'rgba(2, 2, 145, 0.3)',
                        boxShadow: '0 0 0 3px rgba(2, 2, 145, 0.08)'
                      }
                    },
                    '& .MuiOutlinedInput-input': { padding: '10px 14px', color: '#111827' }
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: '15px', mb: 3 }}>
                <Box sx={{
                  width: 50, height: 50,
                  color: '#020291',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#DDE1FF',
                  fontSize: '18px',
                  flexShrink: 0
                }}>
                  <i className="fas fa-check-circle"></i>
                </Box>
                <TextField
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm New Password"
                  variant="outlined"
                  fullWidth
                  disabled={loading}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: 'white',
                      '& fieldset': { borderColor: '#e5e7eb' },
                      '&.Mui-focused fieldset': {
                        borderColor: 'rgba(2, 2, 145, 0.3)',
                        boxShadow: '0 0 0 3px rgba(2, 2, 145, 0.08)'
                      }
                    },
                    '& .MuiOutlinedInput-input': { padding: '10px 14px', color: '#111827' }
                  }}
                />
              </Box>

              {password && password.length < 6 && (
                <Typography sx={{ color: '#dc2626', fontSize: '12px', textAlign: 'left', mb: 2 }}>
                  Password must be at least 6 characters
                </Typography>
              )}

              <Button
                type="submit"
                disabled={loading}
                sx={{
                  width: '100%',
                  padding: '10px',
                  background: '#020291',
                  color: 'white',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  textTransform: 'none',
                  mb: 2,
                  boxShadow: '0 1px 3px rgba(2, 2, 145, 0.2)',
                  '&:hover': {
                    background: '#0303b8',
                    transform: 'translateY(-1px)',
                    boxShadow: '0 4px 14px rgba(2, 2, 145, 0.3)'
                  },
                  '&:disabled': {
                    opacity: 0.5,
                    color: 'white',
                    background: '#020291'
                  }
                }}
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </Box>
          ) : (
            <Box sx={{ textAlign: 'left' }}>
              <Box sx={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                padding: '16px',
                mb: 3
              }}>
                <Typography sx={{ color: '#166534', fontSize: '14px', fontWeight: 500 }}>
                  Password reset successfully!
                </Typography>
                <Typography sx={{ color: '#166534', fontSize: '13px', mt: 1 }}>
                  You can now sign in with your new password.
                </Typography>
              </Box>

              <Button
                onClick={() => navigate('/login')}
                sx={{
                  width: '100%',
                  padding: '10px',
                  background: '#020291',
                  color: 'white',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  textTransform: 'none',
                  boxShadow: '0 1px 3px rgba(2, 2, 145, 0.2)',
                  '&:hover': { background: '#0303b8' }
                }}
              >
                Go to Sign In
              </Button>
            </Box>
          )}

          <Button
            onClick={() => navigate('/login')}
            sx={{
              background: 'none',
              border: 'none',
              color: '#1e293b',
              fontSize: '14px',
              textDecoration: 'underline',
              textTransform: 'none',
              mt: 1,
              '&:hover': { color: '#020291' }
            }}
          >
            Back to <span style={{ color: '#020291', fontWeight: 600 }}>Sign In</span>
          </Button>
        </Box>
      </Box>

      <Box sx={{
        flex: 1,
        background: '#EEF0FF',
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        <Box
          component="img"
          src="/right_login(NEW).png"
          alt="AI Interview Platform"
          sx={{ width: '100%', height: '100%' }}
        />
      </Box>
    </Box>
  )
}

export default ResetPassword
