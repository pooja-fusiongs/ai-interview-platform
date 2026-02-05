import React, { useState } from 'react'
import {
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  Dialog,
  DialogContent,
  IconButton,
  Chip
} from '@mui/material'
import WorkIcon from '@mui/icons-material/Work'
import DescriptionIcon from '@mui/icons-material/Description'
import InterviewIcon from '@mui/icons-material/Quiz'
import { JobFormData, Job } from '../../types'
import { showSuccess, showError, showLoading, dismissToast } from '../../utils/toast'
import { apiClient } from '../../services/api'

interface JobCreationFormProps {
  open: boolean;
  onClose: () => void;
  onJobCreate?: (job: Job) => void;
}

const JobCreationForm: React.FC<JobCreationFormProps> = ({ open, onClose, onJobCreate }) => {
  const [activeStep, setActiveStep] = useState<number>(0)
  const [newSkill, setNewSkill] = useState<string>('')
  const [showSkillInput, setShowSkillInput] = useState<boolean>(false)
  const [jobData, setJobData] = useState<JobFormData>({
    title: '',
    department: '',
    experienceRequired: '',
    employmentType: 'Full-time',
    location: '',
    workMode: 'Hybrid',
    jobSummary: '',
    requiredSkills: [],
    numberOfOpenings: 1,
    interviewType: 'AI',
    applicationDeadline: '',
    salary: '',
    experienceLevel: '<5 yrs',
    numberOfQuestions: 10,
    resumeParsingEnabled: true,
    questionGenerationReady: true,
    expertReviewStatus: 'pending'
  })

  const steps: string[] = ['Basic Information', 'Job Description', 'Interview Setup']

  const handleInputChange = (field: keyof JobFormData, value: string | number | boolean | string[]): void => {
    setJobData(prev => ({ ...prev, [field]: value }))
  }

  const handleNext = (): void => setActiveStep(prev => prev + 1)
  const handleBack = (): void => setActiveStep(prev => prev - 1)

  const handleSubmit = async (): Promise<void> => {
    const loadingToast = showLoading('Creating job...')
    
    try {
      // Prepare job data for API (no authentication required for now)
      const jobPayload = {
        title: jobData.title,
        description: jobData.jobSummary,
        company: jobData.department, // Using department as company name
        location: jobData.location,
        salary_range: jobData.salary || null,
        job_type: jobData.employmentType,
        work_mode: jobData.workMode,
        experience_level: jobData.experienceRequired,
        department: jobData.department,
        skills_required: JSON.stringify(jobData.requiredSkills),
        number_of_openings: jobData.numberOfOpenings,
        interview_type: jobData.interviewType,
        number_of_questions: jobData.numberOfQuestions,
        application_deadline: jobData.applicationDeadline ? new Date(jobData.applicationDeadline).toISOString() : null,
        resume_parsing_enabled: jobData.resumeParsingEnabled,
        question_generation_ready: jobData.questionGenerationReady,
        expert_review_status: jobData.expertReviewStatus
      }

      // Call API to create job using apiClient (with correct base URL)
      const response = await apiClient.post('/api/createJob', jobPayload)
      const createdJob = response.data
      
      // Convert API response to frontend Job format
      const newJob: Job = {
        id: createdJob.id,
        title: createdJob.title,
        company: createdJob.company,
        salary: createdJob.salary_range || 'Competitive',
        postedTime: 'Just now',
        type: createdJob.job_type,
        location: createdJob.location,
        status: createdJob.status as 'Open' | 'Interview In Progress' | 'Closed' | 'Paused',
        appliedCount: 0,
        interviewPending: 0,
        selected: 0,
        rejected: 0,
        experienceLevel: createdJob.experience_level,
        numberOfQuestions: createdJob.number_of_questions,
        interviewType: createdJob.interview_type,
        resumeParsingEnabled: createdJob.resume_parsing_enabled,
        questionGenerationReady: createdJob.question_generation_ready,
        expertReviewStatus: createdJob.expert_review_status as 'pending' | 'completed',
        description: createdJob.description,
        icon: 'fas fa-briefcase',
        color: '#6366f1'
      }
      
      if (onJobCreate) onJobCreate(newJob)
      
      // Dismiss loading toast and show success
      dismissToast(loadingToast)
      showSuccess(`Job "${createdJob.title}" created successfully!`)
      
      onClose()
      
      // Reset form
      setActiveStep(0)
      setJobData({
        title: '',
        department: '',
        experienceRequired: '',
        employmentType: 'Full-time',
        location: '',
        workMode: 'Hybrid',
        jobSummary: '',
        requiredSkills: [],
        numberOfOpenings: 1,
        interviewType: 'AI',
        applicationDeadline: '',
        salary: '',
        experienceLevel: '<5 yrs',
        numberOfQuestions: 10,
        resumeParsingEnabled: true,
        questionGenerationReady: true,
        expertReviewStatus: 'pending'
      })
    } catch (error) {
      // Dismiss loading toast and show error
      dismissToast(loadingToast)
      console.error('Error creating job:', error)
      showError(`Failed to create job: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`)
    }
  }

  const addSkill = (): void => {
    if (newSkill.trim() && !jobData.requiredSkills.includes(newSkill.trim())) {
      handleInputChange('requiredSkills', [...jobData.requiredSkills, newSkill.trim()])
      setNewSkill('')
      setShowSkillInput(false)
    }
  }

  const removeSkill = (skillToRemove: string): void => {
    const updatedSkills = jobData.requiredSkills.filter(skill => skill !== skillToRemove)
    handleInputChange('requiredSkills', updatedSkills)
  }

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Job Title */}
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                Job Title *
              </Typography>
              <TextField
                fullWidth
                placeholder="e.g., Senior Frontend Developer"
                value={jobData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
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

            {/* Department & Experience - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Department *
                </Typography>
                <FormControl fullWidth>
                  <Select
                    value={jobData.department}
                    onChange={(e) => handleInputChange('department', e.target.value)}
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
                    <MenuItem value="" disabled>Select Department</MenuItem>
                    <MenuItem value="Engineering">Engineering</MenuItem>
                    <MenuItem value="Product">Product</MenuItem>
                    <MenuItem value="Design">Design</MenuItem>
                    <MenuItem value="Marketing">Marketing</MenuItem>
                    <MenuItem value="Sales">Sales</MenuItem>
                    <MenuItem value="HR">HR</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Experience Level *
                </Typography>
                <FormControl fullWidth>
                  <Select
                    value={jobData.experienceRequired}
                    onChange={(e) => handleInputChange('experienceRequired', e.target.value)}
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
                    <MenuItem value="0-1 Years">Entry Level (0-1 Years)</MenuItem>
                    <MenuItem value="1-3 Years">Junior (1-3 Years)</MenuItem>
                    <MenuItem value="3-5 Years">Mid-Level (3-5 Years)</MenuItem>
                    <MenuItem value="5-8 Years">Senior (5-8 Years)</MenuItem>
                    <MenuItem value="8+ Years">Expert (8+ Years)</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>

            {/* Location & Work Mode - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Location *
                </Typography>
                <TextField
                  fullWidth
                  placeholder="e.g., New York, NY"
                  value={jobData.location}
                  onChange={(e) => handleInputChange('location', e.target.value)}
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
                  Work Mode *
                </Typography>
                <FormControl fullWidth>
                  <Select
                    value={jobData.workMode}
                    onChange={(e) => handleInputChange('workMode', e.target.value)}
                    sx={{
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      '& .MuiSelect-select': { padding: '12px 16px', fontSize: '14px' }
                    }}
                  >
                    <MenuItem value="Remote">Remote</MenuItem>
                    <MenuItem value="Hybrid">Hybrid</MenuItem>
                    <MenuItem value="On-site">On-site</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>

            {/* Employment Type */}
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
                Employment Type *
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                {['Full-time', 'Contract', 'Part-time'].map((type) => (
                  <Button
                    key={type}
                    onClick={() => handleInputChange('employmentType', type)}
                    sx={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: '2px solid',
                      borderColor: jobData.employmentType === type ? '#f59e0b' : '#e2e8f0',
                      backgroundColor: jobData.employmentType === type ? 'rgba(245, 158, 11, 0.1)' : 'white',
                      color: jobData.employmentType === type ? '#f59e0b' : '#64748b',
                      fontSize: '14px',
                      fontWeight: 600,
                      textTransform: 'none',
                      '&:hover': {
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)'
                      }
                    }}
                  >
                    {type}
                  </Button>
                ))}
              </Box>
            </Box>
          </Box>
        )

      case 1:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Job Summary */}
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                Job Summary *
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={4}
                placeholder="Describe the role, responsibilities, and what makes this position exciting..."
                value={jobData.jobSummary}
                onChange={(e) => handleInputChange('jobSummary', e.target.value)}
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

            {/* Salary Range */}
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                Salary Range
              </Typography>
              <TextField
                fullWidth
                placeholder="e.g., $80,000 - $120,000 per year"
                value={jobData.salary}
                onChange={(e) => handleInputChange('salary', e.target.value)}
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

            {/* Required Skills */}
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
                Required Skills
              </Typography>
              
              <Box sx={{
                padding: '16px',
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                minHeight: '80px'
              }}>
                {jobData.requiredSkills.length > 0 && (
                  <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    {jobData.requiredSkills.map((skill) => (
                      <Chip
                        key={skill}
                        label={skill}
                        onDelete={() => removeSkill(skill)}
                        sx={{
                          backgroundColor: '#f59e0b',
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: 600,
                          height: '28px',
                          '& .MuiChip-deleteIcon': {
                            color: 'white',
                            '&:hover': { color: '#fed7aa' }
                          }
                        }}
                      />
                    ))}
                  </Box>
                )}
                
                {!showSkillInput ? (
                  <Button
                    onClick={() => setShowSkillInput(true)}
                    sx={{
                      color: '#f59e0b',
                      backgroundColor: 'white',
                      border: '1px dashed #f59e0b',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      fontSize: '14px',
                      fontWeight: 600,
                      textTransform: 'none',
                      '&:hover': { backgroundColor: 'rgba(245, 158, 11, 0.1)' }
                    }}
                  >
                    + Add Skill
                  </Button>
                ) : (
                  <Box sx={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    padding: '8px',
                    backgroundColor: 'white',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <TextField
                      size="small"
                      placeholder="Enter skill name..."
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addSkill()
                        }
                      }}
                      autoFocus
                      sx={{
                        flex: 1,
                        '& .MuiOutlinedInput-root': {
                          '& .MuiOutlinedInput-notchedOutline': { border: 'none' }
                        }
                      }}
                    />
                    <Button
                      onClick={addSkill}
                      disabled={!newSkill.trim()}
                      sx={{
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        minWidth: '60px',
                        height: '32px',
                        borderRadius: '6px',
                        textTransform: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        '&:hover': { backgroundColor: '#d97706' },
                        '&:disabled': { backgroundColor: '#e5e7eb', color: '#9ca3af' }
                      }}
                    >
                      Add
                    </Button>
                    <Button
                      onClick={() => {
                        setNewSkill('')
                        setShowSkillInput(false)
                      }}
                      sx={{
                        backgroundColor: 'white',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
                        minWidth: '60px',
                        height: '32px',
                        borderRadius: '6px',
                        textTransform: 'none',
                        fontSize: '12px',
                        '&:hover': { backgroundColor: '#f8fafc' }
                      }}
                    >
                      Cancel
                    </Button>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        )

      case 2:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Number of Openings & Interview Type - Side by Side */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Number of Openings *
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  value={jobData.numberOfOpenings}
                  onChange={(e) => handleInputChange('numberOfOpenings', parseInt(e.target.value) || 1)}
                  slotProps={{ htmlInput: { min: 1, max: 50 } }}
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
                      textAlign: 'center',
                      fontWeight: 600
                    }
                  }}
                />
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Interview Type *
                </Typography>
                <FormControl fullWidth>
                  <Select
                    value={jobData.interviewType}
                    onChange={(e) => handleInputChange('interviewType', e.target.value)}
                    sx={{
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      '& .MuiSelect-select': { padding: '12px 16px', fontSize: '14px' }
                    }}
                  >
                    <MenuItem value="AI">AI Interview</MenuItem>
                    <MenuItem value="Manual">Manual Interview</MenuItem>
                    <MenuItem value="Both">Both AI & Manual</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>

            {/* Experience Level & Number of Questions */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Experience Level *
                </Typography>
                <FormControl fullWidth>
                  <Select
                    value={jobData.experienceLevel}
                    onChange={(e) => handleInputChange('experienceLevel', e.target.value)}
                    sx={{
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
                      '& .MuiSelect-select': { padding: '12px 16px', fontSize: '14px' }
                    }}
                  >
                    <MenuItem value="<5 yrs">Less than 5 years</MenuItem>
                    <MenuItem value=">5 yrs">More than 5 years</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              
              <Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  Number of Questions *
                </Typography>
                <TextField
                  fullWidth
                  type="number"
                  value={jobData.numberOfQuestions}
                  onChange={(e) => handleInputChange('numberOfQuestions', parseInt(e.target.value) || 10)}
                  slotProps={{ htmlInput: { min: 5, max: 20 } }}
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
                      textAlign: 'center',
                      fontWeight: 600
                    }
                  }}
                />
              </Box>
            </Box>

            {/* Application Deadline */}
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                Application Deadline
              </Typography>
              <TextField
                fullWidth
                type="date"
                value={jobData.applicationDeadline}
                onChange={(e) => handleInputChange('applicationDeadline', e.target.value)}
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

            {/* AI Configuration */}
            <Box sx={{
              padding: '20px',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderRadius: '8px',
              border: '1px solid #fed7aa'
            }}>
              <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>
                AI Configuration (Static for Prototype)
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Box sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: jobData.resumeParsingEnabled ? '#10b981' : '#ef4444'
                  }} />
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                    Resume Parsing {jobData.resumeParsingEnabled ? 'Enabled' : 'Disabled'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Box sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: jobData.questionGenerationReady ? '#10b981' : '#ef4444'
                  }} />
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                    Question Generation {jobData.questionGenerationReady ? 'Ready' : 'Not Ready'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Box sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: jobData.expertReviewStatus === 'completed' ? '#10b981' : '#f59e0b'
                  }} />
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                    Expert Review {jobData.expertReviewStatus === 'completed' ? 'Completed' : 'Pending'}
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Job Summary Preview */}
            <Box sx={{
              padding: '20px',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderRadius: '8px',
              border: '1px solid #fed7aa'
            }}>
              <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', marginBottom: '16px' }}>
                Job Summary
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Title:</Typography>
                  <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                    {jobData.title || 'Not specified'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Department:</Typography>
                  <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                    {jobData.department || 'Not specified'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Experience:</Typography>
                  <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                    {jobData.experienceRequired || 'Not specified'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Type:</Typography>
                  <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                    {jobData.employmentType} • {jobData.workMode}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Openings:</Typography>
                  <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                    {jobData.numberOfOpenings}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Interview:</Typography>
                  <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                    {jobData.interviewType} • {jobData.numberOfQuestions} Questions
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        )

      default:
        return null
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            width: '700px',
            height: '900px',
            borderRadius: '16px',
            overflow: 'hidden'
          }
        }
      }}
    >
      {/* Header */}
      <Box sx={{
        padding: '20px 24px',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Box>
          <Typography sx={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
            Create New Job
          </Typography>
          <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
            {steps[activeStep]}
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          sx={{
            color: '#64748b',
            '&:hover': { backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }
          }}
        >
          ✕
        </IconButton>
      </Box>

      {/* Step Navigation */}
      <Box sx={{ padding: '0 24px', backgroundColor: 'white' }}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          paddingY: '20px', 
          maxWidth: '450px', 
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
            width: `calc(${(activeStep / (steps.length - 1)) * 100}% - 0px)`,
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
                backgroundColor: index <= activeStep ? '#f59e0b' : '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
                transition: 'all 0.3s ease',
                border: index === activeStep ? '3px solid rgba(245, 158, 11, 0.3)' : 'none',
                boxShadow: index === activeStep ? '0 0 0 6px rgba(245, 158, 11, 0.1)' : 'none'
              }}>
                {index === 0 && (
                  <WorkIcon sx={{ 
                    color: index <= activeStep ? 'white' : '#94a3b8', 
                    fontSize: '22px' 
                  }} />
                )}
                {index === 1 && (
                  <DescriptionIcon sx={{ 
                    color: index <= activeStep ? 'white' : '#94a3b8', 
                    fontSize: '22px' 
                  }} />
                )}
                {index === 2 && (
                  <InterviewIcon sx={{ 
                    color: index <= activeStep ? 'white' : '#94a3b8', 
                    fontSize: '22px' 
                  }} />
                )}
              </Box>
              
              {/* Step Label */}
              <Typography sx={{
                fontSize: '11px',
                fontWeight: index === activeStep ? 700 : 500,
                color: index <= activeStep ? '#f59e0b' : '#94a3b8',
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

      {/* Content */}
      <DialogContent sx={{
        padding: '24px',
        backgroundColor: '#f8fafc',
        flex: 1,
        overflow: 'auto'
      }}>
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
          onClick={handleBack}
          disabled={activeStep === 0}
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

          {activeStep === steps.length - 1 ? (
            <Button
              onClick={handleSubmit}
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
              Create Job
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              sx={{
                backgroundColor: '#f59e0b',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': { backgroundColor: '#d97706' }
              }}
            >
              Next
            </Button>
          )}
        </Box>
      </Box>
    </Dialog>
  )
}

export default JobCreationForm