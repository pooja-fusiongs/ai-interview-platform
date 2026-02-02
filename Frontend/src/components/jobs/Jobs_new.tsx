import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { jobService } from '../../services/jobService'
import { jobApplicationService } from '../../services/jobApplicationService'
import { 
  Box, 
  Typography, 
  Button, 
  Card, 
  Chip,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  // InputLabel,
  Select,
  MenuItem,
  IconButton
} from '@mui/material'
import Navigation from '../layout/sidebar'
import JobCreationForm from './JobCreationForm'
import JobApplicationForm from './JobApplicationForm'
import JobDetails from './jobDetails'
import { CanCreateJob, CanApplyJobs } from '../common/RoleBasedComponent'

const Jobs = () => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [openAddJobDialog, setOpenAddJobDialog] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)
  const [showJobDetails, setShowJobDetails] = useState(false)
  const [openApplicationForm, setOpenApplicationForm] = useState(false)
  const [openFilterDialog, setOpenFilterDialog] = useState(false)
  const [allJobs, setAllJobs] = useState<any[]>([]) // Store all jobs with proper type
  const [filteredJobs, setFilteredJobs] = useState<any[]>([]) // Store filtered jobs with proper type
  const [jobApplicationStatus, setJobApplicationStatus] = useState<{[key: number]: boolean}>({}) // Track application status for each job
  
  // Filter states
  const [filters, setFilters] = useState({
    jobType: '',
    experienceLevel: '',
    location: '',
    status: '',
    company: '',
    workMode: '',
    salaryRange: '',
    department: ''
  })
  
  const { user } = useAuth()

  // Load API jobs count on component mount
  useEffect(() => {
    loadJobsFromAPI()
  }, [])

  // Check application status for jobs when user is a candidate
  useEffect(() => {
    if (user?.role === 'candidate' && user?.email && allJobs.length > 0) {
      checkApplicationStatusForJobs()
    }
  }, [user, allJobs])

  // Check application status for all jobs
  const checkApplicationStatusForJobs = async () => {
    if (!user?.email || user?.role !== 'candidate') return

    const statusMap: {[key: number]: boolean} = {}
    
    try {
      // Check application status for each job
      for (const job of allJobs) {
        try {
          const status = await jobApplicationService.checkApplicationStatus(job.id, user.email!)
          statusMap[job.id] = status.has_applied
          console.log(`Job ${job.id} application status:`, status.has_applied)
        } catch (error) {
          console.error(`Error checking application status for job ${job.id}:`, error)
          statusMap[job.id] = false
        }
      }

      setJobApplicationStatus(statusMap)
      console.log('Application status map:', statusMap)
    } catch (error) {
      console.error('Error checking application statuses:', error)
    }
  }

  // Filter jobs when search query or filters change
  useEffect(() => {
    applyFilters()
  }, [searchQuery, allJobs, filters])

  const applyFilters = () => {
    let filtered = [...allJobs]

    // Apply search query filter (by job title)
    if (searchQuery.trim()) {
      filtered = filtered.filter((job: any) => 
        job.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Apply other filters
    if (filters.jobType) {
      filtered = filtered.filter((job: any) => getJobType(job) === filters.jobType)
    }

    if (filters.experienceLevel) {
      filtered = filtered.filter((job: any) => getExperienceLevel(job) === filters.experienceLevel)
    }

    if (filters.location) {
      filtered = filtered.filter((job: any) => 
        job.location.toLowerCase().includes(filters.location.toLowerCase())
      )
    }

    if (filters.status) {
      filtered = filtered.filter((job: any) => job.status === filters.status)
    }

    if (filters.company) {
      filtered = filtered.filter((job: any) => 
        job.company.toLowerCase().includes(filters.company.toLowerCase())
      )
    }

    if (filters.workMode) {
      filtered = filtered.filter((job: any) => 
        job.workMode && job.workMode.toLowerCase().includes(filters.workMode.toLowerCase())
      )
    }

    if (filters.department) {
      filtered = filtered.filter((job: any) => 
        job.department && job.department.toLowerCase().includes(filters.department.toLowerCase())
      )
    }

    setFilteredJobs(filtered)
  }

  const loadJobsFromAPI = async () => {
    try {
      const jobs = await jobService.getJobs()
      console.log('🔍 Raw API response:', jobs)
      const apiJobs = jobs.map((job: any) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        salary: job.salary_range || 'Competitive',
        postedTime: getTimeAgo(job.created_at),
        type: job.job_type,
        location: job.location,
        workMode: job.work_mode || 'On-site',
        status: job.status,
        appliedCount: 0, // These would come from applications table in real app
        interviewPending: 0,
        selected: 0,
        rejected: 0,
        experienceLevel: job.experience_level,
        numberOfQuestions: job.number_of_questions,
        interviewType: job.interview_type,
        resumeParsingEnabled: job.resume_parsing_enabled,
        questionGenerationReady: job.question_generation_ready,
        expertReviewStatus: job.expert_review_status,
        description: job.description,
        department: job.department || 'Engineering',
        application_deadline: job.application_deadline,
        // Add missing fields that might be needed
        fullDescription: job.description,
        requirements: (() => {
          try {
            // Try to parse as JSON first
            if (job.skills_required && job.skills_required.startsWith('[')) {
              return JSON.parse(job.skills_required);
            } else if (job.skills_required) {
              // If it's a plain string, split by comma
              return job.skills_required.split(',').map((skill:any) => skill.trim());
            } else {
              return [];
            }
          } catch (error) {
            // If JSON parsing fails, treat as comma-separated string
            return job.skills_required ? job.skills_required.split(',').map((skill:any) => skill.trim()) : [];
          }
        })(),
        responsibilities: ['Develop and maintain applications', 'Collaborate with team', 'Write clean code'],
        benefits: ['Health insurance', 'Flexible hours', 'Remote work'],
        icon: getJobIcon(job.department || 'Engineering'),
        color: getJobColor(job.department || 'Engineering'),
        // Add API field mappings for jobDetails component - BOTH formats for compatibility
        job_type: job.job_type,
        work_mode: job.work_mode || 'On-site',
        experience_level: job.experience_level,
        number_of_questions: job.number_of_questions,
        interview_type: job.interview_type,
        created_at: job.created_at
      }))
      console.log('🔍 Mapped jobs:', apiJobs)
      setAllJobs(apiJobs)
      setFilteredJobs(apiJobs) // Initially show all jobs
    } catch (error) {
      console.error('❌ Error loading jobs from API:', error)
      // Keep static jobs as fallback
      const staticJobs = jobs // Use the static jobs array
      setAllJobs(staticJobs)
      setFilteredJobs(staticJobs)
    }
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

  const handleOpenAddJobDialog = () => {
    setOpenAddJobDialog(true)
  }

  const handleCloseAddJobDialog = () => {
    setOpenAddJobDialog(false)
  }

  const handleViewJobDetails = (job: any) => {
    setSelectedJob(job)
    setShowJobDetails(true)
  }

  const handleCloseJobDetails = () => {
    setShowJobDetails(false)
    setSelectedJob(null)
  }

  const handleApplyNow = (job: any) => {
    setSelectedJob(job)
    setOpenApplicationForm(true)
  }

  const handleViewCandidates = (job: any) => {
    // Navigate to candidate matching page with job ID as query parameter
    navigate(`/candidate-matching?jobId=${job.id}&jobTitle=${encodeURIComponent(job.title)}`)
  }

  const handleCloseApplicationForm = () => {
    setOpenApplicationForm(false)
  }

  // Filter handlers
  const handleOpenFilterDialog = () => {
    setOpenFilterDialog(true)
  }

  const handleCloseFilterDialog = () => {
    setOpenFilterDialog(false)
  }

  const handleFilterChange = (filterName: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }))
  }

  const handleClearFilters = () => {
    setFilters({
      jobType: '',
      experienceLevel: '',
      location: '',
      status: '',
      company: '',
      workMode: '',
      salaryRange: '',
      department: ''
    })
  }

  const getActiveFilterCount = () => {
    return Object.values(filters).filter(value => value !== '').length
  }

  const jobs = [
    {
      id: 1,
      title: 'Frontend Developer',
      company: '2464 Royal Ln. Mesa',
      salary: '$40/hr - $60/hr',
      postedTime: '5h ago',
      type: 'Full-Time',
      location: 'On-Site',
      workMode: 'On-site',
      status: 'Open',
      appliedCount: 19,
      interviewPending: 3,
      selected: 0,
      rejected: 1,
      experienceLevel: '<5 yrs',
      numberOfQuestions: 10,
      interviewType: 'AI Video Interview',
      resumeParsingEnabled: true,
      questionGenerationReady: false,
      expertReviewStatus: 'pending',
      description: 'We are looking for a skilled Frontend Developer to join our team. In this role, you will be responsible for developing user-facing web applications.',
      department: 'Engineering',
      application_deadline: '2026-02-15T23:59:59Z',
      fullDescription: 'We are looking for a skilled Frontend Developer to join our team. In this role, you will be responsible for developing user-facing web applications using modern frameworks and technologies.',
      requirements: ['React', 'JavaScript', 'HTML/CSS', 'Git'],
      responsibilities: ['Develop responsive web applications', 'Collaborate with designers', 'Write clean, maintainable code'],
      benefits: ['Health insurance', 'Flexible working hours', 'Professional development'],
      icon: 'fas fa-code',
      color: '#3b82f6',
      // Add both field formats for compatibility
      job_type: 'Full-Time',
      work_mode: 'On-site',
      experience_level: '<5 yrs',
      number_of_questions: 10,
      interview_type: 'AI Video Interview',
      created_at: '2026-01-28T12:00:00Z'
    },
    {
      id: 2,
      title: 'UI/UX Designer',
      company: '2464 Royal Ln. Mesa',
      salary: '$40/hr - $60/hr',
      postedTime: '5h ago',
      type: 'Full-Time',
      location: 'On-Site',
      workMode: 'Hybrid',
      status: 'Open',
      appliedCount: 19,
      interviewPending: 3,
      selected: 0,
      rejected: 1,
      experienceLevel: '<5 yrs',
      numberOfQuestions: 10,
      interviewType: 'AI Video Interview',
      resumeParsingEnabled: true,
      questionGenerationReady: false,
      expertReviewStatus: 'pending',
      description: 'We are looking for a creative UI/UX Designer to enhance user experience across our digital products.',
      department: 'Design',
      application_deadline: '2026-02-20T23:59:59Z',
      fullDescription: 'We are looking for a creative UI/UX Designer to enhance user experience across our digital products. You will work closely with product managers and developers.',
      requirements: ['Figma', 'Adobe Creative Suite', 'User Research', 'Prototyping'],
      responsibilities: ['Design user interfaces', 'Conduct user research', 'Create prototypes'],
      benefits: ['Health insurance', 'Creative workspace', 'Design tools budget'],
      icon: 'fas fa-palette',
      color: '#8b5cf6',
      // Add both field formats for compatibility
      job_type: 'Full-Time',
      work_mode: 'Hybrid',
      experience_level: '<5 yrs',
      number_of_questions: 10,
      interview_type: 'AI Video Interview',
      created_at: '2026-01-28T11:00:00Z'
    },
    {
      id: 3,
      title: 'Junior Developer',
      company: '2464 Royal Ln. Mesa',
      salary: '$40/hr - $60/hr',
      postedTime: '5h ago',
      type: 'Full-Time',
      location: 'Remote',
      workMode: 'Remote',
      status: 'Closed',
      appliedCount: 19,
      interviewPending: 3,
      selected: 0,
      rejected: 1,
      experienceLevel: '<5 yrs',
      numberOfQuestions: 10,
      interviewType: 'AI Video Interview',
      resumeParsingEnabled: true,
      questionGenerationReady: false,
      expertReviewStatus: 'pending',
      description: 'Entry-level position for new developers to start their career in software development.',
      department: 'Engineering',
      application_deadline: null,
      fullDescription: 'Entry-level position for new developers to start their career in software development. Perfect for recent graduates or career changers.',
      requirements: ['Basic programming knowledge', 'Willingness to learn', 'Problem-solving skills'],
      responsibilities: ['Learn new technologies', 'Work on small features', 'Participate in code reviews'],
      benefits: ['Mentorship program', 'Learning budget', 'Career growth'],
      icon: 'fas fa-code',
      color: '#059669',
      // Add both field formats for compatibility
      job_type: 'Full-Time',
      work_mode: 'Remote',
      experience_level: '<5 yrs',
      number_of_questions: 10,
      interview_type: 'AI Video Interview',
      created_at: '2026-01-28T10:00:00Z'
    }
  ]

  const handleJobCreate = (newJob: any) => {
    const updatedJobs = [newJob, ...allJobs]
    setAllJobs(updatedJobs)
    setFilteredJobs(updatedJobs)
    // Refresh jobs from API
    loadJobsFromAPI()
  }

  if (!user) {
    return <div>Please login to access jobs</div>
  }

  // Show job details if selected
  if (showJobDetails && selectedJob) {
    return (
      <Navigation>
        <JobDetails
          selectedJob={selectedJob}
          onClose={handleCloseJobDetails}
          onApplyNow={handleApplyNow}
          onViewCandidates={handleViewCandidates}
          onJobSelect={(job) => {
            // Update the selected job to show new job details
            setSelectedJob(job)
          }}
        />
        
        {/* Job Application Dialog - Also needed in job details view */}
        <JobApplicationForm 
          open={openApplicationForm}
          onClose={handleCloseApplicationForm}
          job={selectedJob}
          onApplicationSubmitted={checkApplicationStatusForJobs}
        />
      </Navigation>
    )
  }

  return (
    <Navigation>
      <Box sx={{ padding: '20px', background: '#f8f9fa', minHeight: '100vh' }}>
        {/* Header with Search, Filter, and Add Job in one line */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '15px' }}>
          <Box>
            {/* Search */}
            <TextField
              placeholder="Search by job title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              variant="outlined"
              size="small"
              sx={{
                minWidth: '300px',
                '& .MuiOutlinedInput-root': {
                  borderRadius: '8px',
                  backgroundColor: 'white'
                }
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <i className="fas fa-search" style={{ color: '#6c757d' }}></i>
                    </InputAdornment>
                  ),
                }
              }}
            />
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1, justifyContent: 'flex-end' }}>
             
            {/* Add Job Button - Only for Recruiters and Admins */}
            <CanCreateJob>
              <Button
                variant="contained"
                onClick={handleOpenAddJobDialog}
               sx={{
                background: 'rgba(245, 158, 11, 0.1)',
                color: '#f59e0b',
                border: '2px solid #f59e0b',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '120px',
                '&:hover': {
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderColor: '#f59e0b',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(99, 102, 241, 0.25)'
                }
              }}
              >
                <i className="fas fa-plus"></i> Add Job
              </Button>
            </CanCreateJob>
            
            {/* Filter Button */}
            <Button
              variant="outlined"
              onClick={handleOpenFilterDialog}
              sx={{
            background: 'white',
            color: '#64748b',
            border: '2px solid #e2e8f0',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 600,
            textTransform: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: '100px',
            position: 'relative',
            '&:hover': {
              borderColor: '#f59e0b',
              color: '#f59e0b',
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 25px rgba(245, 158, 11, 0.15)'
            }
          }}
            >
              <i className="fas fa-filter" style={{ marginRight: '8px' }}></i>
              Filter
              {getActiveFilterCount() > 0 && (
                <Chip 
                  label={getActiveFilterCount()} 
                  size="small" 
                  sx={{ 
                    backgroundColor: '#f59e0b', 
                    color: 'white', 
                    fontSize: '10px',
                    height: '18px',
                    minWidth: '18px'
                  }} 
                />
              )}
            </Button>
           
          </Box>
        </Box>

        {/* Active Filters Display */}
        {getActiveFilterCount() > 0 && (
          <Box sx={{ marginBottom: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
              Active Filters:
            </Typography>
            {Object.entries(filters).map(([key, value]) => 
              value && (
                <Chip
                  key={key}
                  label={`${key}: ${value}`}
                  onDelete={() => handleFilterChange(key, '')}
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    color: '#f59e0b',
                    border: '1px solid #f59e0b'
                  }}
                />
              )
            )}
            <Button
              size="small"
              onClick={handleClearFilters}
              sx={{ color: '#64748b', fontSize: '12px' }}
            >
              Clear All
            </Button>
          </Box>
        )}

        {/* Jobs Grid - 3 per row */}
        {filteredJobs.length === 0 && (searchQuery.trim() || getActiveFilterCount() > 0) ? (
          <Box sx={{ 
            gridColumn: '1 / -1', 
            textAlign: 'center', 
            padding: '40px',
            color: '#64748b'
          }}>
            <i className="fas fa-search" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}></i>
            <Typography variant="h6" sx={{ marginBottom: '8px' }}>
              No jobs found
            </Typography>
            <Typography variant="body2">
              Try adjusting your search terms or filters
            </Typography>
            <Button 
              onClick={() => {
                setSearchQuery('')
                handleClearFilters()
              }}
              sx={{ marginTop: '16px', color: '#f59e0b' }}
            >
              Clear Search & Filters
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { sm: "1fr 1fr ", lg: "1fr 1fr 1fr" }, gap: "10px" }}>
            {filteredJobs.map((job) => (
            <Box key={job.id} sx={{ marginBottom: '50px' }}>
              <Card sx={{
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #e9ecef',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  transform: 'translateY(-2px)'
                },
                transition: 'all 0.3s ease'
              }}>
                {/* Job Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                  <Box sx={{ 
                    backgroundColor: job.color, 
                    marginRight: '12px',
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i className={job.icon} style={{ fontSize: '18px', color: 'white' }}></i>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '16px', marginBottom: '2px' }}>
                      {job.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6c757d', fontSize: '14px' }}>
                      {job.company}
                    </Typography>
                  </Box>
                </Box>

                {/* Job Details */}
                <Box sx={{ marginBottom: '15px' }}>
                  <Typography variant="body2" sx={{ color: '#6c757d', fontSize: '14px', marginBottom: '8px' }}>
                    📍 {job.location} • {getWorkMode(job)}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <Chip 
                      label={getJobType(job)} 
                      size="small" 
                      sx={{ 
                        backgroundColor: '#e3f2fd',
                        color: '#1976d2',
                        fontSize: '12px'
                      }} 
                    />
                    <Chip 
                      label={job.status} 
                      size="small" 
                      sx={{ 
                        backgroundColor: job.status === 'Open' ? '#e8f5e8' : job.status === 'Closed' ? '#ffebee' : '#fff3e0',
                        color: job.status === 'Open' ? '#2e7d32' : job.status === 'Closed' ? '#c62828' : '#ef6c00',
                        fontSize: '12px'
                      }} 
                    />
                    <Chip 
                      label={getExperienceLevel(job)} 
                      size="small" 
                      sx={{ 
                        backgroundColor: '#f3e8ff',
                        color: '#7c3aed',
                        fontSize: '12px'
                      }} 
                    />
                  </Box>
                </Box>

                {/* Description */}
                <Typography variant="body2" sx={{ 
                  color: '#495057', 
                  fontSize: '14px',
                  marginBottom: '15px',
                  flex: 1,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {job.description}
                </Typography>

                {/* Salary and Time */}
                <Box sx={{ marginBottom: '15px' }}>
                  <Typography variant="body2" sx={{ 
                    color: '#28a745', 
                    fontWeight: 600,
                    fontSize: '14px',
                    marginBottom: '4px'
                  }}>
                    {job.salary}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#6c757d', fontSize: '12px' }}>
                    {job.postedTime}
                  </Typography>
                </Box>

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', gap: '8px' }}>
                  <Button 
                    variant="outlined" 
                    size="small"
                    onClick={() => handleViewJobDetails(job)}
                   sx={{
                  flex: 1,
                  background: 'white',
                  color: '#64748b',
                  border: '2px solid #e2e8f0',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: '#cbd5e1',
                    background: '#f8fafc'
                  }
                }}
                  >
                    View Details
                  </Button>
                  <CanApplyJobs fallback={
                    <Button 
                      variant="outlined" 
                      size="small"
                      disabled
                      sx={{
                        flex: 1,
                        background: '#f1f5f9',
                        color: '#94a3b8',
                        border: '2px solid #e2e8f0',
                        padding: '10px 16px',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        textTransform: 'none',
                      }}
                    >
                      View Only
                    </Button>
                  }>
                    {jobApplicationStatus[job.id] ? (
                      // Already Applied Button
                      <Button 
                        variant="contained" 
                        size="small"
                        disabled
                        sx={{
                          flex: 1,
                          background: '#dcfce7',
                          color: '#166534',
                          // border: '2px solid grey',
                          // padding: '10px 16px',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: 600,
                          textTransform: 'none',
                          cursor: 'not-allowed',
                          '&:hover': {
                            background: '#dcfce7',
                            borderColor: '#bbf7d0',
                          }
                        }}
                      >
                        <i className="fas fa-check-circle" style={{ marginRight: '6px', fontSize: '12px' }}></i>
                         Applied
                      </Button>
                    ) : (
                      // Apply Now Button
                      <Button 
                        variant="contained" 
                        size="small"
                        onClick={() => {
                          console.log('Apply Now clicked for job:', job.id)
                          console.log('Application status:', jobApplicationStatus[job.id])
                          handleApplyNow(job)
                        }}
                        sx={{
                          flex: 1,
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
                        Apply Now
                      </Button>
                    )}
                  </CanApplyJobs>
                </Box>
              </Card>
            </Box>
          ))}
        </Box>
        )}

        {/* Filter Dialog */}
        <Dialog
          open={openFilterDialog}
          onClose={handleCloseFilterDialog}
          maxWidth="lg"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                borderRadius: '20px',
                maxHeight: '85vh',
                background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(245, 158, 11, 0.1)'
              }
            }
          }}
        >
          <DialogTitle sx={{ padding: '32px 32px 0 32px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Box sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 25px rgba(245, 158, 11, 0.3)'
                }}>
                  <i className="fas fa-filter" style={{ color: 'white', fontSize: '20px' }}></i>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                    Filter Jobs
                  </Typography>
                  <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                    Find the perfect job with advanced filters
                  </Typography>
                </Box>
              </Box>
              <IconButton 
                onClick={handleCloseFilterDialog} 
                sx={{ 
                  color: '#64748b',
                  backgroundColor: 'rgba(100, 116, 139, 0.1)',
                  borderRadius: '12px',
                  padding: '12px',
                  '&:hover': {
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    color: '#f59e0b',
                    transform: 'scale(1.05)'
                  },
                  transition: 'all 0.2s ease'
                }}
              >
                <i className="fas fa-times" style={{ fontSize: '16px' }}></i>
              </IconButton>
            </Box>
          </DialogTitle>

          <DialogContent sx={{ padding: '32px', paddingTop: '24px' }}>
            {/* Filter Categories */}
            <Box sx={{ marginBottom: '32px' }}>
              <Typography sx={{ 
                fontSize: '16px', 
                fontWeight: 600, 
                color: '#374151', 
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="fas fa-sliders-h" style={{ color: '#f59e0b', fontSize: '14px' }}></i>
                Filter Categories
              </Typography>
              
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                
                {/* Job Basics Section */}
                <Box sx={{
                  padding: '24px',
                  borderRadius: '16px',
                  background: 'white',
                  border: '2px solid #f1f5f9',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  '&:hover': {
                    borderColor: 'rgba(245, 158, 11, 0.3)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)'
                  },
                  transition: 'all 0.3s ease'
                }}>
                  <Typography sx={{ 
                    fontSize: '14px', 
                    fontWeight: 700, 
                    color: '#1e293b', 
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fas fa-briefcase" style={{ color: '#3b82f6', fontSize: '12px' }}></i>
                    Job Basics
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Job Type */}
                    <FormControl fullWidth>
                      <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                        Job Type
                      </Typography>
                      <Select
                        value={filters.jobType}
                        onChange={(e) => handleFilterChange('jobType', e.target.value)}
                        displayEmpty
                        sx={{
                          borderRadius: '12px',
                          backgroundColor: '#f8fafc',
                          border: 'none',
                          '& .MuiOutlinedInput-notchedOutline': { 
                            border: '2px solid #e2e8f0',
                            borderRadius: '12px'
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': { 
                            borderColor: '#f59e0b' 
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { 
                            borderColor: '#f59e0b',
                            boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                          },
                          '& .MuiSelect-select': { 
                            padding: '12px 16px', 
                            fontSize: '14px',
                            fontWeight: 500
                          }
                        }}
                      >
                        <MenuItem value="">All Types</MenuItem>
                        <MenuItem value="Full-Time">Full-Time</MenuItem>
                        <MenuItem value="Part-Time">Part-Time</MenuItem>
                        <MenuItem value="Contract">Contract</MenuItem>
                        <MenuItem value="Internship">Internship</MenuItem>
                      </Select>
                    </FormControl>

                    {/* Experience Level */}
                    <FormControl fullWidth>
                      <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                        Experience Level
                      </Typography>
                      <Select
                        value={filters.experienceLevel}
                        onChange={(e) => handleFilterChange('experienceLevel', e.target.value)}
                        displayEmpty
                        sx={{
                          borderRadius: '12px',
                          backgroundColor: '#f8fafc',
                          '& .MuiOutlinedInput-notchedOutline': { 
                            border: '2px solid #e2e8f0',
                            borderRadius: '12px'
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': { 
                            borderColor: '#f59e0b' 
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { 
                            borderColor: '#f59e0b',
                            boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                          },
                          '& .MuiSelect-select': { 
                            padding: '12px 16px', 
                            fontSize: '14px',
                            fontWeight: 500
                          }
                        }}
                      >
                        <MenuItem value="">All Levels</MenuItem>
                        <MenuItem value="Entry Level">Entry Level</MenuItem>
                        <MenuItem value="<5 yrs">Less than 5 years</MenuItem>
                        <MenuItem value="5-10 yrs">5-10 years</MenuItem>
                        <MenuItem value="10+ yrs">10+ years</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                </Box>

                {/* Work Environment Section */}
                <Box sx={{
                  padding: '24px',
                  borderRadius: '16px',
                  background: 'white',
                  border: '2px solid #f1f5f9',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  '&:hover': {
                    borderColor: 'rgba(245, 158, 11, 0.3)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)'
                  },
                  transition: 'all 0.3s ease'
                }}>
                  <Typography sx={{ 
                    fontSize: '14px', 
                    fontWeight: 700, 
                    color: '#1e293b', 
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fas fa-map-marker-alt" style={{ color: '#10b981', fontSize: '12px' }}></i>
                    Work Environment
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Work Mode */}
                    <FormControl fullWidth>
                      <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                        Work Mode
                      </Typography>
                      <Select
                        value={filters.workMode}
                        onChange={(e) => handleFilterChange('workMode', e.target.value)}
                        displayEmpty
                        sx={{
                          borderRadius: '12px',
                          backgroundColor: '#f8fafc',
                          '& .MuiOutlinedInput-notchedOutline': { 
                            border: '2px solid #e2e8f0',
                            borderRadius: '12px'
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': { 
                            borderColor: '#f59e0b' 
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { 
                            borderColor: '#f59e0b',
                            boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                          },
                          '& .MuiSelect-select': { 
                            padding: '12px 16px', 
                            fontSize: '14px',
                            fontWeight: 500
                          }
                        }}
                      >
                        <MenuItem value="">All Modes</MenuItem>
                        <MenuItem value="Remote">🏠 Remote</MenuItem>
                        <MenuItem value="On-site">🏢 On-site</MenuItem>
                        <MenuItem value="Hybrid">🔄 Hybrid</MenuItem>
                      </Select>
                    </FormControl>

                    {/* Location */}
                    <Box>
                      <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                        Location
                      </Typography>
                      <TextField
                        fullWidth
                        placeholder="Enter city or location..."
                        value={filters.location}
                        onChange={(e) => handleFilterChange('location', e.target.value)}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '12px',
                            backgroundColor: '#f8fafc',
                            border: '2px solid #e2e8f0',
                            '&:hover': { 
                              borderColor: '#f59e0b' 
                            },
                            '&.Mui-focused': { 
                              borderColor: '#f59e0b',
                              boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                            }
                          },
                          '& .MuiOutlinedInput-input': {
                            padding: '12px 16px',
                            fontSize: '14px',
                            fontWeight: 500
                          }
                        }}
                      />
                    </Box>
                  </Box>
                </Box>

                {/* Company & Status Section */}
                <Box sx={{
                  padding: '24px',
                  borderRadius: '16px',
                  background: 'white',
                  border: '2px solid #f1f5f9',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  '&:hover': {
                    borderColor: 'rgba(245, 158, 11, 0.3)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)'
                  },
                  transition: 'all 0.3s ease'
                }}>
                  <Typography sx={{ 
                    fontSize: '14px', 
                    fontWeight: 700, 
                    color: '#1e293b', 
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <i className="fas fa-building" style={{ color: '#8b5cf6', fontSize: '12px' }}></i>
                    Company & Status
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Status */}
                    <FormControl fullWidth>
                      <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                        Job Status
                      </Typography>
                      <Select
                        value={filters.status}
                        onChange={(e) => handleFilterChange('status', e.target.value)}
                        displayEmpty
                        sx={{
                          borderRadius: '12px',
                          backgroundColor: '#f8fafc',
                          '& .MuiOutlinedInput-notchedOutline': { 
                            border: '2px solid #e2e8f0',
                            borderRadius: '12px'
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': { 
                            borderColor: '#f59e0b' 
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { 
                            borderColor: '#f59e0b',
                            boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                          },
                          '& .MuiSelect-select': { 
                            padding: '12px 16px', 
                            fontSize: '14px',
                            fontWeight: 500
                          }
                        }}
                      >
                        <MenuItem value="">All Status</MenuItem>
                        <MenuItem value="Open">🟢 Open</MenuItem>
                        <MenuItem value="Closed">🔴 Closed</MenuItem>
                        <MenuItem value="Paused">🟡 Paused</MenuItem>
                        <MenuItem value="Interview In Progress">🔵 Interview In Progress</MenuItem>
                      </Select>
                    </FormControl>

                    {/* Department */}
                    <FormControl fullWidth>
                      <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                        Department
                      </Typography>
                      <Select
                        value={filters.department}
                        onChange={(e) => handleFilterChange('department', e.target.value)}
                        displayEmpty
                        sx={{
                          borderRadius: '12px',
                          backgroundColor: '#f8fafc',
                          '& .MuiOutlinedInput-notchedOutline': { 
                            border: '2px solid #e2e8f0',
                            borderRadius: '12px'
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': { 
                            borderColor: '#f59e0b' 
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { 
                            borderColor: '#f59e0b',
                            boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                          },
                          '& .MuiSelect-select': { 
                            padding: '12px 16px', 
                            fontSize: '14px',
                            fontWeight: 500
                          }
                        }}
                      >
                        <MenuItem value="">All Departments</MenuItem>
                        <MenuItem value="Engineering">💻 Engineering</MenuItem>
                        <MenuItem value="Design">🎨 Design</MenuItem>
                        <MenuItem value="Product">💡 Product</MenuItem>
                        <MenuItem value="Marketing">📢 Marketing</MenuItem>
                        <MenuItem value="Sales">📈 Sales</MenuItem>
                        <MenuItem value="HR">👥 HR</MenuItem>
                      </Select>
                    </FormControl>

                    {/* Company */}
                    <Box>
                      <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                        Company Name
                      </Typography>
                      <TextField
                        fullWidth
                        placeholder="Enter company name..."
                        value={filters.company}
                        onChange={(e) => handleFilterChange('company', e.target.value)}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '12px',
                            backgroundColor: '#f8fafc',
                            border: '2px solid #e2e8f0',
                            '&:hover': { 
                              borderColor: '#f59e0b' 
                            },
                            '&.Mui-focused': { 
                              borderColor: '#f59e0b',
                              boxShadow: '0 0 0 3px rgba(245, 158, 11, 0.1)'
                            }
                          },
                          '& .MuiOutlinedInput-input': {
                            padding: '12px 16px',
                            fontSize: '14px',
                            fontWeight: 500
                          }
                        }}
                      />
                    </Box>
                  </Box>
                </Box>

              </Box>
            </Box>

            {/* Quick Filter Chips */}
            {getActiveFilterCount() > 0 && (
              <Box sx={{ 
                padding: '20px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(245, 158, 11, 0.1) 100%)',
                border: '2px solid rgba(245, 158, 11, 0.2)',
                marginBottom: '24px'
              }}>
                <Typography sx={{ 
                  fontSize: '14px', 
                  fontWeight: 600, 
                  color: '#92400e', 
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <i className="fas fa-tags" style={{ fontSize: '12px' }}></i>
                  Active Filters ({getActiveFilterCount()})
                </Typography>
                <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.entries(filters).map(([key, value]) => 
                    value && (
                      <Chip
                        key={key}
                        label={`${key}: ${value}`}
                        onDelete={() => handleFilterChange(key, '')}
                        size="small"
                        sx={{
                          backgroundColor: 'white',
                          color: '#f59e0b',
                          border: '2px solid #f59e0b',
                          fontWeight: 600,
                          '& .MuiChip-deleteIcon': {
                            color: '#f59e0b',
                            '&:hover': {
                              color: '#d97706'
                            }
                          }
                        }}
                      />
                    )
                  )}
                </Box>
              </Box>
            )}
          </DialogContent>

          <DialogActions sx={{ 
            padding: '24px 32px 32px 32px', 
            gap: '16px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
            borderTop: '2px solid #f1f5f9'
          }}>
            <Button
              onClick={handleClearFilters}
              sx={{
                color: '#64748b',
                backgroundColor: 'white',
                border: '2px solid #e2e8f0',
                padding: '12px 24px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                minWidth: '120px',
                '&:hover': { 
                  borderColor: '#f59e0b', 
                  backgroundColor: 'rgba(245, 158, 11, 0.05)',
                  color: '#f59e0b',
                  transform: 'translateY(-1px)',
                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)'
                },
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fas fa-eraser" style={{ marginRight: '8px', fontSize: '12px' }}></i>
              Clear All
            </Button>
            <Button
              onClick={handleCloseFilterDialog}
              sx={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: 'white',
                padding: '12px 32px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                minWidth: '140px',
                boxShadow: '0 8px 25px rgba(245, 158, 11, 0.3)',
                '&:hover': { 
                  background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 12px 35px rgba(245, 158, 11, 0.4)'
                },
                transition: 'all 0.2s ease'
              }}
            >
              <i className="fas fa-check" style={{ marginRight: '8px', fontSize: '12px' }}></i>
              Apply Filters
            </Button>
          </DialogActions>
        </Dialog>

        {/* Job Creation Dialog */}
        <JobCreationForm 
          open={openAddJobDialog} 
          onClose={handleCloseAddJobDialog}
          onJobCreate={handleJobCreate}
        />

        {/* Job Application Dialog */}
        <JobApplicationForm 
          open={openApplicationForm}
          onClose={handleCloseApplicationForm}
          job={selectedJob}
          onApplicationSubmitted={checkApplicationStatusForJobs}
        />
      </Box>
    </Navigation>
  )
}

export default Jobs