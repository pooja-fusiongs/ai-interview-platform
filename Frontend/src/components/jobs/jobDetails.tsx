import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  IconButton,
  Typography,
  Box,
  Button,
  Chip
} from '@mui/material'
import axios from 'axios'
import { CanApplyJobs, CanViewCandidates } from '../common/RoleBasedComponent'
import { useAuth } from '../../contexts/AuthContext'
import { jobApplicationService } from '../../services/jobApplicationService'

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
  
  const navigate = useNavigate()
  const { user } = useAuth()

  // Fetch application statistics for this job
  useEffect(() => {
    const fetchApplicationStats = async () => {
      try {
        setLoading(true)
        console.log('🔍 Fetching applications for job ID:', selectedJob.id)
        const response = await axios.get(`http://localhost:8000/api/job/${selectedJob.id}/applications`)
        
        console.log('📡 API Response:', response)
        console.log('📡 Response status:', response.status)
        console.log('� Response data:', response.data)
        
        if (response.status === 200) {
          const data = response.data
          
          // Try different possible data structures
          let applications = data.applications || data.data || data || []
          
          // If it's not an array, try to extract from different properties
          if (!Array.isArray(applications)) {
            console.log('📊 Data is not an array, trying to find applications...')
            applications = []
          }
          
          console.log('📊 Applications array:', applications)
          console.log('📊 Applications length:', applications.length)
          console.log('📊 First few applications:', applications.slice(0, 3))
          
          if (applications.length > 0) {
            console.log('📊 Application statuses:', applications.map((app: any) => ({
              id: app.id,
              status: app.status,
              applicant_name: app.applicant_name || app.name
            })))
          }
          
          // Count applications by status (case-insensitive)
          const stats = {
            total: applications.length,
            applied: applications.filter((app: any) => {
              if (!app.status) return false
              const status = app.status.toLowerCase()
              return status.includes('applied') || status.includes('submitted') || status === 'pending'
            }).length,
            interview: applications.filter((app: any) => {
              if (!app.status) return false
              const status = app.status.toLowerCase()
              return status.includes('interview') || status.includes('reviewed') || status.includes('screening')
            }).length,
            selected: applications.filter((app: any) => {
              if (!app.status) return false
              const status = app.status.toLowerCase()
              return status.includes('hired') || status.includes('selected') || status.includes('accepted') || status.includes('approved')
            }).length,
            rejected: applications.filter((app: any) => {
              if (!app.status) return false
              const status = app.status.toLowerCase()
              return status.includes('rejected') || status.includes('declined')
            }).length
          }
          
          console.log('📊 Calculated stats:', stats)
          
          // If no applications match our status filters but we have applications, 
          // show them all as "applied" for now
          if (applications.length > 0 && stats.applied === 0 && stats.interview === 0 && stats.selected === 0 && stats.rejected === 0) {
            console.log('⚠️ No status matches found, showing all as applied')
            stats.applied = applications.length
          }
          setApplicationStats(stats)
        } else {
          console.log('❌ API returned non-200 status:', response.status)
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
        
        const response = await axios.get('http://localhost:8000/api/jobs')
        
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
      height: '100vh',
      background: '#f8fafc'
    }}>
      {/* Main Content Area */}
      <Box sx={{ 
        flex: 1,
        padding: '24px 32px',
        overflow: 'auto',
        maxWidth: 'calc(100% - 320px)',
        m:"20px",
        borderRadius:"20px",
        background: '#fff',border:"1px solid #fff",
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
          padding: '16px 0px',
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
              fontSize: '16px',
              padding: '8px 16px',
              borderRadius: '8px',
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
            fontSize: '36px',
            fontWeight: 700,
            color: '#1e293b',
            marginBottom: '16px'
          }}>
            {selectedJob.title}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <Box sx={{
              width: 48,
              height: 48,
              borderRadius: '8px',
              background: selectedJob.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <i className={selectedJob.icon} style={{ color: 'white', fontSize: '20px' }}></i>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
                {selectedJob.company}
              </Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                {selectedJob.location} • {selectedJob.type} • {selectedJob.postedTime}
              </Typography>
            </Box>
          </Box>

          <CanApplyJobs fallback={
            <Button
              disabled
              sx={{
                background: '#f1f5f9',
                color: '#94a3b8',
                padding: '12px 32px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 600,
                textTransform: 'none',
                marginRight: '12px',
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
                  // padding: '12px 32px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 600,
                  textTransform: 'none',
                  marginRight: '12px',
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
                  padding: '12px 32px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 600,
                  textTransform: 'none',
                  marginRight: '12px',
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
                  padding: '12px 32px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 600,
                  textTransform: 'none',
                  marginRight: '12px',
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
                  padding: '12px 32px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 600,
                  textTransform: 'none',
                  marginRight: '12px',
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
          {/* <Button
            onClick={() => onViewCandidates(selectedJob)}
            sx={{
              background: 'rgba(139, 92, 246, 0.1)',
              color: '#8b5cf6',
              padding: '12px 32px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 600,
              textTransform: 'none',
              marginRight: '12px',
              '&:hover': {
                background: 'rgba(139, 92, 246, 0.2)'
              }
            }}
          >
            View Candidates
          </Button> */}
          <IconButton sx={{ 
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            marginRight: '8px'
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
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <Chip
              label={selectedJob.status}
              sx={{
                background: getStatusColor(selectedJob.status).bg,
                color: getStatusColor(selectedJob.status).color,
                fontSize: '14px',
                fontWeight: 600,
                height: '32px',
                borderRadius: '8px',
                padding: '0 12px'
              }}
            />
            {/* <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
              deadline {selectedJob.application_deadline}
            </Typography> */}
            {/* Application Deadline */}
            {selectedJob.application_deadline && (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: '#fef3c7',
                borderRadius: '8px',
                border: '1px solid #f59e0b'
              }}>
                <i className="fas fa-clock" style={{ color: '#f59e0b', fontSize: '12px' }}></i>
                <Typography sx={{ fontSize: '14px', color: '#92400e', fontWeight: 600 }}>
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
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: '16px',
            marginBottom: '20px'
          }}>
            <Box sx={{ 
              textAlign: 'center', 
              padding: '16px', 
              backgroundColor: '#f8fafc', 
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#f59e0b' }}>
                {loading ? '...' : applicationStats.applied}
              </Typography>
              <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                Applied
              </Typography>
            </Box>
            <Box sx={{ 
              textAlign: 'center', 
              padding: '16px', 
              backgroundColor: '#f8fafc', 
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#8b5cf6' }}>
                {loading ? '...' : applicationStats.interview}
              </Typography>
              <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                Interview Pending
              </Typography>
            </Box>
            <Box sx={{ 
              textAlign: 'center', 
              padding: '16px', 
              backgroundColor: '#f8fafc', 
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#10b981' }}>
                {loading ? '...' : applicationStats.selected}
              </Typography>
              <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                Selected
              </Typography>
            </Box>
            <Box sx={{ 
              textAlign: 'center', 
              padding: '16px', 
              backgroundColor: '#f8fafc', 
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#ef4444' }}>
                {loading ? '...' : applicationStats.rejected}
              </Typography>
              <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                Rejected
              </Typography>
            </Box>
          </Box>

          
        </Box>

        {/* Interview Configuration */}
        <Box sx={{ 
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
            Interview Configuration
          </Typography>
          
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(2, 1fr)', 
            gap: '20px',
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
            About This Role
          </Typography>
          <Typography sx={{
            fontSize: '16px',
            color: '#64748b',
            lineHeight: 1.6,
            marginBottom: '16px'
          }}>
            {selectedJob.fullDescription || selectedJob.description}
          </Typography>
        </Box>

        {/* Qualifications */}
        {selectedJob.requirements && (
          <Box sx={{ 
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
              Qualifications
            </Typography>
            <Box component="ul" sx={{ 
              margin: 0, 
              paddingLeft: '20px',
              '& li': {
                fontSize: '16px',
                color: '#64748b',
                lineHeight: 1.6,
                marginBottom: '8px'
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
              Responsibility
            </Typography>
            <Box component="ul" sx={{ 
              margin: 0, 
              paddingLeft: '20px',
              '& li': {
                fontSize: '16px',
                color: '#64748b',
                lineHeight: 1.6,
                marginBottom: '8px'
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
        width: 320,
        background: 'white',
        borderLeft: '1px solid #e2e8f0',
        padding: '24px',
        mt:"20px",
        overflow: 'auto',
        borderRadius:"10px",
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
              padding: '16px',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              marginBottom: '16px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              '&:hover': {
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                borderColor: getJobColor(job.department || 'Engineering'),
                transform: 'translateY(-2px)'
              }
            }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <Box sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '8px',
                  background: getJobColor(job.department || 'Engineering'),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <i className={getJobIcon(job.department || 'Engineering')} style={{ color: 'white', fontSize: '16px' }}></i>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#1e293b',
                    marginBottom: '4px'
                  }}>
                    {job.title}
                  </Typography>
                  <Typography sx={{
                    fontSize: '14px',
                    color: '#64748b',
                    marginBottom: '8px'
                  }}>
                    {job.company} • {job.location}
                  </Typography>
                  <Typography sx={{
                    fontSize: '12px',
                    color: '#64748b',
                    marginBottom: '4px'
                  }}>
                    {getJobType(job)} • {getWorkMode(job)} • {getExperienceLevel(job)}
                  </Typography>
                  <Typography sx={{
                    fontSize: '12px',
                    color: '#94a3b8'
                  }}>
                    {getTimeAgo(job.created_at)} • {job.status}
                  </Typography>
                </Box>
                <IconButton sx={{ 
                  color: '#cbd5e1',
                  padding: '4px',
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
                  padding: '16px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  marginBottom: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                    borderColor: getJobColor(job.department || 'Engineering'),
                    transform: 'translateY(-2px)'
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <Box sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '8px',
                    background: getJobColor(job.department || 'Engineering'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <i className={getJobIcon(job.department || 'Engineering')} style={{ color: 'white', fontSize: '16px' }}></i>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#1e293b',
                      marginBottom: '4px'
                    }}>
                      {job.title}
                    </Typography>
                    <Typography sx={{
                      fontSize: '14px',
                      color: '#64748b',
                      marginBottom: '8px'
                    }}>
                      {job.company} • {job.location}
                    </Typography>
                    <Typography sx={{
                      fontSize: '12px',
                      color: '#64748b',
                      marginBottom: '4px'
                    }}>
                      {getJobType(job)} • {getWorkMode(job)} • {getExperienceLevel(job)}
                    </Typography>
                    <Typography sx={{
                      fontSize: '12px',
                      color: '#94a3b8'
                    }}>
                      {getTimeAgo(job.created_at)} • {job.status}
                    </Typography>
                  </Box>
                  <IconButton sx={{ 
                    color: '#cbd5e1',
                    padding: '4px',
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
    </Box>
  )
}

export default JobDetails;