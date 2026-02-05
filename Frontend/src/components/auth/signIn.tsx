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
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left Side - Form */}
      <Box sx={{
        flex: 1,
        background: '#f8f9fa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 40px'
      }}>
        <Box sx={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          {/* Profile Avatar */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '20px'
          }}>
            <Box sx={{
              width: 120,
              height: 120,
              background: 'linear-gradient(135deg, #e8f4fd 0%, #d1e7dd 100%)',
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
                  background: '#ff9a56',
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
          <Box sx={{ marginBottom: '20px', textAlign: 'left' }}>
            <Typography variant="h2" sx={{
              fontSize: '36px',
              fontWeight: 600,
              color: '#2c3e50',
              margin: '0 0 10px 0'
            }}>
              Sign In
            </Typography>
            <Box sx={{
              width: '80px',
              height: '4px',
              background: '#ffc107',
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
              marginBottom: '25px',
              display: 'flex',
              alignItems: 'center',
              gap: '15px'
            }}>
              <Box sx={{
                width: 50,
                height: 50,
                background: 'linear-gradient(135deg, #ff9a56 0%, #ff6b35 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
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
                    borderRadius: '25px',
                    fontSize: '16px',
                    background: 'white',
                    '& fieldset': {
                      borderColor: '#e9ecef',
                      borderWidth: '2px'
                    },
                    '&:hover fieldset': {
                      borderColor: '#ff9a56'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#ff9a56',
                      boxShadow: '0 0 0 3px rgba(255, 154, 86, 0.1)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '15px 20px',
                    color: '#2c3e50'
                  }
                }}
              />
            </Box>

            {/* Password Field */}
            <Box sx={{
              position: 'relative',
              marginBottom: '25px',
              display: 'flex',
              alignItems: 'center',
              gap: '15px'
            }}>
              <Box sx={{
                width: 50,
                height: 50,
                background: 'linear-gradient(135deg, #ff9a56 0%, #ff6b35 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
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
                    borderRadius: '25px',
                    fontSize: '16px',
                    background: 'white',
                    '& fieldset': {
                      borderColor: '#e9ecef',
                      borderWidth: '2px'
                    },
                    '&:hover fieldset': {
                      borderColor: '#ff9a56'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#ff9a56',
                      boxShadow: '0 0 0 3px rgba(255, 154, 86, 0.1)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '15px 20px',
                    color: '#2c3e50',
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
                background: 'linear-gradient(135deg, #ff9a56 0%, #ff6b35 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '25px',
                fontSize: '18px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
                marginBottom: '10px',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(255, 154, 86, 0.4)'
                },
                '&:disabled': {
                  opacity: 0.7,
                  cursor: 'not-allowed',
                  transform: 'none'
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
                border: '2px solid #e9ecef',
                color: '#6c757d',
                padding: '10px 20px',
                borderRadius: '20px',
                fontSize: '14px',
                cursor: 'pointer',
                textTransform: 'none',
                '&:hover': {
                  borderColor: '#ff9a56',
                  color: '#ff9a56'
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
                  color: '#f59e0b'
                }
              }}
            >
              Don't have an account? Sign Up
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Right Side - Image */}
      <Box sx={{
        flex: 1,
        background: 'linear-gradient(135deg, #fef5e7 0%, #fed7aa 100%)',
        display: 'flex',
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
            src="/right_login.png"
            alt="AI Interview Platform Illustration"
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'unset'
            }}
          />
        </Box>
      </Box>
    </Box>
  )
}

export default Login