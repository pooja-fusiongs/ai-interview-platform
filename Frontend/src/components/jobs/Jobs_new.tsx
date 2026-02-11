import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
  DialogContent,
  FormControl,
  // InputLabel,
  Select,
  MenuItem,
  IconButton
} from '@mui/material'
import Navigation from '../layout/Sidebar'
import JobCreationForm from './JobCreationForm'
import JobApplicationForm from './JobApplicationForm'
import JobDetails from './JobDetails'
import { CanCreateJob, CanApplyJobs } from '../common/RoleBasedComponent'

const Jobs = () => {
  const navigate = useNavigate()
  const location = useLocation()
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

  // Auto-open job details when navigating back from Manage/View Candidates
  useEffect(() => {
    const state = location.state as { openJobId?: number | string } | null
    if (state?.openJobId && allJobs.length > 0) {
      const job = allJobs.find((j: any) => String(j.id) === String(state.openJobId))
      if (job) {
        setSelectedJob(job)
        setShowJobDetails(true)
      }
      navigate('/jobs', { replace: true })
    }
  }, [allJobs, location.state])

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
      'Engineering': '#1A22E0',
      'Design': '#5560FF',
      'Product': '#059669',
      'Marketing': '#2E38F7',
      'Sales': '#ef4444',
      'HR': '#06b6d4'
    }
    return colors[department] || '#2E38F7'
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
      <Box sx={{ padding: { xs: '12px', sm: '16px', md: '20px' }, background: '#f8f9fa', minHeight: '100vh' }}>
        {/* Header with Search, Filter, and Add Job */}
        <Box sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          marginBottom: { xs: '16px', md: '20px' },
          gap: { xs: '12px', sm: '15px' }
        }}>
          <Box sx={{ width: { xs: '100%', sm: 'auto' } }}>
            {/* Search */}
            <TextField
              placeholder="Search by job title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              sx={{
                minWidth: { xs: 'auto', sm: '250px', md: '300px' },
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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '8px', sm: '15px' }, justifyContent: { xs: 'space-between', sm: 'flex-end' } }}>
             
            {/* Add Job Button - Only for Recruiters and Admins */}
            <CanCreateJob>
              <Button
                variant="contained"
                onClick={handleOpenAddJobDialog}
                startIcon={<i className="fas fa-plus"></i>}
                sx={{
                  color:"#fffff",'&:hover':{
                background:"#06109E"
               },
                  fontSize: { xs: '12px', sm: '14px' },
                  minWidth: { xs: 'auto', sm: '120px' },
                  padding: { xs: '8px 12px', sm: '8px 16px' },
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Add Job</Box>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Add</Box>
              </Button>
            </CanCreateJob>
            
            {/* Filter Button */}
            <Button
              variant="outlined"
              onClick={handleOpenFilterDialog}
              startIcon={<i className="fas fa-filter"></i>}
              sx={{
                fontSize: { xs: '12px', sm: '14px' },
                minWidth: { xs: 'auto', sm: '100px' },
                padding: { xs: '8px 12px', sm: '8px 16px' },
                position: 'relative',
              }}
            >
              Filter
              {getActiveFilterCount() > 0 && (
                <Chip 
                  label={getActiveFilterCount()} 
                  size="small" 
                  color="primary"
                  sx={{ 
                    marginLeft: '8px',
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
            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
              Active Filters:
            </Typography>
            {Object.entries(filters).map(([key, value]) => 
              value && (
                <Chip
                  key={key}
                  label={`${key}: ${value}`}
                  onDelete={() => handleFilterChange(key, '')}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )
            )}
            <Button
              size="small"
              onClick={handleClearFilters}
              color="secondary"
              sx={{ fontSize: '12px' }}
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
              variant="outlined"
              color="primary"
              sx={{ marginTop: '16px' }}
            >
              Clear Search & Filters
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1fr 1fr 1fr" }, gap: { xs: "12px", sm: "10px" } }}>
            {filteredJobs.map((job) => (
            <Box key={job.id} sx={{ marginBottom: { xs: '16px', sm: '30px', md: '50px' } }}>
              <Card sx={{
                padding: { xs: '14px', sm: '18px', md: '20px' },
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
                <Box sx={{ display: 'flex', alignItems: 'center', marginBottom: { xs: '12px', md: '15px' } }}>
                  <Box sx={{
                    backgroundColor: job.color,
                    marginRight: { xs: '10px', md: '12px' },
                    width: { xs: 36, md: 40 },
                    height: { xs: 36, md: 40 },
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <i className={job.icon} style={{ fontSize: '16px', color: 'white' }}></i>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, fontSize: { xs: '14px', sm: '15px', md: '16px' }, marginBottom: '2px' }}>
                      {job.title}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6c757d', fontSize: { xs: '12px', md: '14px' } }}>
                      {job.company}
                    </Typography>
                  </Box>
                </Box>

                {/* Job Details */}
                <Box sx={{ marginBottom: { xs: '12px', md: '15px' } }}>
                  <Typography variant="body2" sx={{ color: '#6c757d', fontSize: { xs: '12px', md: '14px' }, marginBottom: '8px' }}>
                    📍 {job.location} • {getWorkMode(job)}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: { xs: '4px', sm: '8px' }, marginBottom: '8px', flexWrap: 'wrap' }}>
                    <Chip
                      label={getJobType(job)}
                      size="small"
                      sx={{
                        backgroundColor: '#e3f2fd',
                        color: '#1976d2',
                        fontSize: { xs: '10px', sm: '12px' },
                        height: { xs: '22px', sm: '24px' }
                      }}
                    />
                    <Chip
                      label={job.status}
                      size="small"
                      sx={{
                        backgroundColor: job.status === 'Open' ? '#e8f5e8' : job.status === 'Closed' ? '#ffebee' : '#fff3e0',
                        color: job.status === 'Open' ? '#2e7d32' : job.status === 'Closed' ? '#c62828' : '#ef6c00',
                        fontSize: { xs: '10px', sm: '12px' },
                        height: { xs: '22px', sm: '24px' }
                      }}
                    />
                    <Chip
                      label={getExperienceLevel(job)}
                      size="small"
                      sx={{
                        backgroundColor: '#f3e8ff',
                        color: '#7c3aed',
                        fontSize: { xs: '10px', sm: '12px' },
                        height: { xs: '22px', sm: '24px' }
                      }}
                    />
                  </Box>
                </Box>

                {/* Description */}
                <Typography variant="body2" sx={{
                  color: '#495057',
                  fontSize: { xs: '12px', md: '14px' },
                  marginBottom: { xs: '12px', md: '15px' },
                  flex: 1,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {job.description}
                </Typography>

                {/* Salary and Time */}
                <Box sx={{ marginBottom: { xs: '12px', md: '15px' } }}>
                  <Typography variant="body2" sx={{
                    color: '#28a745',
                    fontWeight: 600,
                    fontSize: { xs: '12px', md: '14px' },
                    marginBottom: '4px'
                  }}>
                    {job.salary}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#6c757d', fontSize: { xs: '11px', md: '12px' } }}>
                    {job.postedTime}
                  </Typography>
                </Box>

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', gap: { xs: '6px', sm: '8px' } }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => handleViewJobDetails(job)}
                   sx={{
                  flex: 1,
                  background: 'white',
                  color: '#64748b',
                  border: '2px solid #e2e8f0',
                  padding: { xs: '8px 10px', sm: '10px 16px' },
                  borderRadius: '8px',
                  fontSize: { xs: '12px', sm: '14px' },
                  fontWeight: 600,
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: '#cbd5e1',
                    background: '#f8fafc'
                  }
                }}
                  >
                    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>View Details</Box>
                    <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Details</Box>
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
                        size="small"
                        disabled
                        sx={{
                          flex: 1,
                          background: 'rgba(0, 0, 0, 0.26)',
                          color: 'grey',
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
                          padding: '10px 16px',
                          borderRadius: '8px',
                          fontSize: '14px',
                          fontWeight: 600,
                          textTransform: 'none',
                          background: 'linear-gradient(135deg, #020291 0%, #01016b 100%)',
                          color: '#ffffff',
                          '&:hover': {
                            background: 'linear-gradient(135deg, #01016b 0%, #010150 100%)',
                            transform: 'translateY(-1px)',
                            boxShadow: '0 4px 12px rgba(2, 2, 145, 0.3)'
                          }
                        }}
                      >
                        <i className="fas fa-paper-plane" style={{ marginRight: '6px', fontSize: '12px' }}></i>
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
          maxWidth="sm"
          fullWidth
          slotProps={{
            paper: {
              sx: {
                borderRadius: '16px',
                maxHeight: '90vh',
                overflow: 'hidden',
              }
            }
          }}
        >
          {/* Header */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid #e5e7eb',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Box sx={{
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: `linear-gradient(135deg, ${'#020291'} 0%, ${'#0F17BF'} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <i className="fas fa-sliders-h" style={{ color: 'white', fontSize: '16px' }}></i>
              </Box>
              <Box>
                <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>
                  Filter Jobs
                </Typography>
                <Typography sx={{ fontSize: '13px', color: '#94a3b8' }}>
                  {getActiveFilterCount() > 0
                    ? `${getActiveFilterCount()} filter${getActiveFilterCount() > 1 ? 's' : ''} active`
                    : 'Narrow down your search'
                  }
                </Typography>
              </Box>
            </Box>
            <IconButton
              onClick={handleCloseFilterDialog}
              size="small"
              sx={{
                color: '#94a3b8',
                '&:hover': { backgroundColor: '#f1f5f9', color: '#64748b' },
              }}
            >
              <i className="fas fa-times" style={{ fontSize: '14px' }}></i>
            </IconButton>
          </Box>

          {/* Active Filter Chips */}
          {getActiveFilterCount() > 0 && (
            <Box sx={{
              padding: '12px 24px',
              backgroundColor: '#EEF0FF',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              gap: '6px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              {Object.entries(filters).map(([key, value]) =>
                value && (
                  <Chip
                    key={key}
                    label={value}
                    onDelete={() => handleFilterChange(key, '')}
                    size="small"
                    sx={{
                      backgroundColor: 'white',
                      color: '#020291',
                      border: `1px solid ${'#BBC3FF'}`,
                      fontSize: '12px',
                      fontWeight: 600,
                      height: '28px',
                      '& .MuiChip-deleteIcon': {
                        color: '#5560FF',
                        fontSize: '16px',
                        '&:hover': { color: '#020291' }
                      }
                    }}
                  />
                )
              )}
              <Chip
                label="Clear all"
                onClick={handleClearFilters}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: '11px',
                  fontWeight: 600,
                  height: '28px',
                  color: '#ef4444',
                  borderColor: '#fecaca',
                  '&:hover': { backgroundColor: '#fef2f2', borderColor: '#ef4444' }
                }}
              />
            </Box>
          )}

          {/* Filter Content */}
          <DialogContent sx={{ padding: '0 !important' }}>
            <Box sx={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Row 1: Job Type + Experience Level */}
              <Box>
                <Typography sx={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <i className="fas fa-briefcase" style={{ color: '#1A22E0', fontSize: '12px' }}></i>
                  Job Basics
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <FormControl fullWidth size="small">
                    <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                      Job Type
                    </Typography>
                    <Select
                      value={filters.jobType}
                      onChange={(e) => handleFilterChange('jobType', e.target.value)}
                      displayEmpty
                      sx={{
                        borderRadius: '10px',
                        backgroundColor: '#f8fafc',
                        fontSize: '13px',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5560FF' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1A22E0' },
                      }}
                    >
                      <MenuItem value="">All Types</MenuItem>
                      <MenuItem value="Full-Time">Full-Time</MenuItem>
                      <MenuItem value="Part-Time">Part-Time</MenuItem>
                      <MenuItem value="Contract">Contract</MenuItem>
                      <MenuItem value="Internship">Internship</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small">
                    <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                      Experience
                    </Typography>
                    <Select
                      value={filters.experienceLevel}
                      onChange={(e) => handleFilterChange('experienceLevel', e.target.value)}
                      displayEmpty
                      sx={{
                        borderRadius: '10px',
                        backgroundColor: '#f8fafc',
                        fontSize: '13px',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5560FF' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1A22E0' },
                      }}
                    >
                      <MenuItem value="">All Levels</MenuItem>
                      <MenuItem value="Entry Level">Entry Level</MenuItem>
                      <MenuItem value="<5 yrs">&lt;5 years</MenuItem>
                      <MenuItem value="5-10 yrs">5-10 years</MenuItem>
                      <MenuItem value="10+ yrs">10+ years</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Box>

              {/* Divider */}
              <Box sx={{ height: '1px', backgroundColor: '#f1f5f9' }} />

              {/* Row 2: Work Mode + Location */}
              <Box>
                <Typography sx={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <i className="fas fa-map-marker-alt" style={{ color: '#10b981', fontSize: '12px' }}></i>
                  Work Environment
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <FormControl fullWidth size="small">
                    <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                      Work Mode
                    </Typography>
                    <Select
                      value={filters.workMode}
                      onChange={(e) => handleFilterChange('workMode', e.target.value)}
                      displayEmpty
                      sx={{
                        borderRadius: '10px',
                        backgroundColor: '#f8fafc',
                        fontSize: '13px',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5560FF' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1A22E0' },
                      }}
                    >
                      <MenuItem value="">All Modes</MenuItem>
                      <MenuItem value="Remote">Remote</MenuItem>
                      <MenuItem value="On-site">On-site</MenuItem>
                      <MenuItem value="Hybrid">Hybrid</MenuItem>
                    </Select>
                  </FormControl>

                  <Box>
                    <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                      Location
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="City or location..."
                      value={filters.location}
                      onChange={(e) => handleFilterChange('location', e.target.value)}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <i className="fas fa-search" style={{ color: '#cbd5e1', fontSize: '12px' }}></i>
                            </InputAdornment>
                          ),
                        }
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '10px',
                          backgroundColor: '#f8fafc',
                          fontSize: '13px',
                          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5560FF' },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1A22E0' },
                        },
                      }}
                    />
                  </Box>
                </Box>
              </Box>

              {/* Divider */}
              <Box sx={{ height: '1px', backgroundColor: '#f1f5f9' }} />

              {/* Row 3: Status + Department */}
              <Box>
                <Typography sx={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <i className="fas fa-building" style={{ color: '#8b5cf6', fontSize: '12px' }}></i>
                  Company & Status
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <FormControl fullWidth size="small">
                    <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                      Status
                    </Typography>
                    <Select
                      value={filters.status}
                      onChange={(e) => handleFilterChange('status', e.target.value)}
                      displayEmpty
                      sx={{
                        borderRadius: '10px',
                        backgroundColor: '#f8fafc',
                        fontSize: '13px',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5560FF' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1A22E0' },
                      }}
                    >
                      <MenuItem value="">All Status</MenuItem>
                      <MenuItem value="Open">Open</MenuItem>
                      <MenuItem value="Closed">Closed</MenuItem>
                      <MenuItem value="Paused">Paused</MenuItem>
                      <MenuItem value="Interview In Progress">In Progress</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small">
                    <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                      Department
                    </Typography>
                    <Select
                      value={filters.department}
                      onChange={(e) => handleFilterChange('department', e.target.value)}
                      displayEmpty
                      sx={{
                        borderRadius: '10px',
                        backgroundColor: '#f8fafc',
                        fontSize: '13px',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5560FF' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1A22E0' },
                      }}
                    >
                      <MenuItem value="">All Departments</MenuItem>
                      <MenuItem value="Engineering">Engineering</MenuItem>
                      <MenuItem value="Design">Design</MenuItem>
                      <MenuItem value="Product">Product</MenuItem>
                      <MenuItem value="Marketing">Marketing</MenuItem>
                      <MenuItem value="Sales">Sales</MenuItem>
                      <MenuItem value="HR">HR</MenuItem>
                    </Select>
                  </FormControl>
                </Box>

                {/* Company Name - full width below */}
                <Box sx={{ marginTop: '12px' }}>
                  <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                    Company Name
                  </Typography>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search company..."
                    value={filters.company}
                    onChange={(e) => handleFilterChange('company', e.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <i className="fas fa-search" style={{ color: '#cbd5e1', fontSize: '12px' }}></i>
                          </InputAdornment>
                        ),
                      }
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '10px',
                        backgroundColor: '#f8fafc',
                        fontSize: '13px',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5560FF' },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1A22E0' },
                      },
                    }}
                  />
                </Box>
              </Box>
            </Box>
          </DialogContent>

          {/* Footer */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#fafbfc',
          }}>
            <Button
              onClick={handleClearFilters}
              variant="text"
              sx={{
                color: '#64748b',
                fontSize: '13px',
                fontWeight: 600,
                textTransform: 'none',
                padding: '8px 16px',
                '&:hover': { backgroundColor: '#f1f5f9', color: '#ef4444' }
              }}
              startIcon={<i className="fas fa-undo" style={{ fontSize: '11px' }}></i>}
            >
              Reset Filters
            </Button>
            <Button
              onClick={handleCloseFilterDialog}
              variant="contained"
              sx={{
                background: `linear-gradient(135deg, ${'#020291'} 0%, ${'#0F17BF'} 100%)`,
                color: 'white',
                fontSize: '13px',
                fontWeight: 600,
                textTransform: 'none',
                padding: '8px 28px',
                borderRadius: '10px',
                boxShadow: '0 4px 14px rgba(2, 2, 145, 0.3)',
                '&:hover': {
                  boxShadow: '0 6px 20px rgba(2, 2, 145, 0.4)',
                }
              }}
              startIcon={<i className="fas fa-check" style={{ fontSize: '11px' }}></i>}
            >
              Apply Filters
            </Button>
          </Box>
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