import React, { useState, useEffect } from 'react'
import {
  Box,
  Container,
  Typography,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
  InputLabel,
  Avatar,
  IconButton,
  Stack,
  Card,
  Switch,
  Tabs,
  Tab,
  Paper,
  LinearProgress
} from '@mui/material'
import Grid from '@mui/material/GridLegacy'
import {
  ArrowBack,
  Save,
  PhotoCamera,
  Add,
  Lock,
  Work,
  School,
  Security,
  Info,
  Description,
  CloudUpload
} from '@mui/icons-material'
import { toast } from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { candidateProfileService } from '../../services/candidateProfileService'
import { CandidateProfileData, EducationData } from '../../types'
import Navigation from '../layout/sidebar'

const CandidateProfileEdit: React.FC = () => {
  const [profile, setProfile] = useState<CandidateProfileData>({
    id: 0,
    email: '',
    full_name: '',
    mobile: '',
    gender: 'male',
    location: '',
    bio: '',
    education: [],
    has_internship: false,
    internship_company: '',
    internship_position: '',
    internship_duration: '',
    internship_salary: '',
    skills: [],
    languages: [],
    preferred_location: '',
    preferred_job_title: '',
    preferred_job_type: 'full-time',
    profile_image: '',
    resume_url: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [activeTab, setActiveTab] = useState(0)
  const navigate = useNavigate()

  // File upload handler for profile image
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      try {
        // Show loading state
        toast.loading('Uploading profile image...')
        
        // Upload image to server
        const imageUrl = await candidateProfileService.uploadProfileImage(file)
        
        // Update profile state with the server URL (store relative URL)
        handleInputChange('profile_image', imageUrl)
        
        // Show success message
        toast.dismiss()
        toast.success('Profile image updated successfully!')
      } catch (error) {
        console.error('Error uploading profile image:', error)
        toast.dismiss()
        toast.error('Failed to upload profile image')
      }
    }
  }

  // File upload handler for resume (from input element)
  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      await uploadResumeFile(file)
    }
  }

  // Direct file upload handler for drag-and-drop
  const uploadResumeFile = async (file: File) => {
    try {
      // Show loading state
      toast.loading('Uploading resume...')
      
      // Upload resume to server
      const resumeUrl = await candidateProfileService.uploadResume(file)
      
      // Update profile state with the server URL
      handleInputChange('resume_url', resumeUrl)
      
      // Show success message
      toast.dismiss()
      toast.success('Resume uploaded successfully!')
    } catch (error) {
      console.error('Error uploading resume:', error)
      toast.dismiss()
      toast.error('Failed to upload resume')
    }
  }

  // Helper function to format names
  const formatName = (name: string): string => {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  const jobTypes = [
    { value: 'full-time', label: 'Full Time' },
    { value: 'part-time', label: 'Part Time' },
    { value: 'contract', label: 'Contract' },
    { value: 'internship', label: 'Internship' },
    { value: 'freelance', label: 'Freelance' }
  ]

  // Calculate profile completion
  // const calculateCompletion = () => {
  //   const fields = [
  //     profile.full_name,
  //     profile.email,
  //     profile.mobile,
  //     profile.location,
  //     profile.bio,
  //     profile.preferred_job_title,
  //     profile.preferred_location,
  //     profile.skills?.length > 0,
  //     profile.languages?.length > 0,
  //     profile.education?.length > 0
  //   ]
  //   const completed = fields.filter(field => field && field !== '').length
  //   return Math.round((completed / fields.length) * 100)
  // }

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        const profileData = await candidateProfileService.getProfile()

        setProfile({
          id: profileData.id || 0,
          email: profileData.email || '',
          full_name: profileData.full_name || '',
          mobile: profileData.mobile || '',
          gender: profileData.gender || 'male',
          location: profileData.location || '',
          bio: profileData.bio || '',
          education: profileData.education || [],
          has_internship: profileData.has_internship || false,
          internship_company: profileData.internship_company || '',
          internship_position: profileData.internship_position || '',
          internship_duration: profileData.internship_duration || '',
          internship_salary: profileData.internship_salary || '',
          skills: profileData.skills || [],
          languages: profileData.languages || [],
          preferred_location: profileData.preferred_location || '',
          preferred_job_title: profileData.preferred_job_title || '',
          preferred_job_type: profileData.preferred_job_type || 'full-time',
          profile_image: profileData.profile_image || '',
          resume_url: profileData.resume_url || ''
        })
      } catch (error) {
        console.error('Error loading profile:', error)
        toast.error('Failed to load profile data')
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [])

  const handleInputChange = (field: string, value: any) => {
    setProfile(prev => ({ ...prev, [field]: value }))
  }

  const handleEducationChange = (index: number, field: string, value: string) => {
    const updatedEducation = [...profile.education]
    updatedEducation[index] = { ...updatedEducation[index], [field]: value }
    setProfile(prev => ({ ...prev, education: updatedEducation }))
  }

  const addEducation = () => {
    const newEducation: EducationData = {
      degree: '',
      institution: '',
      year: '',
      grade: ''
    }
    setProfile(prev => ({ ...prev, education: [...prev.education, newEducation] }))
  }

  const removeEducation = (index: number) => {
    const updatedEducation = profile.education.filter((_, i) => i !== index)
    setProfile(prev => ({ ...prev, education: updatedEducation }))
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await candidateProfileService.updateProfile(profile)
      toast.success('Profile updated successfully!')
      navigate('/candidate-profile')
    } catch (error) {
      console.error('Error saving profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    console.log('🔐 Password change initiated');
    
    // Check if user is authenticated
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('You must be logged in to change password');
      return;
    }
    console.log('🔑 Token found:', token ? 'Yes' : 'No');
    
    // Get current user info for debugging
    try {
      const currentUser = await candidateProfileService.getCurrentUser();
      console.log('👤 Current user:', currentUser);
    } catch (e) {
      console.log('❌ Could not get current user:', e);
    }
    
    if (!oldPassword || !newPassword) {
      toast.error('Please fill in both password fields')
      return
    }

    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long')
      return
    }

    if (oldPassword === newPassword) {
      toast.error('New password must be different from current password')
      return
    }

    try {
      console.log('🔐 Calling changePassword service...');
      console.log('🔐 Old password length:', oldPassword.length);
      console.log('🔐 New password length:', newPassword.length);
      
      setChangingPassword(true)
      await candidateProfileService.changePassword(oldPassword, newPassword)
      console.log('✅ Password changed successfully');
      toast.success('Password changed successfully!')
      setOldPassword('')
      setNewPassword('')
    } catch (error: any) {
      console.error('❌ Error changing password:', error)
      console.error('❌ Error response:', error.response);
      console.error('❌ Error status:', error.response?.status);
      console.error('❌ Error data:', error.response?.data);
      
      let errorMessage = 'Failed to change password';
      
      if (error.response?.status === 401) {
        errorMessage = 'You are not authenticated. Please log in again.';
      } else if (error.response?.status === 400) {
        errorMessage = error.response.data?.detail || 'Invalid password data';
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage)
    } finally {
      setChangingPassword(false)
    }
  }

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
  }

  // Tab Content Components (Updated for right column only)
  const BasicInformationTabContent = () => (
    <Box sx={{ p: 4 }}>
      <Stack spacing={4}>
        {/* Personal Information */}
        <Box >


          <Grid container spacing={4} mt={2}>
            <Grid xs={12} sm={6} p={1}>
              <TextField
                fullWidth
                label="Full Name"
                value={profile.full_name || ''}
                onChange={(e) => handleInputChange('full_name', e.target.value)}
                required
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&:hover fieldset': { borderColor: '#f59e0b' },
                    '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                  },
                  '& .MuiInputLabel-root': {
                    fontWeight: 500,
                    color: '#374151'
                  }
                }}
              />
            </Grid>
            <Grid xs={12} sm={6} p={1}>
              <TextField
                fullWidth
                label="Email Address"
                value={profile.email || ''}
                onChange={(e) => handleInputChange('email', e.target.value)}
                type="email"
                required
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&:hover fieldset': { borderColor: '#f59e0b' },
                    '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                  }
                }}
              />
            </Grid>
            <Grid xs={12} sm={6} p={1}>
              <TextField
                fullWidth
                label="Mobile Number"
                value={profile.mobile || ''}
                onChange={(e) => handleInputChange('mobile', e.target.value)}
                required
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&:hover fieldset': { borderColor: '#f59e0b' },
                    '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                  }
                }}
              />
            </Grid>
            <Grid xs={12} sm={6} p={1}>
              <TextField
                fullWidth
                label="Location"
                value={profile.location || ''}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="City, State"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&:hover fieldset': { borderColor: '#f59e0b' },
                    '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                  }
                }}
              />
            </Grid>
            <Grid xs={12} p={1}>
              <FormControl component="fieldset">
                <FormLabel
                  component="legend"
                  sx={{
                    fontWeight: 600,
                    color: '#374151',
                    mb: 2, ml: "10px"
                  }}
                >
                  Gender
                </FormLabel>
                <RadioGroup
                  row
                  value={profile.gender || 'male'}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                  sx={{
                    '& .MuiFormControlLabel-root': {
                      mr: 4,
                      ml: "7px",
                      '& .MuiRadio-root': {
                        color: '#f59e0b',
                        '&.Mui-checked': {
                          color: '#f59e0b'
                        }
                      }
                    }
                  }}
                >
                  <FormControlLabel value="male" control={<Radio />} label="Male" />
                  <FormControlLabel value="female" control={<Radio />} label="Female" />
                  <FormControlLabel value="other" control={<Radio />} label="Other" />
                </RadioGroup>
              </FormControl>
            </Grid>
            <Grid xs={12} p={1}>
              <TextField
                fullWidth
                label="Bio / Introduction"
                value={profile.bio || ''}
                onChange={(e) => handleInputChange('bio', e.target.value)}
                multiline
                rows={4}
                placeholder="Write a compelling introduction about yourself, your skills, and career goals..."
                helperText="please write about yourself in 2-3 sentences"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    ml: "10px",
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&:hover fieldset': { borderColor: '#f59e0b' },
                    '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                  }
                }}
              />
            </Grid>
          </Grid>
        </Box>
      </Stack>
    </Box>
  )

  const JobPreferencesTab = () => (
    <Box sx={{ p: 4 }}>
      <Stack spacing={4}>
        {/* Job Preferences Card */}
        <Box >


          <Grid container spacing={4} mt={2}>
            <Grid xs={12} sm={6} p={1}>
              <TextField
                fullWidth
                label="Preferred Job Title"
                value={profile.preferred_job_title || ''}
                onChange={(e) => handleInputChange('preferred_job_title', e.target.value)}
                placeholder="e.g., Software Developer"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&:hover fieldset': { borderColor: '#f59e0b' },
                    '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                  }
                }}
              />
            </Grid>
            <Grid xs={12} sm={6} p={1}>
              <TextField
                fullWidth
                label="Preferred Location"
                value={profile.preferred_location || ''}
                onChange={(e) => handleInputChange('preferred_location', e.target.value)}
                placeholder="e.g., Bangalore, Mumbai, Remote"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&:hover fieldset': { borderColor: '#f59e0b' },
                    '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                  }
                }}
              />
            </Grid>
            <Grid xs={12} sm={6} p={1}>
              <FormControl fullWidth>
                <InputLabel sx={{ fontWeight: 500 }}>Job Type</InputLabel>
                <Select
                  value={profile.preferred_job_type || 'full-time'}
                  onChange={(e) => handleInputChange('preferred_job_type', e.target.value)}
                  label="Job Type"
                  sx={{
                    borderRadius: 3,
                    '& .MuiOutlinedInput-notchedOutline': { 
                      borderColor: '#e2e8f0 !important' 
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': { 
                      borderColor: '#f59e0b !important' 
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { 
                      borderColor: '#f59e0b !important', 
                      borderWidth: '2px !important' 
                    },
                    '& .MuiSelect-select:focus': {
                      backgroundColor: 'transparent'
                    }
                  }}
                >
                  {jobTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid sm={12} xs={12} sx={{p:"10px"}}>
                 {/* Resume Upload Section */}
                    <Box sx={{}}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                       
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1e293b' }}>
                            Resume
                          </Typography>
                          
                        </Box>
                      </Box>

                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={handleResumeUpload}
                        style={{ display: 'none' }}
                        id="resume-upload-main"
                      />
                      
                      {/* Drag and Drop Area */}
                      <Box
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.currentTarget.style.borderColor = '#f59e0b'
                          e.currentTarget.style.backgroundColor = '#f0f9ff'
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault()
                          e.currentTarget.style.borderColor = '#e2e8f0'
                          e.currentTarget.style.backgroundColor = '#fafbfc'
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.currentTarget.style.borderColor = '#e2e8f0'
                          e.currentTarget.style.backgroundColor = '#fafbfc'
                          const files = e.dataTransfer.files
                          if (files.length > 0) {
                            const file = files[0]
                            if (file.type === 'application/pdf' || 
                                file.type === 'application/msword' || 
                                file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                              // Use the direct file upload function
                              uploadResumeFile(file)
                            } else {
                              toast.error('Please upload a PDF or Word document')
                            }
                          }
                        }}
                        onClick={() => document.getElementById('resume-upload-main')?.click()}
                        sx={{
                          border: profile.resume_url ? '2px solid #bbf7d0' : '2px dashed #e2e8f0',
                          borderRadius: 3,
                          bgcolor: profile.resume_url ? '#f0fdf4' : '#fafbfc',
                          p: 4,
                          textAlign: 'center',
                          cursor: 'pointer',
                          mb: 2,
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            borderColor: profile.resume_url ? '#16a34a' : '#0ea5e9',
                            bgcolor: profile.resume_url ? '#dcfce7' : '#f0f9ff'
                          }
                        }}
                      >
                        {profile.resume_url ? (
                          // Success state - show inside the box
                          <>
                            <Description sx={{ fontSize: 48, color: '#16a34a', mb: 2 }} />
                            <Typography variant="h6" sx={{ color: '#16a34a', mb: 1, fontWeight: 600 }}>
                              ✓ Resume uploaded successfully
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#16a34a', mb: 2 }}>
                              Click to update or drag a new file
                            </Typography>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.open(`http://localhost:8000${profile.resume_url}`, '_blank')
                              }}
                              sx={{ 
                                textTransform: 'none',
                                color: '#16a34a',
                                borderColor: '#16a34a',
                                '&:hover': { 
                                  bgcolor: '#dcfce7',
                                  borderColor: '#16a34a'
                                }
                              }}
                            >
                              View Resume
                            </Button>
                          </>
                        ) : (
                          // Default state - show upload prompt
                          <>
                            <CloudUpload sx={{ fontSize: 48, color: '#94a3b8', mb: 2 }} />
                            <Typography variant="h6" sx={{ color: '#374151', mb: 1, fontWeight: 600 }}>
                              Click to browse or drag and drop
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#94a3b8', mb: 1 }}>
                              Upload your resume here
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                              Supported: PDF, DOC, DOCX (Max 10MB)
                            </Typography>
                          </>
                        )}
                      </Box>
                      
                    </Box>
            </Grid>
          </Grid>
        </Box>

        {/* Work Experience Card */}
        <Box >


          <FormControlLabel
            control={
              <Switch
                checked={profile.has_internship}
                onChange={(e) => handleInputChange('has_internship', e.target.checked)}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: '#64748b',
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: '#64748b',
                  },
                }}
              />
            }
            label={
              <Typography sx={{ fontWeight: 500, fontSize: '1.1rem' }}>
                I have internship/work experience
              </Typography>
            }
            sx={{ mb: 3 }}
          />

          {profile.has_internship && (
            <Card
              variant="outlined"
              sx={{
                borderRadius: 3,
                borderColor: '#d1fae5',
                bgcolor: '#f0fdf4',
                p: 3
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, color: '#065f46' }}>
                Experience Details
              </Typography>

              <Grid container spacing={3}>
                <Grid xs={12} sm={6} p={1}>
                  <TextField
                    fullWidth
                    label="Company Name"
                    value={profile.internship_company || ''}
                    onChange={(e) => handleInputChange('internship_company', e.target.value)}
                    placeholder="e.g., Google Inc."
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        bgcolor: 'white',
                        '& fieldset': { borderColor: '#e2e8f0' },
                        '&:hover fieldset': { borderColor: '#f59e0b' },
                        '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                      }
                    }}
                  />
                </Grid>
                <Grid xs={12} sm={6} p={1}>
                  <TextField
                    fullWidth
                    label="Position/Role"
                    value={profile.internship_position || ''}
                    onChange={(e) => handleInputChange('internship_position', e.target.value)}
                    placeholder="e.g., Software Developer Intern"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        bgcolor: 'white',
                        '& fieldset': { borderColor: '#e2e8f0' },
                        '&:hover fieldset': { borderColor: '#f59e0b' },
                        '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                      }
                    }}
                  />
                </Grid>
                <Grid xs={12} sm={6} p={1}>
                  <TextField
                    fullWidth
                    label="Duration"
                    value={profile.internship_duration || ''}
                    onChange={(e) => handleInputChange('internship_duration', e.target.value)}
                    placeholder="e.g., 3 months (Jun 2023 - Aug 2023)"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        bgcolor: 'white',
                        '& fieldset': { borderColor: '#e2e8f0' },
                        '&:hover fieldset': { borderColor: '#f59e0b' },
                        '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                      }
                    }}
                  />
                </Grid>
                <Grid xs={12} sm={6} p={1}>
                  <TextField
                    fullWidth
                    label="Salary/Stipend"
                    value={profile.internship_salary || ''}
                    onChange={(e) => handleInputChange('internship_salary', e.target.value)}
                    placeholder="e.g., ₹25,000/month"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: 2,
                        bgcolor: 'white',
                        '& fieldset': { borderColor: '#e2e8f0' },
                        '&:hover fieldset': { borderColor: '#f59e0b' },
                        '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                      }
                    }}
                  />
                </Grid>
              </Grid>
            </Card>
          )}
        </Box>
      </Stack>
    </Box>
  )

  const SkillsEducationTab = () => (
    <Box sx={{ p: 4 }}>
      <Stack spacing={4}>
        {/* Skills Section */}
        <Box >


          <TextField
            fullWidth
            label="Technical Skills"
            value={Array.isArray(profile.skills) ? profile.skills.join(', ') : profile.skills || ''}
            onChange={(e) => {
              const skillsString = e.target.value
              const skillsArray = skillsString.split(',').map(skill => skill.trim()).filter(skill => skill !== '')
              handleInputChange('skills', skillsArray)
            }}
            placeholder="e.g., JavaScript, Python, React, Node.js, SQL"
            helperText="Enter your skills separated by commas"
            multiline
            rows={3}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                '& fieldset': { borderColor: '#e2e8f0' },
                '&:hover fieldset': { borderColor: '#f59e0b' },
                '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
              }
            }}
          />
        </Box>

        {/* Languages Section */}
        <Box sx={{ mt: 6 }}>


          <TextField
            fullWidth
            label="Languages Known"
            value={Array.isArray(profile.languages) ? profile.languages.join(', ') : profile.languages || ''}
            onChange={(e) => {
              const languagesString = e.target.value
              const languagesArray = languagesString.split(',').map(lang => lang.trim()).filter(lang => lang !== '')
              handleInputChange('languages', languagesArray)
            }}
            placeholder="e.g., English, Hindi, Spanish, French"
            helperText="Enter languages you know separated by commas"
            multiline
            rows={2}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 3,
                '& fieldset': { borderColor: '#e2e8f0' },
                '&:hover fieldset': { borderColor: '#f59e0b' },
                '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
              }
            }}
          />
        </Box>

        {/* Education Section */}
        <Box sx={{}}>


          {profile.education.length > 0 && profile.education.map((edu, index) => (
            <Box
              key={index}
              sx={{
                mb: 3
              }}
            >
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 3,
                  borderColor: '#e2e8f0',
                  bgcolor: '#fafbfc'
                }}
              >
                <Box sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#374151' }}>
                      Education {index + 1}
                    </Typography>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => removeEducation(index)}
                      sx={{ textTransform: 'none' }}
                    >
                      Remove
                    </Button>
                  </Box>

                  <Grid container spacing={3}>
                    <Grid xs={12} sm={6} p={1}>
                      <TextField
                        fullWidth
                        label="Degree/Course"
                        value={edu.degree || ''}
                        onChange={(e) => handleEducationChange(index, 'degree', e.target.value)}
                        placeholder="e.g., B.Tech Computer Science"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            bgcolor: 'white',
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&:hover fieldset': { borderColor: '#f59e0b' },
                            '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                          }
                        }}
                      />
                    </Grid>
                    <Grid xs={12} sm={6} p={1}>
                      <TextField
                        fullWidth
                        label="Institution"
                        value={edu.institution || ''}
                        onChange={(e) => handleEducationChange(index, 'institution', e.target.value)}
                        placeholder="e.g., ABC University"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            bgcolor: 'white',
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&:hover fieldset': { borderColor: '#f59e0b' },
                            '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                          }
                        }}
                      />
                    </Grid>
                    <Grid xs={12} sm={6} p={1}>
                      <TextField
                        fullWidth
                        label="Year of Completion"
                        value={edu.year || ''}
                        onChange={(e) => handleEducationChange(index, 'year', e.target.value)}
                        placeholder="e.g., 2024"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            bgcolor: 'white',
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&:hover fieldset': { borderColor: '#f59e0b' },
                            '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                          }
                        }}
                      />
                    </Grid>
                    <Grid xs={12} sm={6} p={1}>
                      <TextField
                        fullWidth
                        label="Grade/CGPA"
                        value={edu.grade || ''}
                        onChange={(e) => handleEducationChange(index, 'grade', e.target.value)}
                        placeholder="e.g., 8.5 CGPA"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            bgcolor: 'white',
                            '& fieldset': { borderColor: '#e2e8f0' },
                            '&:hover fieldset': { borderColor: '#f59e0b' },
                            '&.Mui-focused fieldset': { borderColor: '#f59e0b', borderWidth: 2 }
                          }
                        }}
                      />
                    </Grid>
                  </Grid>
                </Box>
              </Card>
            </Box>
          ))}

          {/* Add Education Button */}
          <Box sx={{ textAlign: 'center', mt: 3 }}>
            <Button
              startIcon={<Add />}
              onClick={addEducation}
              variant="outlined"
              sx={{
                textTransform: 'none',
                borderRadius: 3,
                borderColor: '#6366f1',
                color: '#6366f1',
                fontWeight: 600,
                px: 4,
                py: 1.5,
                '&:hover': { 
                  bgcolor: '#f0f9ff',
                  borderColor: '#4f46e5',
                  color: '#4f46e5'
                }
              }}
            >
              Add Education
            </Button>
          </Box>

          {profile.education.length === 0 && (
            <Paper
              elevation={0}
              sx={{
                textAlign: 'center',
                py: 6,
                border: '2px dashed #c7d2fe',
                borderRadius: 3,
                bgcolor: '#f8faff'
              }}
            >
              <School sx={{ fontSize: 64, color: '#a5b4fc', mb: 2 }} />
              <Typography variant="h6" sx={{ color: '#6366f1', mb: 2, fontWeight: 600 }}>
                No education details added yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Add your educational background to complete your profile
              </Typography>
              <Button
                startIcon={<Add />}
                onClick={addEducation}
                variant="contained"
                sx={{
                  textTransform: 'none',
                  borderRadius: 3,
                  bgcolor: '#6366f1',
                  fontWeight: 600,
                  px: 4,
                  py: 1.5,
                  '&:hover': { bgcolor: '#4f46e5' }
                }}
              >
                Add Your First Education
              </Button>
            </Paper>
          )}
        </Box>
      </Stack>
    </Box>
  )

  if (loading) {
    return (
      <Navigation>
        <Container maxWidth="xl" sx={{ py: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <Stack alignItems="center" spacing={3}>
              <LinearProgress sx={{ width: 200, borderRadius: 2 }} />
              <Typography variant="h6" color="text.secondary">
                Loading profile...
              </Typography>
            </Stack>
          </Box>
        </Container>
      </Navigation>
    )
  }

  return (
    <Navigation>
      <Box sx={{
        bgcolor: '#f8fafc',
        fontFamily: '"Inter", "Roboto", sans-serif'
      }}>
        <Container maxWidth="xl" sx={{ py: "10px" }}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: "20px" }}>
            <Button
              startIcon={<ArrowBack />}
              onClick={() => navigate('/candidate-profile')}
              sx={{
                textTransform: 'none',
                color: '#f59e0b',
                fontSize: '1rem',
                fontWeight: 500,
                border: "1px solid #f59e0b",
                '&:hover': {
                  bgcolor: 'transparent',
                  color: '#f59e0b'
                }
              }}
            >
              Back to Profile
            </Button>
          </Box>


          {/* Two Column Layout */}
          <Grid container spacing={4}>
            {/* Left Column - Fixed Profile Photo & Account Management */}
            <Grid item xs={12} lg={4} >
              <Card
                elevation={0}
                sx={{
                  borderRadius: 4,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
                  overflow: 'hidden',
                  position: 'sticky',
                  top: 24
                }}
              >
                {/* Profile Photo Section - Clean and Simple */}
                <Box sx={{ p: 4, textAlign: 'center', bgcolor: 'white', borderBottom: '1px solid #e2e8f0' }}>
                  <Box sx={{ position: 'relative', display: 'inline-block', mb: 3 }}>
                    <Avatar
                      src={profile.profile_image ? `http://localhost:8000${profile.profile_image}` : undefined}
                      sx={{
                        width: 120,
                        height: 120,
                        border: '3px solid #e2e8f0',
                        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
                        fontSize: '2.5rem',
                        fontWeight: 600,
                        bgcolor: '#64748b',
                        color: 'white',
                        mx: 'auto'
                      }}
                    >
                      {profile.full_name?.charAt(0).toUpperCase() || 'U'}
                    </Avatar>
                    <IconButton
                      component="label"
                      sx={{
                        position: 'absolute',
                        bottom: 5,
                        right: 5,
                        bgcolor: '#64748b',
                        color: 'white',
                        width: 32,
                        height: 32,
                        border: '2px solid white',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                        '&:hover': {
                          bgcolor: '#475569',
                          transform: 'scale(1.05)'
                        },
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <PhotoCamera sx={{ fontSize: 14 }} />
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        onChange={handleImageUpload}
                      />
                    </IconButton>
                  </Box>

                  <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: '#1e293b' }}>
                    {formatName(profile.full_name || 'Your Name')}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748b', mb: 3 }}>
                    {profile.preferred_job_title || 'Professional Title'}
                  </Typography>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                    id="profile-image-upload"
                  />
              
              
                </Box>

                {/* Account Management Section */}
                <Box sx={{ p: 4 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                    <Box sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      bgcolor: '#fef2f2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Security sx={{ color: '#ef4444', fontSize: 20 }} />
                    </Box>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: '#1e293b' }}>
                        Account Management
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#64748b' }}>
                        Security settings
                      </Typography>
                    </Box>
                  </Box>

                  <Stack spacing={3}>
                    <TextField
                      fullWidth
                      type="password"
                      label="Current Password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 3,
                          '& fieldset': { borderColor: '#e2e8f0' },
                          '&:hover fieldset': { borderColor: '#ef4444' },
                          '&.Mui-focused fieldset': { borderColor: '#ef4444', borderWidth: 2 }
                        }
                      }}
                    />
                    <TextField
                      fullWidth
                      type="password"
                      label="New Password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: 3,
                          '& fieldset': { borderColor: '#e2e8f0' },
                          '&:hover fieldset': { borderColor: '#ef4444' },
                          '&.Mui-focused fieldset': { borderColor: '#ef4444', borderWidth: 2 }
                        }
                      }}
                    />
                    <Button
                      variant="contained"
                      startIcon={<Lock />}
                      onClick={handleChangePassword}
                      disabled={changingPassword}
                      sx={{
                        textTransform: 'none',
                        borderRadius: 3,
                        bgcolor: '#ef4444',
                        fontWeight: 600,
                        py: 1.5,
                        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                        '&:hover': {
                          bgcolor: '#dc2626',
                          transform: 'translateY(-1px)',
                          boxShadow: '0 6px 16px rgba(239, 68, 68, 0.4)'
                        },
                        '&:disabled': {
                          bgcolor: '#9ca3af',
                          transform: 'none',
                          boxShadow: 'none'
                        },
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {changingPassword ? 'Updating Password...' : 'Update Password'}
                    </Button>

                 
                  </Stack>
                </Box>
              </Card>
            </Grid>

            {/* Right Column - Tabbed Content */}
            <Grid item xs={12} lg={8}>
              <Card
                elevation={0}
                sx={{
                  borderRadius: 4,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
                  overflow: 'hidden'
                }}
              >
                {/* Tabs */}
                <Box sx={{
                  borderBottom: '1px solid #e2e8f0',
                  bgcolor: '#fafbfc'
                }}>
                  <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    sx={{
                      px: 3,
                      '& .MuiTab-root': {
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '1.1rem',
                        minHeight: 72,
                        color: '#64748b',
                        px: 4,
                        py: 3,
                        transition: 'all 0.3s ease',
                        '&.Mui-selected': {
                          color: '#f59e0b',
                          fontWeight: 700
                        },
                        '&:hover': {
                          color: '#f59e0b',
                          bgcolor: 'rgba(59, 130, 246, 0.05)',
                          transform: 'translateY(-2px)'
                        }
                      },
                      '& .MuiTabs-indicator': {
                        backgroundColor: '#f59e0b',
                        height: 4,
                        borderRadius: '2px 2px 0 0'
                      }
                    }}
                  >
                    <Tab
                      icon={<Info sx={{ fontSize: 24 }} />}
                      label="Basic Information"
                      iconPosition="start"
                    />
                    <Tab
                      icon={<Work sx={{ fontSize: 24 }} />}
                      label="Job Preferences"
                      iconPosition="start"
                    />
                    <Tab
                      icon={<School sx={{ fontSize: 24 }} />}
                      label="Skills & Education"
                      iconPosition="start"
                    />
                  </Tabs>
                </Box>

                {/* Tab Content */}
                <Box sx={{ minHeight: 600 }}>
                  {activeTab === 0 && <BasicInformationTabContent />}
                  {activeTab === 1 && <JobPreferencesTab />}
                  {activeTab === 2 && <SkillsEducationTab />}
                </Box>

                {/* Save Button Inside Card */}
                <Box sx={{
                  p: " 20px 10px",
                  borderTop: '1px solid #e2e8f0',
                  bgcolor: '#fafbfc',
                  display: 'flex',
                  justifyContent: 'center'
                }}>
                  <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving}
                    startIcon={<Save />}
                    size="large"
                    sx={{
                      background: 'rgba(245, 158, 11, 0.1)',
                      color: '#f59e0b',
                      border: '2px solid #f59f0baf',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      textTransform: 'none',
                      '&:hover': {
                        background: 'rgba(245, 158, 11, 0.1)',
                        borderColor: '#f59e0b',
                        transform: 'translateY(-1px)',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                      }
                    }}
                  >
                    {saving ? 'Saving Changes...' : 'Save All Changes'}
                  </Button>
                </Box>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Navigation>
  )
}

export default CandidateProfileEdit