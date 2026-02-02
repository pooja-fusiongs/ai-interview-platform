import React, { useState, ChangeEvent } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  FormControl,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox
} from '@mui/material'
import PersonIcon from '@mui/icons-material/Person'
import WorkIcon from '@mui/icons-material/Work'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser'
import { ApplicationFormData, Job } from '../../types'
import { showSuccess, showError, showLoading, dismissToast } from '../../utils/toast'

interface JobApplicationFormProps {
  open: boolean;
  onClose: () => void;
  job: Job | null;
  onApplicationSubmitted?: () => void; // Callback to refresh application status
}

const JobApplicationForm: React.FC<JobApplicationFormProps> = ({ open, onClose, job, onApplicationSubmitted }) => {
  const [formData, setFormData] = useState<ApplicationFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    experience: '',
    currentSalary: '',
    expectedSalary: '',
    noticePeriod: '',
    coverLetter: '',
    resume: null,
    portfolio: '',
    linkedin: '',
    github: '',
    agreeTerms: false
  })

  const [currentStep, setCurrentStep] = useState<number>(1)
  const totalSteps: number = 4
  const steps: string[] = ['Personal Info', 'Professional Details', 'Documents', 'Review & Submit']

  const handleInputChange = (field: keyof ApplicationFormData) => (event: ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [field]: event.target.value
    })
  }

  const handleSelectChange = (field: keyof ApplicationFormData) => (event: any) => {
    setFormData({
      ...formData,
      [field]: event.target.value
    })
  }

  const handleCheckboxChange = (field: keyof ApplicationFormData) => (event: ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [field]: event.target.checked
    })
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = event.target.files
    setFormData({
      ...formData,
      resume: files ? files[0] : null
    })
  }

  const handleNext = (): void => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = (): void => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async (): Promise<void> => {
    if (!job) return
    
    const loadingToast = showLoading('Submitting application...')
    
    try {
      console.log('🔍 Submitting job application for job ID:', job.id)
      
      // Prepare application data for API
      const applicationData = {
        job_id: job.id,
        applicant_name: `${formData.firstName} ${formData.lastName}`,
        applicant_email: formData.email,
        applicant_phone: formData.phone,
        resume_url: formData.resume ? 'uploaded_resume.pdf' : null, // Will be updated after upload
        cover_letter: formData.coverLetter,
        experience_years: formData.experience ? parseInt(formData.experience.split('-')[0]) : null,
        current_company: null, // Not collected in current form
        current_position: null, // Not collected in current form
        expected_salary: formData.expectedSalary,
        availability: formData.noticePeriod
      }
      
      // Call the job application API
      const response = await fetch('http://localhost:8000/api/job/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(applicationData)
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log('✅ Application submitted successfully:', result)
        
        // If resume is uploaded, process it
        if (formData.resume && result.id) {
          await handleResumeUploadAndParse(result.id, job.id)
        }
        
        // Dismiss loading toast and show success
        dismissToast(loadingToast)
        showSuccess('Application submitted successfully! AI questions are being generated for your interview. We will contact you soon.')
        
        // Call callback to refresh application status
        if (onApplicationSubmitted) {
          onApplicationSubmitted()
        }
      } else {
        const error = await response.json()
        console.error('❌ Application failed:', error)
        
        // Dismiss loading toast and show error
        dismissToast(loadingToast)
        showError(`Application failed: ${error.detail || 'Unknown error'}`)
      }
      
    } catch (error) {
      console.error('❌ Network error:', error)
      
      // Dismiss loading toast and show error
      dismissToast(loadingToast)
      showError('Network error. Please check your connection and try again.')
    }
    
    onClose()
    // Reset form
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      experience: '',
      currentSalary: '',
      expectedSalary: '',
      noticePeriod: '',
      coverLetter: '',
      resume: null,
      portfolio: '',
      linkedin: '',
      github: '',
      agreeTerms: false
    })
    setCurrentStep(1)
  }

  const handleResumeUploadAndParse = async (candidateId: number, jobId: number): Promise<void> => {
    if (!formData.resume) return
    
    try {
      console.log('📄 Uploading resume for candidate:', candidateId)
      
      // Create FormData for file upload
      const formDataUpload = new FormData()
      formDataUpload.append('file', formData.resume)
      formDataUpload.append('job_id', jobId.toString())
      
      // Upload resume
      const uploadResponse = await fetch(`http://localhost:8000/resume-upload/api/candidates/${candidateId}/resume/upload`, {
        method: 'POST',
        body: formDataUpload
      })
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json()
        console.log('✅ Resume uploaded successfully:', uploadResult)
        
        // Parse resume
        console.log('🔍 Parsing resume...')
        const parseResponse = await fetch(`http://localhost:8000/resume-parse/api/candidates/${candidateId}/resume/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        })
        
        if (parseResponse.ok) {
          const parseResult = await parseResponse.json()
          console.log('✅ Resume parsed successfully:', parseResult)
          console.log(`📊 Skills found: ${parseResult.skills.length}`)
          console.log(`📅 Experience: ${parseResult.total_experience_years} years (${parseResult.experience_level})`)
        } else {
          console.error('❌ Resume parsing failed')
        }
      } else {
        console.error('❌ Resume upload failed')
      }
    } catch (error) {
      console.error('❌ Resume processing error:', error)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px',mt:"10px" }}>
            {/* First Name & Last Name - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  First Name *
                </Typography>
                <TextField
                  fullWidth
                  placeholder="Enter your first name"
                  value={formData.firstName}
                  onChange={handleInputChange('firstName')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Last Name *
                </Typography>
                <TextField
                  fullWidth
                  placeholder="Enter your last name"
                  value={formData.lastName}
                  onChange={handleInputChange('lastName')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
            </Box>

            {/* Email & Phone - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Email Address *
                </Typography>
                <TextField
                  fullWidth
                  type="email"
                  placeholder="your.email@example.com"
                  value={formData.email}
                  onChange={handleInputChange('email')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Phone Number *
                </Typography>
                <TextField
                  fullWidth
                  placeholder="+1 (555) 123-4567"
                  value={formData.phone}
                  onChange={handleInputChange('phone')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
            </Box>

            {/* Address & City - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Street Address
                </Typography>
                <TextField
                  fullWidth
                  placeholder="123 Main Street, Apt 4B"
                  value={formData.address}
                  onChange={handleInputChange('address')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  City
                </Typography>
                <TextField
                  fullWidth
                  placeholder="New York"
                  value={formData.city}
                  onChange={handleInputChange('city')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
            </Box>

            {/* State & Zip Code - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  State
                </Typography>
                <TextField
                  fullWidth
                  placeholder="NY"
                  value={formData.state}
                  onChange={handleInputChange('state')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Zip Code
                </Typography>
                <TextField
                  fullWidth
                  placeholder="10001"
                  value={formData.zipCode}
                  onChange={handleInputChange('zipCode')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
            </Box>
          </Box>
        )

      case 2:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px',mt:"10px"  }}>
            {/* Experience & Notice Period - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Years of Experience *
                </Typography>
                <FormControl fullWidth>
                  <Select
                    value={formData.experience}
                    onChange={handleSelectChange('experience')}
                    displayEmpty
                    sx={{
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      '& .MuiSelect-select': { padding: '12px 16px', fontSize: '14px' }
                    }}
                  >
                    <MenuItem value="" disabled>Select Experience</MenuItem>
                    <MenuItem value="0-1">0-1 years (Entry Level)</MenuItem>
                    <MenuItem value="1-3">1-3 years (Junior)</MenuItem>
                    <MenuItem value="3-5">3-5 years (Mid Level)</MenuItem>
                    <MenuItem value="5-10">5-10 years (Senior)</MenuItem>
                    <MenuItem value="10+">10+ years (Expert)</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Notice Period *
                </Typography>
                <FormControl fullWidth>
                  <Select
                    value={formData.noticePeriod}
                    onChange={handleSelectChange('noticePeriod')}
                    displayEmpty
                    sx={{
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      '& .MuiSelect-select': { padding: '12px 16px', fontSize: '14px' }
                    }}
                  >
                    <MenuItem value="" disabled>Select Notice Period</MenuItem>
                    <MenuItem value="immediate">Immediate</MenuItem>
                    <MenuItem value="15-days">15 days</MenuItem>
                    <MenuItem value="1-month">1 month</MenuItem>
                    <MenuItem value="2-months">2 months</MenuItem>
                    <MenuItem value="3-months">3 months</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>

            {/* Current Salary & Expected Salary - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Current Salary (Optional)
                </Typography>
                <TextField
                  fullWidth
                  placeholder="e.g., $50,000"
                  value={formData.currentSalary}
                  onChange={handleInputChange('currentSalary')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Expected Salary *
                </Typography>
                <TextField
                  fullWidth
                  placeholder="e.g., $60,000"
                  value={formData.expectedSalary}
                  onChange={handleInputChange('expectedSalary')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
            </Box>

            {/* Cover Letter */}
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                Cover Letter
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={4}
                placeholder="Tell us why you're the perfect fit for this role..."
                value={formData.coverLetter}
                onChange={handleInputChange('coverLetter')}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    '&:hover': { borderColor: '#f59e0b' },
                    '&.Mui-focused': { 
                      borderColor: '#f59e0b',
                      boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                    }
                  },
                  '& .MuiOutlinedInput-input': {
                    padding: '12px 16px',
                    fontSize: '14px',
                    lineHeight: 1.5
                  }
                }}
              />
            </Box>
          </Box>
        )

      case 3:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px',mt:"10px"  }}>
            {/* Resume Upload */}
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                Upload Your Resume *
              </Typography>
              <Box sx={{
                border: '2px dashed #e2e8f0',
                borderRadius: '8px',
                padding: '32px',
                textAlign: 'center',
                backgroundColor: 'white',
                cursor: 'pointer',
                '&:hover': {
                  borderColor: '#f59e0b',
                  backgroundColor: 'rgba(245, 158, 11, 0.05)'
                }
              }}>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                  id="resume-upload"
                />
                <label htmlFor="resume-upload" style={{ cursor: 'pointer', width: '100%', display: 'block' }}>
                  <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                    {formData.resume ? '✅ Resume Uploaded!' : 'Click to browse or drag and drop'}
                  </Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '14px', marginBottom: '4px' }}>
                    {formData.resume ? formData.resume.name : 'Upload your resume here'}
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: '12px' }}>
                    Supported: PDF, DOC, DOCX (Max 10MB)
                  </Typography>
                </label>
              </Box>
            </Box>

            {/* Portfolio & LinkedIn - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Portfolio Website
                </Typography>
                <TextField
                  fullWidth
                  placeholder="https://yourportfolio.com"
                  value={formData.portfolio}
                  onChange={handleInputChange('portfolio')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  LinkedIn Profile
                </Typography>
                <TextField
                  fullWidth
                  placeholder="https://linkedin.com/in/yourprofile"
                  value={formData.linkedin}
                  onChange={handleInputChange('linkedin')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
            </Box>

            {/* GitHub & Other Links - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  GitHub Profile
                </Typography>
                <TextField
                  fullWidth
                  placeholder="https://github.com/yourusername"
                  value={formData.github}
                  onChange={handleInputChange('github')}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Other Links (Optional)
                </Typography>
                <TextField
                  fullWidth
                  placeholder="https://yourwebsite.com"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      '&:hover': { borderColor: '#f59e0b' },
                      '&.Mui-focused': { 
                        borderColor: '#f59e0b',
                        boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                      }
                    },
                    '& .MuiOutlinedInput-input': {
                      padding: '12px 16px',
                      fontSize: '14px'
                    }
                  }}
                />
              </Box>
            </Box>
          </Box>
        )

      case 4:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px',mt:"10px"  }}>
            {/* Application Summary */}
            <Box sx={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '20px' }}>
                Application Summary
              </Typography>
              
              {/* Summary Fields - Side by Side Layout */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Row 1: Full Name & Email */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Box>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                      Full Name:
                    </Typography>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                      {formData.firstName} {formData.lastName}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                      Email:
                    </Typography>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                      {formData.email}
                    </Typography>
                  </Box>
                </Box>

                {/* Row 2: Phone & Experience */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Box>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                      Phone:
                    </Typography>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                      {formData.phone}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                      Experience:
                    </Typography>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                      {formData.experience}
                    </Typography>
                  </Box>
                </Box>

                {/* Row 3: Expected Salary & Notice Period */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Box>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                      Expected Salary:
                    </Typography>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                      {formData.expectedSalary}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                      Notice Period:
                    </Typography>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                      {formData.noticePeriod}
                    </Typography>
                  </Box>
                </Box>

                {/* Row 4: Resume & Portfolio */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <Box>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                      Resume:
                    </Typography>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                      {formData.resume ? formData.resume.name : 'No resume uploaded'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                      Portfolio:
                    </Typography>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                      {formData.portfolio || 'Not provided'}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* Terms and Conditions */}
            <Box sx={{
              padding: '16px',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderRadius: '8px',
              border: '1px solid #fed7aa'
            }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.agreeTerms}
                    onChange={handleCheckboxChange('agreeTerms')}
                    sx={{
                      color: '#f59e0b',
                      '&.Mui-checked': { color: '#f59e0b' }
                    }}
                  />
                }
                label={
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                    I agree to the terms and conditions and privacy policy
                  </Typography>
                }
              />
            </Box>
          </Box>
        )

      default:
        return null
    }
  }

  if (!job) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: '16px',
            maxHeight: '90vh',
            width: '700px',
            height: '900px'
          }
        }
      }}
    >
      {/* Header */}
      <DialogTitle sx={{ padding: '24px 24px 0 24px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
              Apply for {job.title}
            </Typography>
            <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
              {job.company} • {job.location}
            </Typography>
          </Box>
          <IconButton onClick={onClose} sx={{ color: '#64748b',border:"1px solid #F5F5F5",borderRadius:"10px",padding:"0 10px" }}>
            ✕
          </IconButton>
        </Box>

        {/* Step Navigation */}
        <Box sx={{ marginTop: '20px' }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            paddingY: '20px', 
            maxWidth: '550px', 
            margin: '0 auto', 
            position: 'relative',
            paddingX: '20px'
          }}>
            {/* Background Line */}
            <Box sx={{
              position: 'absolute',
              top: '45px',
              left: '45px',
              right: '45px',
              height: '3px',
              backgroundColor: '#e2e8f0',
              zIndex: 1,
              borderRadius: '2px'
            }} />
            
            {/* Progress Line */}
            <Box sx={{
              position: 'absolute',
              top: '45px',
              left: '45px',
              width: `calc(${((currentStep - 1) / (steps.length - 1)) * 100}% - 0px)`,
              height: '3px',
              backgroundColor: '#f59e0b',
              zIndex: 1,
              borderRadius: '2px',
              transition: 'width 0.3s ease'
            }} />

            {steps.map((step, index) => (
              <Box key={index} sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                position: 'relative', 
                zIndex: 2,
                flex: 1,
                maxWidth: '120px'
              }}>
                {/* Step Circle with Icon */}
                <Box sx={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  backgroundColor: index + 1 <= currentStep ? '#f59e0b' : '#e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                  transition: 'all 0.3s ease',
                  border: index + 1 === currentStep ? '3px solid rgba(245, 158, 11, 0.3)' : 'none',
                  boxShadow: index + 1 === currentStep ? '0 0 0 6px rgba(245, 158, 11, 0.1)' : 'none'
                }}>
                  {index === 0 && (
                    <PersonIcon sx={{ 
                      color: index + 1 <= currentStep ? 'white' : '#94a3b8', 
                      fontSize: '22px' 
                    }} />
                  )}
                  {index === 1 && (
                    <WorkIcon sx={{ 
                      color: index + 1 <= currentStep ? 'white' : '#94a3b8', 
                      fontSize: '22px' 
                    }} />
                  )}
                  {index === 2 && (
                    <InsertDriveFileIcon sx={{ 
                      color: index + 1 <= currentStep ? 'white' : '#94a3b8', 
                      fontSize: '22px' 
                    }} />
                  )}
                  {index === 3 && (
                    <VerifiedUserIcon sx={{ 
                      color: index + 1 <= currentStep ? 'white' : '#94a3b8', 
                      fontSize: '22px' 
                    }} />
                  )}
                </Box>
                
                {/* Step Label */}
                <Typography sx={{
                  fontSize: '11px',
                  fontWeight: index + 1 === currentStep ? 700 : 500,
                  color: index + 1 <= currentStep ? '#f59e0b' : '#94a3b8',
                  textAlign: 'center',
                  lineHeight: 1.2,
                  maxWidth: '100px',
                  wordWrap: 'break-word'
                }}>
                  {step}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </DialogTitle>

      {/* Content */}
      <DialogContent sx={{ padding:'24px', backgroundColor: '#f8fafc', flex: 1, overflow: 'auto',mt:"20px" }}>
        {renderStepContent()}
      </DialogContent>

      {/* Footer */}
      <Box sx={{
        padding: '20px 24px',
        backgroundColor: 'white',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Button
          onClick={handlePrevious}
          disabled={currentStep === 1}
          sx={{
            color: '#64748b',
            backgroundColor: 'white',
            border: '1px solid #e2e8f0',
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            textTransform: 'none',
            '&:hover': { borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' },
            '&:disabled': { color: '#9ca3af', borderColor: '#f3f4f6' }
          }}
        >
          Previous
        </Button>

        <Box sx={{ display: 'flex', gap: '12px' }}>
          <Button
            onClick={onClose}
            sx={{
              color: '#64748b',
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              textTransform: 'none',
              '&:hover': { borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }
            }}
          >
            Cancel
          </Button>

          {currentStep < totalSteps ? (
            <Button
              onClick={handleNext}
              sx={{
                backgroundColor: '#f59e0b',
                color: 'white',
                padding: '10px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': { backgroundColor: '#d97706' }
              }}
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!formData.agreeTerms}
              sx={{
                backgroundColor: formData.agreeTerms ? '#f59e0b' : '#e2e8f0',
                color: formData.agreeTerms ? 'white' : '#9ca3af',
                padding: '10px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': formData.agreeTerms ? { backgroundColor: '#d97706' } : {},
                '&:disabled': { backgroundColor: '#e2e8f0', color: '#9ca3af' }
              }}
            >
              Submit Application
            </Button>
          )}
        </Box>
      </Box>
    </Dialog>
  )
}

export default JobApplicationForm