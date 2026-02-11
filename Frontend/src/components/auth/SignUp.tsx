import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './../../contexts/AuthContext'
import { showError, showSuccess } from '../../utils/toast'
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  InputAdornment,
  Select,
  MenuItem,
  FormControl
} from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'

const SignUp = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'recruiter' as string
  })
  const [loading, setLoading] = useState(false)

  const { signup } = useAuth()
  const navigate = useNavigate()

  // Add global error handler for debugging only
  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('🚨 Global error caught:', event.error)
      if (event.error && event.error.message) {
        showError(`Error: ${event.error.message}`)
      }
    }

    window.addEventListener('error', handleError)

    return () => {
      window.removeEventListener('error', handleError)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    e.stopPropagation()

    console.log('🔐 Signup form submitted, preventing default behavior')

    if (loading) {
      console.log('⏳ Already loading, ignoring submission')
      return
    }

    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
      showError('Please fill in all fields')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      showError('Passwords do not match!')
      return
    }

    if (formData.password.length < 6) {
      showError('Password must be at least 6 characters long!')
      return
    }

    setLoading(true)

    try {
      const result = await signup({
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: formData.role as any
      })

      if (result.success) {
        // Check if message indicates auto-login worked
        if (result.message?.includes('logged in')) {
          showSuccess('Account created and logged in successfully!')
          setTimeout(() => navigate('/dashboard'), 1500)
        } else {
          showSuccess('Account created successfully! Please login with your credentials.')
          setTimeout(() => navigate('/login'), 1500)
        }
      } else {
        // Check if user already exists
        if (result.message?.toLowerCase().includes('already exists') ||
          result.message?.toLowerCase().includes('already registered')) {
          showError('User already exists! Please login instead.')
        } else {
          showError(result.message || 'Signup failed')
        }
      }
    } catch (error) {
      console.error('❌ Signup error:', error)
      showError('An unexpected error occurred during signup')
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
        padding: { xs: '30px 20px', sm: '40px 30px', md: '60px 40px' },
        minHeight: { xs: '100vh', md: 'auto' }
      }}>
        <Box sx={{ width: '100%', maxWidth: { xs: '100%', sm: 400 }, textAlign: 'center' }}>
          {/* Profile Avatar */}
          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: { xs: '12px', md: '20px' }
          }}>
            <Box sx={{
              width: { xs: 80, md: 120 },
              height: { xs: 80, md: 120 },
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

          {/* Sign Up Title */}
          <Box sx={{ marginBottom: { xs: '16px', md: '20px' }, textAlign: 'left' }}>
            <Typography variant="h2" sx={{
              fontSize: { xs: '26px', sm: '30px', md: '36px' },
              fontWeight: 600,
              color: '#2c3e50',
              margin: '0 0 10px 0'
            }}>
              Sign Up
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
            {/* Full Name Field */}
            <Box sx={{
              position: 'relative',
              marginBottom: { xs: '16px', md: '25px' },
              display: 'flex',
              alignItems: 'center',
              gap: { xs: '10px', md: '15px' }
            }}>
              <Box sx={{
                width: { xs: 40, md: 50 },
                height: { xs: 40, md: 50 },
                background: 'linear-gradient(135deg, #020291 0%, #01016b 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '18px',
                flexShrink: 0
              }}>
                <i className="fas fa-user"></i>
              </Box>
              <TextField
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                required
                placeholder="Full Name"
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
                      borderColor: '#020291'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#020291',
                      boxShadow: '0 0 0 3px rgba(2, 2, 145, 0.15)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '15px 20px',
                    color: '#2c3e50'
                  }
                }}
              />
            </Box>

            {/* Email Field */}
            <Box sx={{
              position: 'relative',
              marginBottom: { xs: '16px', md: '25px' },
              display: 'flex',
              alignItems: 'center',
              gap: { xs: '10px', md: '15px' }
            }}>
              <Box sx={{
                width: { xs: 40, md: 50 },
                height: { xs: 40, md: 50 },
                background: 'linear-gradient(135deg, #020291 0%, #01016b 100%)',
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
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                placeholder="Email Address"
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
                      borderColor: '#020291'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#020291',
                      boxShadow: '0 0 0 3px rgba(2, 2, 145, 0.15)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '15px 20px',
                    color: '#2c3e50'
                  }
                }}
              />
            </Box>

            {/* Role Selector */}
            <Box sx={{
              position: 'relative',
              marginBottom: { xs: '16px', md: '25px' },
              display: 'flex',
              alignItems: 'center',
              gap: { xs: '10px', md: '15px' }
            }}>
              <Box sx={{
                width: { xs: 40, md: 50 },
                height: { xs: 40, md: 50 },
                background: 'linear-gradient(135deg, #020291 0%, #01016b 100%)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '18px',
                flexShrink: 0
              }}>
                <i className="fas fa-user-tag"></i>
              </Box>
              <FormControl fullWidth>
                <Select
                  name="role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  disabled={loading}
                  displayEmpty
                  sx={{
                    borderRadius: '25px',
                    fontSize: '16px',
                    background: 'white',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#e9ecef',
                      borderWidth: '2px'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#020291'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#020291',
                      boxShadow: '0 0 0 3px rgba(2, 2, 145, 0.15)'
                    },
                    '& .MuiSelect-select': {
                      padding: '15px 20px',
                      color: '#2c3e50'
                    }
                  }}
                >
                  <MenuItem value="candidate">Candidate</MenuItem>
                  <MenuItem value="recruiter">Recruiter</MenuItem>
                  {/* <MenuItem value="domain_expert">Domain Expert</MenuItem>
                  <MenuItem value="admin">Administrator</MenuItem> */}
                </Select>
              </FormControl>
            </Box>

            {/* Password Field */}
            <Box sx={{
              position: 'relative',
              marginBottom: { xs: '16px', md: '25px' },
              display: 'flex',
              alignItems: 'center',
              gap: { xs: '10px', md: '15px' }
            }}>
              <Box sx={{
                width: { xs: 40, md: 50 },
                height: { xs: 40, md: 50 },
                background: 'linear-gradient(135deg, #020291 0%, #01016b 100%)',
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
                placeholder="Password"
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
                            e.stopPropagation()
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
                      borderColor: '#020291'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#020291',
                      boxShadow: '0 0 0 3px rgba(2, 2, 145, 0.15)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '15px 20px',
                    color: '#2c3e50'
                  }
                }}
              />
            </Box>

            {/* Confirm Password Field */}
            <Box sx={{
              position: 'relative',
              marginBottom: { xs: '16px', md: '25px' },
              display: 'flex',
              alignItems: 'center',
              gap: { xs: '10px', md: '15px' }
            }}>
              <Box sx={{
                width: { xs: 40, md: 50 },
                height: { xs: 40, md: 50 },
                background: 'linear-gradient(135deg, #020291 0%, #01016b 100%)',
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
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                placeholder="Confirm Password"
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
                            e.stopPropagation()
                            setShowConfirmPassword(!showConfirmPassword)
                          }}
                          edge="end"
                          disabled={!formData.confirmPassword}
                          sx={{
                            color: formData.confirmPassword ? '#6c757d' : '#d1d5db',
                            cursor: formData.confirmPassword ? 'pointer' : 'not-allowed'
                          }}
                        >
                          {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
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
                      borderColor: '#020291'
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: '#020291',
                      boxShadow: '0 0 0 3px rgba(2, 2, 145, 0.15)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '15px 20px',
                    color: '#2c3e50'
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
                background: 'linear-gradient(135deg, #020291 0%, #01016b 100%)',
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
                  boxShadow: '0 8px 25px rgba(2, 2, 145, 0.3)'
                },
                '&:disabled': {
                  opacity: 0.7,
                  cursor: 'not-allowed',
                  transform: 'none'
                }
              }}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </Box>

          {/* Login Link */}
          <Box sx={{ marginTop: '20px' }}>
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                navigate('/login')
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
              Already have an account? Sign In
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
              objectFit: 'unset'
            }}
          />
        </Box>
      </Box>
    </Box>
  )
}

export default SignUp