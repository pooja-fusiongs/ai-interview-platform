import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconButton,
  Typography,
  Box,
  Button,
  Chip,
  TextField,
  Snackbar,
  Alert
} from '@mui/material'
import { CanApplyJobs, CanViewCandidates } from '../common/RoleBasedComponent'
import { apiClient } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { jobApplicationService } from '../../services/jobApplicationService'
import { jobService } from '../../services/jobService'

interface JobDetailsProps {
  selectedJob: any;
  onClose: () => void;
  onApplyNow: (job: any) => void;
  onJobSelect?: (job: any) => void;
  onViewCandidates?: (job: any) => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Open':
      return { bg: '#e8f5e8', color: '#2e7d32' }
    case 'Closed':
      return { bg: '#ffebee', color: '#c62828' }
    case 'Paused':
      return { bg: '#fff3e0', color: '#ef6c00' }
    case 'Interview In Progress':
      return { bg: '#e3f2fd', color: '#1976d2' }
    default:
      return { bg: '#f5f5f5', color: '#666666' }
  }
}

const JobDetails: React.FC<JobDetailsProps> = ({
  selectedJob,
  onClose,
  onApplyNow,
  onJobSelect,
  onViewCandidates
}) => {
  const [applicationStats, setApplicationStats] = useState({
    total: 0,
    applied: 0,
    interview: 0,
    selected: 0,
    rejected: 0
  })
  const [loading, setLoading] = useState(true)
  const [similarJobs, setSimilarJobs] = useState<any[]>([])
  const [otherJobs, setOtherJobs] = useState<any[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [hasApplied, setHasApplied] = useState(false)
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editedDescription, setEditedDescription] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' })

  const navigate = useNavigate()
  const { user } = useAuth()

  // Fetch application statistics for this job
  useEffect(() => {
    const fetchApplicationStats = async () => {
      try {
        setLoading(true)
        console.log('🔍 Fetching applications for job ID:', selectedJob.id)
        const response = await apiClient.get(`/api/job/${selectedJob.id}/applications`)
        
        console.log('📡 API Response:', response)
        console.log('📡 Response status:', response.status)
        console.log('� Response data:', response.data)
        
        if (response.status === 200) {
          const data = response.data
          const totalApps = data.total_applications || 0

          // Use backend-computed stats (cross-references InterviewSession data)
          if (data.stats) {
            const stats = {
              total: totalApps,
              applied: data.stats.applied || 0,
              interview: data.stats.interview || 0,
              selected: data.stats.selected || 0,
              rejected: data.stats.rejected || 0
            }
            console.log('Stats from backend:', stats)
            setApplicationStats(stats)
          } else {
            // Fallback: all as applied
            setApplicationStats({
              total: totalApps,
              applied: totalApps,
              interview: 0,
              selected: 0,
              rejected: 0
            })
          }
        }
      } catch (error: any) {
        console.error('❌ Error fetching application stats:', error)
        console.error('❌ Error details:', error.response?.data)
        // Keep default values on error
      } finally {
        setLoading(false)
      }
    }

    if (selectedJob?.id) {
      fetchApplicationStats()
    }
  }, [selectedJob?.id])

  // Check if current user has already applied for this job
  useEffect(() => {
    const checkApplicationStatus = async () => {
      if (!selectedJob?.id || !user?.email || user?.role !== 'candidate') {
        return
      }

      try {
        const status = await jobApplicationService.checkApplicationStatus(selectedJob.id, user.email)
        setHasApplied(status.has_applied)
      } catch (error) {
        console.error('Error checking application status:', error)
        setHasApplied(false)
      }
    }

    checkApplicationStatus()
  }, [selectedJob?.id, user?.email, user?.role])

  // Fetch similar jobs and other jobs
  useEffect(() => {
    const fetchRelatedJobs = async () => {
      try {
        setJobsLoading(true)
        console.log('🔍 Fetching related jobs for:', selectedJob.title)
        console.log('🔍 Selected job data:', {
          id: selectedJob.id,
          department: selectedJob.department,
          job_type: selectedJob.job_type || selectedJob.type,
          experience_level: selectedJob.experience_level || selectedJob.experienceLevel
        })
        
        const response = await apiClient.get('/api/jobs')
        
        if (response.status === 200) {
          const allJobs = response.data
          console.log('📊 Total jobs from API:', allJobs.length)
          
          // Filter out current job
          const otherJobsList = allJobs.filter((job: any) => job.id !== selectedJob.id)
          console.log('📊 Jobs after excluding current:', otherJobsList.length)
          
          // Similar jobs: same department, job type, or experience level, limit to 3
          const similar = otherJobsList.filter((job: any) => {
            const selectedDepartment = selectedJob.department
            const selectedJobType = selectedJob.job_type || selectedJob.type
            const selectedExperience = selectedJob.experience_level || selectedJob.experienceLevel
            
            const isDepartmentMatch = job.department === selectedDepartment
            const isTypeMatch = job.job_type === selectedJobType
            const isExperienceMatch = job.experience_level === selectedExperience
            
            console.log(`� hComparing job "${job.title}":`, {
              department: `${job.department} === ${selectedDepartment} = ${isDepartmentMatch}`,
              jobType: `${job.job_type} === ${selectedJobType} = ${isTypeMatch}`,
              experience: `${job.experience_level} === ${selectedExperience} = ${isExperienceMatch}`
            })
            
            return isDepartmentMatch || isTypeMatch || isExperienceMatch
          }).slice(0, 3)
          
          console.log('📊 Similar jobs found:', similar.length)
          console.log('🔍 Similar jobs:', similar.map((j: any) => ({ id: j.id, title: j.title, department: j.department })))
          
          // Other jobs: ALL jobs except current job and similar jobs
          const otherJobsFiltered = otherJobsList.filter((job: any) => 
            !similar.some((s: any) => s.id === job.id)
          ).slice(0, 5)
          
          console.log('📊 Other jobs found:', otherJobsFiltered.length)
          console.log('🔍 Other jobs:', otherJobsFiltered.map((j: any) => ({ id: j.id, title: j.title, department: j.department })))
          
          setSimilarJobs(similar)
          setOtherJobs(otherJobsFiltered)
        }
      } catch (error) {
        console.error('❌ Error fetching related jobs:', error)
        // Keep empty arrays on error
      } finally {
        setJobsLoading(false)
      }
    }

    if (selectedJob?.id) {
      fetchRelatedJobs()
    }
  }, [selectedJob?.id, selectedJob?.department, selectedJob?.job_type, selectedJob?.type, selectedJob?.experience_level, selectedJob?.experienceLevel])

  // Helper functions for job display
  const getJobIcon = (department: string) => {
    const icons: { [key: string]: string } = {
      'Engineering': 'fas fa-code',
      'Design': 'fas fa-palette',
      'Product': 'fas fa-lightbulb',
      'Marketing': 'fas fa-bullhorn',
      'Sales': 'fas fa-chart-line',
      'HR': 'fas fa-users'
    }
    return icons[department] || 'fas fa-briefcase'
  }

  const getJobColor = (department: string) => {
    const colors: { [key: string]: string } = {
      'Engineering': '#3b82f6',
      'Design': '#8b5cf6',
      'Product': '#059669',
      'Marketing': '#f59e0b',
      'Sales': '#ef4444',
      'HR': '#06b6d4'
    }
    return colors[department] || '#6366f1'
  }

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    const diffInDays = Math.floor(diffInHours / 24)
    return `${diffInDays}d ago`
  }

  // Helper function to get experience level from either field format
  const getExperienceLevel = (job: any) => {
    return job.experience_level || job.experienceLevel || 'Not specified'
  }

  // Helper function to get job type from either field format
  const getJobType = (job: any) => {
    return job.job_type || job.type || 'Not specified'
  }

  // Helper function to get work mode from either field format
  const getWorkMode = (job: any) => {
    return job.work_mode || job.workMode || 'On-site'
  }

  // Helper function to get number of questions from either field format
  const getNumberOfQuestions = (job: any) => {
    return job.number_of_questions || job.numberOfQuestions || 10
  }

  // Helper function to get interview type from either field format
  const getInterviewType = (job: any) => {
    return job.interview_type || job.interviewType || 'AI Video Interview'
  }

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: { xs: 'column', lg: 'row' },
      minHeight: '100vh',
      background: '#f8fafc',
      overflow: 'hidden',
      maxWidth: '100vw'
    }}>
      {/* Main Content Area */}
      <Box sx={{
        flex: 1,
        padding: { xs: '10px', sm: '16px', md: '24px 32px' },
        overflow: 'auto',
        maxWidth: { xs: '100%', lg: 'calc(100% - 320px)' },
        m: { xs: '4px', sm: '12px', md: '20px' },
        borderRadius: { xs: '8px', md: '20px' },
        background: '#fff', border: '1px solid #fff',
        boxSizing: 'border-box',
        '&::-webkit-scrollbar': {
          width: '6px'
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent'
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#cbd5e1',
          borderRadius: '3px',
          '&:hover': {
            background: '#94a3b8'
          }
        }
      }}>
        {/* Header with Back Button */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          background: '#fff',
          padding: { xs: '10px 0px', sm: '16px 0px' },
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <Button
            onClick={onClose}
            sx={{
              color: '#64748b',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: { xs: '14px', sm: '16px' },
              padding: { xs: '6px 10px', sm: '8px 16px' },
              borderRadius: '8px',
              minWidth: 'auto',
              '&:hover': {
                background: '#f1f5f9'
              }
            }}
          >
            <i className="fas fa-arrow-left" style={{ marginRight: '8px' }}></i>
            Back to Jobs
          </Button>
          
          <Box sx={{ display: 'flex', gap: '12px' }}>
            <IconButton sx={{ color: '#64748b' }}>
              <i className="fas fa-bookmark"></i>
            </IconButton>
            <IconButton sx={{ color: '#64748b' }}>
              <i className="fas fa-share"></i>
            </IconButton>
          </Box>
        </Box>

        {/* Job Title and Company */}
        <Box sx={{ 
          marginBottom: '16px',
          background: 'white',
          borderRadius: '16px'
        }}>
          <Typography variant="h3" sx={{
            fontSize: { xs: '24px', sm: '28px', md: '36px' },
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '16px'
          }}>
            {selectedJob.title}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '10px', sm: '16px' }, marginBottom: '20px' }}>
            <Box sx={{
              width: { xs: 40, sm: 48 },
              height: { xs: 40, sm: 48 },
              borderRadius: '8px',
              background: selectedJob.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <i className={selectedJob.icon} style={{ color: 'white', fontSize: '20px' }}></i>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: { xs: '16px', sm: '18px' }, fontWeight: 600, color: '#1e293b' }}>
                {selectedJob.company}
              </Typography>
              <Typography sx={{ fontSize: { xs: '12px', sm: '14px' }, color: '#64748b', wordBreak: 'break-word' }}>
                {selectedJob.location} • {selectedJob.type} • {selectedJob.postedTime}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: '8px', sm: '12px' }, alignItems: 'center' }}>
            <CanApplyJobs fallback={
              <Button
                disabled
                sx={{
                  background: '#f1f5f9',
                  color: '#94a3b8',
                  padding: { xs: '8px 16px', sm: '12px 32px' },
                  borderRadius: '8px',
                  fontSize: { xs: '13px', sm: '16px' },
                  fontWeight: 600,
                  textTransform: 'none',
                  cursor: 'not-allowed'
                }}
              >
                View Only
              </Button>
            }>
              {hasApplied ? (
                // Already Applied state
                <Button
                  disabled
                  sx={{
                    background: '#dcfce7',
                    color: '#166534',
                    border: '2px solid #bbf7d0',
                    padding: { xs: '8px 16px', sm: '12px 32px' },
                    borderRadius: '8px',
                    fontSize: { xs: '13px', sm: '16px' },
                    fontWeight: 600,
                    textTransform: 'none',
                    cursor: 'not-allowed'
                  }}
                >
                  <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i>
                   Applied
                </Button>
              ) : (
                // Apply Now state (default)
                <Button
                  onClick={() => onApplyNow(selectedJob)}
                  sx={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#f59e0b',
                    padding: { xs: '8px 16px', sm: '12px 32px' },
                    borderRadius: '8px',
                    fontSize: { xs: '13px', sm: '16px' },
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'rgba(245, 158, 11, 0.2)'
                    }
                  }}
                >
                  Apply Now
                </Button>
              )}
            </CanApplyJobs>

            <CanViewCandidates>
              {onViewCandidates && (
                <Button
                  onClick={() => onViewCandidates(selectedJob)}
                  sx={{
                    background: 'rgba(139, 92, 246, 0.1)',
                    color: '#8b5cf6',
                    padding: { xs: '8px 16px', sm: '12px 32px' },
                    borderRadius: '8px',
                    fontSize: { xs: '13px', sm: '16px' },
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'rgba(139, 92, 246, 0.2)'
                    }
                  }}
                >
                  <i className="fas fa-users" style={{ marginRight: '8px' }}></i>
                  View Candidates
                </Button>
              )}
              {(user?.role === 'recruiter' || user?.role === 'admin') && (
                <Button
                  onClick={() => navigate(`/recruiter-candidates?jobId=${selectedJob.id}&jobTitle=${encodeURIComponent(selectedJob.title)}`)}
                  sx={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#d97706',
                    padding: { xs: '8px 16px', sm: '12px 32px' },
                    borderRadius: '8px',
                    fontSize: { xs: '13px', sm: '16px' },
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'rgba(245, 158, 11, 0.2)'
                    }
                  }}
                >
                  <i className="fas fa-user-plus" style={{ marginRight: '8px' }}></i>
                  Manage Candidates
                </Button>
              )}
            </CanViewCandidates>
            <IconButton sx={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0'
            }}>
              <i className="fas fa-star" style={{ color: '#fbbf24' }}></i>
            </IconButton>
            <IconButton sx={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0'
            }}>
              <i className="fas fa-share" style={{ color: '#64748b' }}></i>
            </IconButton>
          </Box>
        </Box>

        {/* Job Status and Stats */}
        <Box sx={{ 
          marginBottom: '16px',
          background: 'white',
          borderRadius: '16px'
        }}>
          <Typography variant="h5" sx={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '16px'
          }}>
            Job Status & Statistics
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '8px', sm: '16px' }, marginBottom: '20px', flexWrap: 'wrap' }}>
            <Chip
              label={selectedJob.status}
              sx={{
                background: getStatusColor(selectedJob.status).bg,
                color: getStatusColor(selectedJob.status).color,
                fontSize: { xs: '12px', sm: '14px' },
                fontWeight: 600,
                height: '32px',
                borderRadius: '8px',
                padding: '0 12px'
              }}
            />
            {/* Application Deadline */}
            {selectedJob.application_deadline && (
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: { xs: '6px 10px', sm: '8px 12px' },
                backgroundColor: '#fef3c7',
                borderRadius: '8px',
                border: '1px solid #f59e0b'
              }}>
                <i className="fas fa-clock" style={{ color: '#f59e0b', fontSize: '12px' }}></i>
                <Typography sx={{ fontSize: { xs: '12px', sm: '14px' }, color: '#92400e', fontWeight: 600 }}>
                  Deadlined: {new Date(selectedJob.application_deadline).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </Typography>
              </Box>
            )}
          </Box>

          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
            gap: { xs: '8px', sm: '12px', md: '16px' },
            marginBottom: '20px'
          }}>
            <Box sx={{
              textAlign: 'center',
              padding: { xs: '10px', sm: '16px' },
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ fontSize: { xs: '20px', sm: '24px' }, fontWeight: 700, color: '#f59e0b' }}>
                {loading ? '...' : applicationStats.applied}
              </Typography>
              <Typography sx={{ fontSize: { xs: '11px', sm: '12px' }, color: '#64748b', fontWeight: 500 }}>
                Applied
              </Typography>
            </Box>
            <Box sx={{
              textAlign: 'center',
              padding: { xs: '10px', sm: '16px' },
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ fontSize: { xs: '20px', sm: '24px' }, fontWeight: 700, color: '#8b5cf6' }}>
                {loading ? '...' : applicationStats.interview}
              </Typography>
              <Typography sx={{ fontSize: { xs: '11px', sm: '12px' }, color: '#64748b', fontWeight: 500 }}>
                Interview Pending
              </Typography>
            </Box>
            <Box sx={{
              textAlign: 'center',
              padding: { xs: '10px', sm: '16px' },
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ fontSize: { xs: '20px', sm: '24px' }, fontWeight: 700, color: '#10b981' }}>
                {loading ? '...' : applicationStats.selected}
              </Typography>
              <Typography sx={{ fontSize: { xs: '11px', sm: '12px' }, color: '#64748b', fontWeight: 500 }}>
                Selected
              </Typography>
            </Box>
            <Box sx={{
              textAlign: 'center',
              padding: { xs: '10px', sm: '16px' },
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ fontSize: { xs: '20px', sm: '24px' }, fontWeight: 700, color: '#ef4444' }}>
                {loading ? '...' : applicationStats.rejected}
              </Typography>
              <Typography sx={{ fontSize: { xs: '11px', sm: '12px' }, color: '#64748b', fontWeight: 500 }}>
                Rejected
              </Typography>
            </Box>
          </Box>

          
        </Box>

        {/* Interview Configuration */}
        <Box sx={{
          marginBottom: '16px',
          background: 'white',
          padding: { xs: '12px', sm: '24px' },
          borderRadius: '16px'
        }}>
          <Typography variant="h5" sx={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '16px'
          }}>
            Interview Configuration
          </Typography>
          
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
            gap: { xs: '12px', md: '20px' },
            marginBottom: '20px'
          }}>
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                Experience Level
              </Typography>
              <Chip
                label={getExperienceLevel(selectedJob)}
                sx={{
                  background: '#dbeafe',
                  color: '#1e40af',
                  fontSize: '14px',
                  fontWeight: 600,
                  height: '32px'
                }}
              />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                Number of Questions
              </Typography>
              <Chip
                label={`${getNumberOfQuestions(selectedJob)} Questions`}
                sx={{
                  background: '#fef3c7',
                  color: '#92400e',
                  fontSize: '14px',
                  fontWeight: 600,
                  height: '32px'
                }}
              />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                Interview Type
              </Typography>
              <Chip
                label={getInterviewType(selectedJob)}
                sx={{
                  background: '#dcfce7',
                  color: '#166534',
                  fontSize: '14px',
                  fontWeight: 600,
                  height: '32px'
                }}
              />
            </Box>
          </Box>

          {/* AI Status Indicators */}
          <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>
            AI Status Indicators
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Box sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: selectedJob.resumeParsingEnabled ? '#10b981' : '#ef4444'
              }} />
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Resume Parsing {selectedJob.resumeParsingEnabled ? 'Enabled' : 'Disabled'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Box sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: selectedJob.questionGenerationReady ? '#10b981' : '#ef4444'
              }} />
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Question Generation {selectedJob.questionGenerationReady ? 'Ready' : 'Not Ready'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Box sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: selectedJob.expertReviewStatus === 'completed' ? '#10b981' : '#f59e0b'
              }} />
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Expert Review {selectedJob.expertReviewStatus === 'completed' ? 'Completed' : 'Pending'}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* About This Role */}
        <Box sx={{
          marginBottom: '8px',
          background: 'white',
          padding: { xs: '10px', sm: '16px' },
          borderRadius: '16px'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <Typography variant="h5" sx={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#1e293b',
            }}>
              About This Role
            </Typography>
            {(user?.role === 'recruiter' || user?.role === 'admin') && !isEditingDesc && (
              <IconButton
                onClick={() => {
                  setEditedDescription(selectedJob.fullDescription || selectedJob.description || '')
                  setIsEditingDesc(true)
                }}
                sx={{ color: '#64748b', '&:hover': { color: '#f59e0b', background: 'rgba(245,158,11,0.1)' } }}
                size="small"
              >
                <i className="fas fa-pen" style={{ fontSize: 14 }}></i>
              </IconButton>
            )}
          </Box>
          {isEditingDesc ? (
            <Box>
              <TextField
                multiline
                minRows={4}
                maxRows={12}
                fullWidth
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                sx={{
                  mb: '12px',
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '10px',
                    fontSize: '14px',
                    '& fieldset': { borderColor: '#e2e8f0' },
                    '&:hover fieldset': { borderColor: '#f59e0b' },
                    '&.Mui-focused fieldset': { borderColor: '#f59e0b' },
                  }
                }}
              />
              <Box sx={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Button
                  onClick={() => setIsEditingDesc(false)}
                  disabled={savingDesc}
                  sx={{
                    textTransform: 'none', fontWeight: 600, fontSize: '13px',
                    color: '#64748b', borderRadius: '8px', padding: '6px 16px',
                    '&:hover': { background: '#f1f5f9' }
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  disabled={savingDesc}
                  onClick={async () => {
                    try {
                      setSavingDesc(true)
                      await jobService.updateJob(selectedJob.id, { description: editedDescription })
                      selectedJob.description = editedDescription
                      selectedJob.fullDescription = editedDescription
                      setIsEditingDesc(false)
                      setToast({ open: true, message: 'Description updated successfully', severity: 'success' })
                    } catch (err) {
                      console.error('Error updating description:', err)
                      setToast({ open: true, message: 'Failed to update description', severity: 'error' })
                    } finally {
                      setSavingDesc(false)
                    }
                  }}
                  sx={{
                    textTransform: 'none', fontWeight: 600, fontSize: '13px',
                    borderRadius: '8px', padding: '6px 20px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    '&:hover': { background: 'linear-gradient(135deg, #d97706, #b45309)' }
                  }}
                >
                  {savingDesc ? 'Saving...' : 'Save'}
                </Button>
              </Box>
            </Box>
          ) : (
            <Typography sx={{
              fontSize: { xs: '14px', sm: '16px' },
              color: '#64748b',
              lineHeight: 1.6,
              marginBottom: 0,
              wordBreak: 'break-word'
            }}>
              {selectedJob.fullDescription || selectedJob.description}
            </Typography>
          )}
        </Box>

        {/* Required Skills */}
        {selectedJob.skills_required && (() => {
          let skills: string[] = []
          try {
            if (typeof selectedJob.skills_required === 'string') {
              skills = JSON.parse(selectedJob.skills_required)
            } else if (Array.isArray(selectedJob.skills_required)) {
              skills = selectedJob.skills_required
            }
          } catch {
            // Try comma-separated fallback
            if (typeof selectedJob.skills_required === 'string') {
              skills = selectedJob.skills_required.split(',').map((s: string) => s.trim()).filter(Boolean)
            }
          }
          if (!skills.length) return null
          return (
            <Box sx={{
              marginBottom: '8px',
              background: 'white',
              padding: { xs: '10px', sm: '16px' },
              borderRadius: '16px'
            }}>
              <Typography variant="h5" sx={{
                fontSize: '20px',
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="fas fa-code" style={{ color: '#6366f1', fontSize: '18px' }}></i>
                Required Skills
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {skills.map((skill: string, index: number) => (
                  <Chip
                    key={index}
                    label={skill}
                    sx={{
                      fontSize: '13px',
                      fontWeight: 500,
                      height: '32px',
                      backgroundColor: '#ede9fe',
                      color: '#6d28d9',
                      border: '1px solid #ddd6fe',
                      '&:hover': { backgroundColor: '#ddd6fe' }
                    }}
                  />
                ))}
              </Box>
            </Box>
          )
        })()}

        {/* Qualifications */}
        {selectedJob.requirements && (
          <Box sx={{
            marginBottom: '8px',
            background: 'white',
            padding: { xs: '10px', sm: '16px' },
            borderRadius: '16px'
          }}>
            <Typography variant="h5" sx={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#1e293b',
              marginBottom: '10px'
            }}>
              Skills
            </Typography>
            <Box component="ul" sx={{
              margin: 0,
              paddingLeft: { xs: '16px', sm: '20px' },
              '& li': {
                fontSize: { xs: '14px', sm: '16px' },
                color: '#64748b',
                lineHeight: 1.6,
                marginBottom: '8px',
                wordBreak: 'break-word'
              }
            }}>
              {selectedJob.requirements.map((req: string, index: number) => (
                <Typography component="li" key={index}>
                  {req}
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {/* Responsibilities */}
        {selectedJob.responsibilities && (
          <Box sx={{
            marginBottom: '8px',
            background: 'white',
            padding: { xs: '10px', sm: '16px' },
            borderRadius: '16px'
          }}>
            <Typography variant="h5" sx={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#1e293b',
              marginBottom: '10px'
            }}>
              Responsibility
            </Typography>
            <Box component="ul" sx={{
              margin: 0,
              paddingLeft: { xs: '16px', sm: '20px' },
              '& li': {
                fontSize: { xs: '14px', sm: '16px' },
                color: '#64748b',
                lineHeight: 1.6,
                marginBottom: '8px',
                wordBreak: 'break-word'
              }
            }}>
              {selectedJob.responsibilities.map((resp: string, index: number) => (
                <Typography component="li" key={index}>
                  {resp}
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {/* Attachments */}
        {/* <Box sx={{ 
          marginBottom: '16px',
          background: 'white',
          padding: '24px',
          borderRadius: '16px'
        }}>
          <Typography variant="h5" sx={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '16px'
          }}>
            Attachments
          </Typography>
          <Box sx={{ display: 'flex', gap: '16px' }}>
            <Box sx={{
              width: 120,
              height: 80,
              borderRadius: '8px',
              background: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '12px',
              fontWeight: 600,
              position: 'relative',
              cursor: 'pointer'
            }}>
              Job Description
              <Box sx={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                background: '#007bff',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px'
              }}>
                Job Description
              </Box>
            </Box>
            <Box sx={{
              width: 120,
              height: 80,
              borderRadius: '8px',
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              cursor: 'pointer',
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ 
                fontSize: '12px', 
                fontWeight: 600, 
                color: '#64748b',
                textAlign: 'center'
              }}>
                Company Brochure
              </Typography>
              <Box sx={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                background: '#10b981',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '10px',
                color: 'white'
              }}>
                Company Brochure
              </Box>
            </Box>
          </Box>
        </Box> */}
      </Box>

      {/* Right Sidebar */}
      <Box sx={{
        width: { xs: 'auto', lg: 320 },
        background: 'white',
        borderLeft: { xs: 'none', lg: '1px solid #e2e8f0' },
        borderTop: { xs: '1px solid #e2e8f0', lg: 'none' },
        padding: { xs: '12px', sm: '16px', md: '24px' },
        mt: { xs: '0', lg: '20px' },
        mb: { xs: '8px', lg: 0 },
        mx: { xs: '4px', sm: '12px', lg: 0 },
        overflow: 'hidden',
        borderRadius: { xs: '8px', lg: '10px' },
        boxSizing: 'border-box',
        '&::-webkit-scrollbar': {
          width: '6px'
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent'
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#cbd5e1',
          borderRadius: '3px',
          '&:hover': {
            background: '#94a3b8'
          }
        }
      }}>
        {/* Similar Jobs Header */}
        <Typography variant="h6" sx={{
          fontSize: '18px',
          fontWeight: 700,
          color: '#1e293b',
          marginBottom: '20px'
        }}>
          Similar Jobs
        </Typography>

        {/* Job Cards */}
        {jobsLoading ? (
          <Box sx={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
            Loading similar jobs...
          </Box>
        ) : similarJobs.length === 0 ? (
          <Box sx={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
            No similar jobs found
          </Box>
        ) : (
          similarJobs.map((job) => (
            <Box
              key={job.id}
              onClick={() => onJobSelect && onJobSelect(job)}
              sx={{
              padding: { xs: '12px', sm: '16px' },
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              marginBottom: { xs: '10px', sm: '16px' },
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              overflow: 'hidden',
              '&:hover': {
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                borderColor: getJobColor(job.department || 'Engineering'),
                transform: 'translateY(-2px)'
              }
            }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: '8px', sm: '12px' } }}>
                <Box sx={{
                  width: { xs: 32, sm: 40 },
                  height: { xs: 32, sm: 40 },
                  borderRadius: '8px',
                  background: getJobColor(job.department || 'Engineering'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <i className={getJobIcon(job.department || 'Engineering')} style={{ color: 'white', fontSize: '14px' }}></i>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <Typography sx={{
                    fontSize: { xs: '14px', sm: '16px' },
                    fontWeight: 600,
                    color: '#1e293b',
                    marginBottom: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {job.title}
                  </Typography>
                  <Typography sx={{
                    fontSize: { xs: '12px', sm: '14px' },
                    color: '#64748b',
                    marginBottom: '8px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {job.company} • {job.location}
                  </Typography>
                  <Typography sx={{
                    fontSize: { xs: '11px', sm: '12px' },
                    color: '#64748b',
                    marginBottom: '4px',
                    wordBreak: 'break-word'
                  }}>
                    {getJobType(job)} • {getWorkMode(job)} • {getExperienceLevel(job)}
                  </Typography>
                  <Typography sx={{
                    fontSize: { xs: '11px', sm: '12px' },
                    color: '#94a3b8'
                  }}>
                    {getTimeAgo(job.created_at)} • {job.status}
                  </Typography>
                </Box>
                <IconButton sx={{
                  color: '#cbd5e1',
                  padding: '4px',
                  flexShrink: 0,
                  '&:hover': { color: '#fbbf24' }
                }}>
                  <i className="fas fa-bookmark" style={{ fontSize: '14px' }}></i>
                </IconButton>
              </Box>
            </Box>
          ))
        )}

        {/* Other Jobs Section */}
        <Box sx={{ marginTop: '32px' }}>
          <Typography variant="h6" sx={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '20px'
          }}>
            Other Jobs
          </Typography>

          {jobsLoading ? (
            <Box sx={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
              Loading other jobs...
            </Box>
          ) : otherJobs.length === 0 ? (
            <Box sx={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
              No other jobs available
            </Box>
          ) : (
            otherJobs.map((job) => (
              <Box
                key={job.id}
                onClick={() => onJobSelect && onJobSelect(job)}
                sx={{
                  padding: { xs: '12px', sm: '16px' },
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  marginBottom: { xs: '10px', sm: '16px' },
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  overflow: 'hidden',
                  '&:hover': {
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                    borderColor: getJobColor(job.department || 'Engineering'),
                    transform: 'translateY(-2px)'
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: '8px', sm: '12px' } }}>
                  <Box sx={{
                    width: { xs: 32, sm: 40 },
                    height: { xs: 32, sm: 40 },
                    borderRadius: '8px',
                    background: getJobColor(job.department || 'Engineering'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <i className={getJobIcon(job.department || 'Engineering')} style={{ color: 'white', fontSize: '14px' }}></i>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <Typography sx={{
                      fontSize: { xs: '14px', sm: '16px' },
                      fontWeight: 600,
                      color: '#1e293b',
                      marginBottom: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {job.title}
                    </Typography>
                    <Typography sx={{
                      fontSize: { xs: '12px', sm: '14px' },
                      color: '#64748b',
                      marginBottom: '8px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {job.company} • {job.location}
                    </Typography>
                    <Typography sx={{
                      fontSize: { xs: '11px', sm: '12px' },
                      color: '#64748b',
                      marginBottom: '4px',
                      wordBreak: 'break-word'
                    }}>
                      {getJobType(job)} • {getWorkMode(job)} • {getExperienceLevel(job)}
                    </Typography>
                    <Typography sx={{
                      fontSize: { xs: '11px', sm: '12px' },
                      color: '#94a3b8'
                    }}>
                      {getTimeAgo(job.created_at)} • {job.status}
                    </Typography>
                  </Box>
                  <IconButton sx={{
                    color: '#cbd5e1',
                    padding: '4px',
                    flexShrink: 0,
                    '&:hover': { color: '#fbbf24' }
                  }}>
                    <i className="fas fa-bookmark" style={{ fontSize: '14px' }}></i>
                  </IconButton>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Box>

      {/* Toast notification */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setToast(prev => ({ ...prev, open: false }))} severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default JobDetails;