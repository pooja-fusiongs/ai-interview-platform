import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { showError, showSuccess } from '../../utils/toast'
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  InputAdornment
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'

const Login = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  })
  const [loading, setLoading] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    e.stopPropagation()

    console.log('🔐 Form submitted, preventing default behavior')

    if (loading) {
      console.log('⏳ Already loading, ignoring submission')
      return
    }

    if (!formData.username || !formData.password) {
      showError('Please fill in all fields')
      return
    }

    setLoading(true)

    try {
      console.log('🌐 Attempting login...')
      const result = await login(formData.username, formData.password)

      if (result.success) {
        console.log('✅ Login successful')
        showSuccess('Login successful! Welcome back.')
        setTimeout(() => navigate('/'), 500)
      } else {
        console.log('❌ Login failed:', result.message)

        // Check for user not found
        if (result.message?.toLowerCase().includes('not found') ||
          result.message?.toLowerCase().includes('does not exist') ||
          result.message?.toLowerCase().includes('user not found')) {
          showError('User not found! Please sign up first.')
        }
        // Check for incorrect password
        else if (result.message?.toLowerCase().includes('incorrect') ||
          result.message?.toLowerCase().includes('invalid') ||
          result.message?.toLowerCase().includes('wrong password')) {
          showError('Incorrect password! Please try again.')
        }
        // Generic error
        else {
          showError(result.message || 'Login failed. Please check your credentials.')
        }
      }
    } catch (error) {
      console.error('❌ Login error:', error)
      showError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: { xs: 'column', md: 'row' } }}>
      {/* Left Side - Form */}
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
          {/* Profile Avatar */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: { xs: '16px', md: '20px' }
          }}>
            <Box sx={{
              width: { xs: 100, md: 120 },
              height: { xs: 100, md: 120 },
              background: '#EEF0FF',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <Box sx={{ position: 'relative' }}>
                <Box sx={{
                  width: 35,
                  height: 35,
                  background: '#020291',
                  borderRadius: '50%',
                  margin: '0 auto 5px'
                }} />
                <Box sx={{
                  width: 50,
                  height: 35,
                  background: '#2c3e50',
                  borderRadius: '25px 25px 0 0',
                  position: 'relative',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: '8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '20px',
                    height: '15px',
                    background: '#3498db',
                    borderRadius: '2px'
                  }
                }} />
              </Box>
            </Box>
          </Box>

          {/* Sign In Title */}
          <Box sx={{ marginBottom: { xs: '16px', md: '20px' }, textAlign: 'left' }}>
            <Typography variant="h2" sx={{
              fontSize: { xs: '28px', sm: '32px', md: '36px' },
              fontWeight: 700,
              color: '#111827',
              margin: '0 0 10px 0'
            }}>
              Sign In
            </Typography>
            <Box sx={{
              width: '80px',
              height: '4px',
              background: '#020291',
              borderRadius: '2px'
            }} />
          </Box>

          {/* Form */}
          <Box
            component="form"
            onSubmit={handleFormSubmit}
            sx={{ marginBottom: '10px' }}
            noValidate
            autoComplete="off"
          >
            {/* Email Field */}
            <Box sx={{
              position: 'relative',
              marginBottom: { xs: '20px', md: '25px' },
              display: 'flex',
              alignItems: 'center',
              gap: { xs: '12px', md: '15px' }
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
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                required
                placeholder="Email"
                variant="outlined"
                fullWidth
                disabled={loading}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'white',
                    '& fieldset': {
                      borderColor: '#e5e7eb',
                      borderWidth: '1px'
                    },
                    '&:hover fieldset': {
                      borderColor: '#d1d5db'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'rgba(2, 2, 145, 0.3)',
                      boxShadow: '0 0 0 3px rgba(2, 2, 145, 0.08)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '10px 14px',
                    color: '#111827'
                  }
                }}
              />
            </Box>

            {/* Password Field */}
            <Box sx={{
              position: 'relative',
              marginBottom: { xs: '20px', md: '25px' },
              display: 'flex',
              alignItems: 'center',
              gap: { xs: '12px', md: '15px' }
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
                <i className="fas fa-lock"></i>
              </Box>
              <TextField
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                placeholder="••••••"
                variant="outlined"
                fullWidth
                disabled={loading}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={(e) => {
                            e.preventDefault()
                            setShowPassword(!showPassword)
                          }}
                          edge="end"
                          disabled={!formData.password}
                          sx={{
                            color: formData.password ? '#6c757d' : '#d1d5db',
                            cursor: formData.password ? 'pointer' : 'not-allowed'
                          }}
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '8px',
                    fontSize: '14px',
                    background: 'white',
                    '& fieldset': {
                      borderColor: '#e5e7eb',
                      borderWidth: '1px'
                    },
                    '&:hover fieldset': {
                      borderColor: '#d1d5db'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: 'rgba(2, 2, 145, 0.3)',
                      boxShadow: '0 0 0 3px rgba(2, 2, 145, 0.08)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '10px 14px',
                    color: '#111827',
                    fontFamily: showPassword ? 'inherit' : 'Courier New, monospace',
                    letterSpacing: showPassword ? 'normal' : '2px'
                  }
                }}
              />
            </Box>

            {/* Submit Button */}
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
                cursor: 'pointer',
                textTransform: 'none',
                marginBottom: '10px',
                boxShadow: '0 1px 3px rgba(2, 2, 145, 0.2)',
                transition: 'all 0.2s',
                '&:hover': {
                  background: '#0303b8',
                  transform: 'translateY(-1px)',
                  boxShadow: '0 4px 14px rgba(2, 2, 145, 0.3)'
                },
                '&:active': { transform: 'translateY(0)' },
                '&:disabled': {
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  transform: 'none',
                  boxShadow: 'none',
                  color: 'white',
                  background: '#020291'
                }
              }}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </Button>
          </Box>

          {/* Forgot Password */}
          <Box sx={{ margin: '10px 0' }}>
            <Button
              type="button"
              sx={{
                background: 'none',
                border: '1px solid #e5e7eb',
                color: '#6b7280',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
                textTransform: 'none',
                '&:hover': {
                  borderColor: '#020291',
                  color: '#020291'
                }
              }}
            >
              Forgot Password ?
            </Button>
          </Box>

          {/* Signup Link */}
          <Box sx={{ marginTop: '20px' }}>
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                navigate('/signup')
              }}
              sx={{
                background: 'none',
                border: 'none',
                color: '#1e293b',
                fontSize: '14px',
                cursor: 'pointer',
                textDecoration: 'underline',
                textTransform: 'none',
                '&:hover': {
                  color: '#020291'
                }
              }}
            >
              Don't have an account? <span style={{color:"#020291",fontWeight:"600"}}>Sign Up</span>
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Right Side - Image (Hidden on mobile/tablet) */}
      <Box sx={{
        flex: 1,
        background: '#EEF0FF',
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <Box sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0
        }}>
          <Box
            component="img"
            src="/right_login(NEW).png"
            alt="AI Interview Platform Illustration"
            sx={{
              width: '100%',
              height: '100%',
            }}
          />
        </Box>
      </Box>
    </Box>
  )
}

export default Login