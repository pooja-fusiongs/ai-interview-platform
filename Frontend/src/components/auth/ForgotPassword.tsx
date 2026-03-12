import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { showError, showSuccess } from '../../utils/toast'
import { Box, Typography, TextField, Button } from '@mui/material'
import { apiClient } from '../../services/api'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      showError('Please enter your email')
      return
    }

    setLoading(true)
    try {
      await apiClient.post('/api/auth/forgot-password', { email })
      setSent(true)
      showSuccess('If an account exists with that email, a reset link has been sent.')
    } catch {
      showError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
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
              <i className="fas fa-key"></i>
            </Box>
          </Box>

          <Box sx={{ marginBottom: { xs: '16px', md: '20px' }, textAlign: 'left' }}>
            <Typography variant="h2" sx={{
              fontSize: { xs: '28px', sm: '32px', md: '36px' },
              fontWeight: 700,
              color: '#111827',
              margin: '0 0 10px 0'
            }}>
              Forgot Password
            </Typography>
            <Box sx={{ width: '80px', height: '4px', background: '#020291', borderRadius: '2px' }} />
          </Box>

          {!sent ? (
            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Typography sx={{ color: '#6b7280', fontSize: '14px', textAlign: 'left', mb: 3 }}>
                Enter your email address and we'll send you a link to reset your password.
              </Typography>

              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: { xs: '12px', md: '15px' },
                mb: 3
              }}>
                <Box sx={{
                  width: { xs: 44, md: 50 },
                  height: { xs: 44, md: 50 },
                  color: '#020291',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#DDE1FF',
                  fontSize: '18px',
                  flexShrink: 0
                }}>
                  <i className="fas fa-envelope"></i>
                </Box>
                <TextField
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  variant="outlined"
                  fullWidth
                  disabled={loading}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      fontSize: '14px',
                      background: 'white',
                      '& fieldset': { borderColor: '#e5e7eb' },
                      '&:hover fieldset': { borderColor: '#d1d5db' },
                      '&.Mui-focused fieldset': {
                        borderColor: 'rgba(2, 2, 145, 0.3)',
                        boxShadow: '0 0 0 3px rgba(2, 2, 145, 0.08)'
                      }
                    },
                    '& .MuiOutlinedInput-input': { padding: '10px 14px', color: '#111827' }
                  }}
                />
              </Box>

              <Button
                type="submit"
                disabled={loading}
                sx={{
                  width: '100%',
                  padding: '10px',
                  background: '#020291',
                  color: 'white',
                  border: 'none',
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
                {loading ? 'Sending...' : 'Send Reset Link'}
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
                  Reset link sent! Check your email inbox.
                </Typography>
                <Typography sx={{ color: '#166534', fontSize: '13px', mt: 1 }}>
                  The link will expire in 15 minutes. If you don't see it, check your spam folder.
                </Typography>
              </Box>

              <Button
                onClick={() => { setSent(false); setEmail('') }}
                sx={{
                  width: '100%',
                  padding: '10px',
                  background: 'white',
                  color: '#020291',
                  border: '1px solid #020291',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  textTransform: 'none',
                  mb: 2,
                  '&:hover': { background: '#EEF0FF' }
                }}
              >
                Send Again
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

export default ForgotPassword
