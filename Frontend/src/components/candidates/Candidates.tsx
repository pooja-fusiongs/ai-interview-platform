import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Candidate, CandidateFilters } from '../../types'
import { apiClient } from '../../services/api'
import { toast } from 'react-hot-toast'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Avatar,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  FormControlLabel,
  Checkbox,
  Slider,
  FormGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Select,
  InputLabel,
  FormControl,
  Tooltip,
  TablePagination,
  useMediaQuery,
  useTheme
} from '@mui/material'
import Navigation from '../layout/sidebar'
import { CloudUpload as CloudUploadIcon, Visibility as VisibilityIcon } from '@mui/icons-material'

const Candidates = () => {
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const [menuCandidate, setMenuCandidate] = useState<Candidate | null>(null)
  const [, setIsProfileOpen] = useState<boolean>(false)
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false)
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false)
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [sortField, setSortField] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [filters, setFilters] = useState<CandidateFilters>({
    statuses: { active: true, pending: true },
    departments: {},
    minScore: 0,
  })

  // New state for MVP features
  const [jobs, setJobs] = useState<any[]>([])
  const [isJobSelectOpen, setIsJobSelectOpen] = useState(false)
  const [activeAction, setActiveAction] = useState<'questions' | 'transcript' | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<number | ''>('')
  const [isTranscriptUploadOpen, setIsTranscriptUploadOpen] = useState(false)
  const [transcriptText, setTranscriptText] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [, setCandidateInterviews] = useState<any[]>([])
  const [candidateQuestionSessions, setCandidateQuestionSessions] = useState<Record<number, string>>({})

  // Fetch candidates from API
  const fetchCandidates = async () => {
    try {
      setLoading(true)
      console.log('🔍 Fetching candidates from API...')
      const response = await apiClient.get('/api/candidates')
      console.log('📊 Candidates API Response:', response.data)

      if (response.data.success && response.data.data) {
        setCandidates(response.data.data)
        console.log(`✅ Successfully loaded ${response.data.data.length} candidates`)

        // Populate candidateQuestionSessions from API response
        const sessions: Record<number, string> = {}
        response.data.data.forEach((candidate: any) => {
          if (candidate.questionSessionId) {
            sessions[candidate.id] = candidate.questionSessionId.toString()
          }
        })
        if (Object.keys(sessions).length > 0) {
          setCandidateQuestionSessions(prev => ({ ...prev, ...sessions }))
          console.log(`✅ Loaded ${Object.keys(sessions).length} question sessions from API`)
        }
      } else {
        console.warn('⚠️ No candidates data received from API')
        setCandidates([])
      }
    } catch (error) {
      console.error('❌ Error fetching candidates:', error)
      toast.error('Failed to load candidates')
      setCandidates([])
    } finally {
      setLoading(false)
    }
  }

  // Fetch jobs for selection
  const fetchJobs = async () => {
    try {
      const response = await apiClient.get('/api/jobs?status=Open')
      if (response.data) {
        setJobs(response.data)
      }
    } catch (error) {
      console.error('Error fetching jobs:', error)
    }
  }

  const fetchCandidateInterviews = async (candidateId: number) => {
    try {
      const response = await apiClient.get(`/api/candidates/${candidateId}/interviews`)
      if (response.data?.success) {
        setCandidateInterviews(response.data.interviews)
      }
    } catch (error) {
      console.error('Error fetching interviews:', error)
      setCandidateInterviews([])
    }
  }

  // Update online status for candidates
  const updateOnlineStatus = async () => {
    try {
      const response = await apiClient.get('/api/candidates/online-status')
      if (response.data.success && response.data.data) {
        const statusUpdates = response.data.data
        setCandidates(prevCandidates =>
          prevCandidates.map(candidate => {
            const statusUpdate = statusUpdates.find((update: any) => update.id === candidate.id)
            if (statusUpdate) {
              return {
                ...candidate,
                isOnline: statusUpdate.isOnline,
                onlineStatus: statusUpdate.onlineStatus,
                lastActivity: statusUpdate.lastActivity
              }
            }
            return candidate
          })
        )
      }
    } catch (error) {
      console.error('❌ Error updating online status:', error)
    }
  }

  // Update current user's activity
  const updateUserActivity = async () => {
    try {
      const token = localStorage.getItem('token')
      if (token) {
        // Get current user info from token
        const payload = JSON.parse(atob(token.split('.')[1]))
        const userId = payload.user_id

        if (userId) {
          await apiClient.post(`/api/candidates/${userId}/activity`)
          console.log('🔄 Updated user activity')
        }
      }
    } catch (error) {
      console.error('❌ Error updating user activity:', error)
    }
  }

  useEffect(() => {
    fetchCandidates()
    fetchJobs()
  }, [])

  // Set up real-time status updates
  useEffect(() => {
    const interval = setInterval(() => {
      updateOnlineStatus()
    }, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [])

  // Set up user activity tracking
  useEffect(() => {
    // Update activity immediately when component mounts
    updateUserActivity()

    // Set up periodic activity updates
    const activityInterval = setInterval(() => {
      updateUserActivity()
    }, 60000) // Update activity every minute

    // Track user interactions
    const handleUserActivity = () => {
      updateUserActivity()
    }

    // Add event listeners for user activity
    window.addEventListener('click', handleUserActivity)
    window.addEventListener('keypress', handleUserActivity)
    window.addEventListener('scroll', handleUserActivity)

    return () => {
      clearInterval(activityInterval)
      window.removeEventListener('click', handleUserActivity)
      window.removeEventListener('keypress', handleUserActivity)
      window.removeEventListener('scroll', handleUserActivity)
    }
  }, [])

  // Refresh candidates function for external use
  const refreshCandidates = () => {
    fetchCandidates()
  }

  const isMenuOpen = Boolean(menuAnchorEl)

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, candidate: Candidate) => {
    setMenuAnchorEl(event.currentTarget)
    setMenuCandidate(candidate)
  }

  const handleCloseMenu = () => {
    setMenuAnchorEl(null)
  }

  const handleViewProfile = () => {
    if (menuCandidate) {
      setIsProfileOpen(true)
      fetchCandidateInterviews(menuCandidate.id)
      handleCloseMenu()
    }
  }

  const handleViewDetails = (candidate: Candidate) => {
    setDetailCandidate(candidate)
    setIsDetailOpen(true)
    fetchCandidateInterviews(candidate.id)
  }

  const handleCloseDetails = () => {
    setIsDetailOpen(false)
    setDetailCandidate(null)
  }

  // const handleCloseProfile = () => {
  //   setIsProfileOpen(false)
  //   setMenuCandidate(null)
  // }

  const handleActionClick = (action: 'questions' | 'transcript') => {
    setActiveAction(action)
    setIsJobSelectOpen(true)
  }

  const handleJobSelectConfirm = async () => {
    if (!selectedJobId || !menuCandidate) return

    setIsJobSelectOpen(false)

    if (activeAction === 'questions') {
      performGenerateQuestions(selectedJobId as number)
    } else if (activeAction === 'transcript') {
      setIsTranscriptUploadOpen(true)
    }
  }

  const performGenerateQuestions = async (jobId: number) => {
    if (!menuCandidate) return
    try {
      setActionLoading(true)
      toast.loading('Generating questions...')
      const response = await apiClient.post(`/api/candidates/${menuCandidate.id}/generate-questions`, {
        job_id: jobId,
        total_questions: 10 // Default
      })
      toast.dismiss()

      // Save the session ID for this candidate
      const sessionId = response.data?.session_id || response.data?.id
      if (sessionId) {
        setCandidateQuestionSessions(prev => ({
          ...prev,
          [menuCandidate.id]: sessionId
        }))
        toast.success('Questions generated! Click "Review Questions" to approve.', { duration: 4000 })
      } else {
        toast.success('Questions generated successfully!')
      }
    } catch (error) {
      console.error(error)
      toast.dismiss()
      toast.error('Failed to generate questions')
    } finally {
      setActionLoading(false)
      setActiveAction(null)
    }
  }

  // AUTO-GENERATE SCORE WHEN TRANSCRIPT IS UPLOADED
  const handleTranscriptSubmit = async () => {
    if (!selectedJobId || !menuCandidate) return

    try {
      setActionLoading(true)
      toast.loading('Processing and generating score...')
      
      // If transcript text is provided, upload it first
      if (transcriptText && transcriptText.trim()) {
        await apiClient.post(`/api/candidates/${menuCandidate.id}/upload-transcript`, {
          job_id: selectedJobId,
          transcript_text: transcriptText
        })
      }
      
      // Generate score (works with or without transcript)
      const scoreResponse = await apiClient.post(`/api/candidates/${menuCandidate.id}/generate-score`, {
        job_id: selectedJobId
      })
      
      toast.dismiss()
      
      const hasTranscript = scoreResponse.data.has_transcript || false
      const message = hasTranscript 
        ? `Score generated from transcript: ${scoreResponse.data.score?.toFixed(1) || 0}%`
        : `Default score generated: ${scoreResponse.data.score?.toFixed(1) || 0}% (no transcript uploaded)`
      
      toast.success(message)

      // Update candidate state with transcript and new score
      setCandidates(prevCandidates =>
        prevCandidates.map(candidate =>
          candidate.id === menuCandidate.id
            ? { 
                ...candidate, 
                hasTranscript: hasTranscript,
                score: scoreResponse.data.score || candidate.score
              }
            : candidate
        )
      )

      // Update menuCandidate as well
      setMenuCandidate(prev => prev ? { 
        ...prev, 
        hasTranscript: hasTranscript,
        score: scoreResponse.data.score || prev.score
      } : null)

      setIsTranscriptUploadOpen(false)
      setTranscriptText('')

      // Refresh candidates to get updated data
      fetchCandidates()
    } catch (error) {
      console.error(error)
      toast.dismiss()
      toast.error('Failed to upload transcript or generate score')
    } finally {
      setActionLoading(false)
      setActiveAction(null)
    }
  }

  const isExportOpen = Boolean(exportAnchorEl)
  const handleOpenExport = (event: React.MouseEvent<HTMLElement>) => setExportAnchorEl(event.currentTarget)
  const handleCloseExport = () => setExportAnchorEl(null)
  const handleSetViewMode = (mode: 'card' | 'table') => {
    setViewMode(mode)
    handleCloseExport()
  }

  const handleOpenFilter = () => setIsFilterOpen(true)
  const handleCloseFilter = () => setIsFilterOpen(false)
  const handleClearFilter = () => {
    setFilters({
      statuses: { active: true, pending: true },
      departments: {},
      minScore: 0,
    })
  }

  // const allDepartments = Array.from(new Set(candidates.map(c => c.department))).sort()

  // Sorting function
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Get sort icon
  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <i className="fas fa-sort" style={{ color: '#cbd5e1', fontSize: '12px', marginLeft: '4px' }}></i>
    }
    return sortDirection === 'asc'
      ? <i className="fas fa-sort-up" style={{ color: '#f59e0b', fontSize: '12px', marginLeft: '4px' }}></i>
      : <i className="fas fa-sort-down" style={{ color: '#f59e0b', fontSize: '12px', marginLeft: '4px' }}></i>
  }

  const filteredCandidates = candidates.filter((candidate) => {
    const query = searchQuery.trim().toLowerCase()
    const haystack = [
      candidate.name,
      candidate.role,
      candidate.department,
      candidate.experience,
      candidate.email,
      candidate.phone,
      candidate.hireDate,
      candidate.skills.join(' ')
    ]
      .join(' ')
      .toLowerCase()

    // search filter
    const matchesSearch = !query ? true : haystack.includes(query)
    if (!matchesSearch) return false

    // status filter
    const statusAllowed = (filters.statuses as Record<string, boolean>)?.[candidate.status] ?? true
    if (!statusAllowed) return false

    // min score filter
    if (typeof candidate.score === 'number' && candidate.score < (filters.minScore ?? 0)) return false

    // department filter (only if any selected)
    const selectedDepartments = Object.entries((filters.departments as Record<string, boolean>) || {}).filter(([, v]) => v).map(([k]) => k)
    if (selectedDepartments.length > 0 && !selectedDepartments.includes(candidate.department)) return false

    return true
  })

  // Sort the filtered candidates
  const sortedCandidates = [...filteredCandidates].sort((a, b) => {
    if (!sortField) return 0

    let aValue: any = a[sortField as keyof Candidate]
    let bValue: any = b[sortField as keyof Candidate]

    // Handle special cases
    if (sortField === 'name') {
      aValue = a.name.toLowerCase()
      bValue = b.name.toLowerCase()
    } else if (sortField === 'role') {
      aValue = a.role.toLowerCase()
      bValue = b.role.toLowerCase()
    } else if (sortField === 'department') {
      aValue = a.department.toLowerCase()
      bValue = b.department.toLowerCase()
    } else if (sortField === 'status') {
      aValue = a.status.toLowerCase()
      bValue = b.status.toLowerCase()
    } else if (sortField === 'score') {
      aValue = a.score || 0
      bValue = b.score || 0
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Pagination handlers
  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  // Paginated data for table view
  const paginatedCandidates = sortedCandidates.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  )

  return (
    <Navigation>
      <Box sx={{ padding: { xs: '12px', sm: '16px', md: '20px' }, background: '#f8fafc', height: '100%' }}>
        <Box sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          flexWrap: 'wrap',
          gap: { xs: '12px', md: '16px' },
          marginBottom: { xs: '16px', md: '20px' },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between'
        }}>
          <Box sx={{ flex: 1, minWidth: { xs: '100%', sm: 260 }, maxWidth: { xs: '100%', md: 420 } }}>
            <TextField
              fullWidth
              placeholder="Search candidates"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  background: 'white',
                  borderRadius: '12px',
                  border: '2px solid #e2e8f0',
                  '&:hover': {
                    borderColor: '#cbd5e1'
                  },
                  '&.Mui-focused': {
                    borderColor: '#f59e0b'
                  }
                },
                '& .MuiOutlinedInput-input': {
                  padding: { xs: '12px 14px', md: '14px 16px' },
                  fontSize: '14px'
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <i className="fas fa-search" style={{ color: '#94a3b8', fontSize: '16px' }}></i>
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', gap: { xs: '8px', sm: '12px', md: '16px' }, flexWrap: 'wrap', justifyContent: { xs: 'space-between', md: 'flex-end' } }}>
            <Button
              onClick={refreshCandidates}
              sx={{
                background: 'white',
                color: '#64748b',
                border: '2px solid #e2e8f0',
                padding: { xs: '10px 12px', sm: '10px 16px', md: '12px 20px' },
                borderRadius: '10px',
                fontSize: { xs: '12px', sm: '13px', md: '14px' },
                fontWeight: 600,
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: { xs: '4px', sm: '8px' },
                flex: { xs: 1, sm: 'none' },
                minWidth: { xs: 'auto', sm: 'auto' },
                '&:hover': {
                  borderColor: '#10b981',
                  color: '#10b981',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(16, 185, 129, 0.15)'
                }
              }}
            >
              <i className="fas fa-sync-alt"></i> <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Refresh</Box>
            </Button>
            <Button
              onClick={handleOpenFilter}
              sx={{
                background: 'white',
                color: '#64748b',
                border: '2px solid #e2e8f0',
                padding: { xs: '10px 12px', sm: '10px 16px', md: '12px 20px' },
                borderRadius: '10px',
                fontSize: { xs: '12px', sm: '13px', md: '14px' },
                fontWeight: 600,
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: { xs: '4px', sm: '8px' },
                flex: { xs: 1, sm: 'none' },
                '&:hover': {
                  borderColor: '#f59e0b',
                  color: '#f59e0b',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(245, 158, 11, 0.15)'
                }
              }}
            >
              <i className="fas fa-filter"></i> <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Filter</Box>
            </Button>
            <Button
              onClick={handleOpenExport}
              sx={{
                background: 'white',
                color: '#64748b',
                border: '2px solid #e2e8f0',
                padding: { xs: '10px 12px', sm: '10px 16px', md: '12px 20px' },
                borderRadius: '10px',
                fontSize: { xs: '12px', sm: '13px', md: '14px' },
                fontWeight: 600,
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: { xs: '4px', sm: '8px' },
                flex: { xs: 1, sm: 'none' },
                '&:hover': {
                  borderColor: '#f59e0b',
                  color: '#f59e0b',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(245, 158, 11, 0.15)'
                }
              }}
            >
              <i className="fas fa-download"></i> <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>View</Box>
            </Button>
          </Box>
        </Box>

        {/* Candidates Stats */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: { xs: '10px', sm: '12px', md: '16px' },
          marginBottom: { xs: '16px', md: '20px' }
        }}>
          {[
            { number: candidates.length.toString(), label: 'Total Candidates' },
            { number: candidates.filter(c => c.status === 'pending').length.toString(), label: 'Pending Review' },
            { number: candidates.filter(c => c.score && c.score >= 80).length.toString(), label: 'High Scored' },
            { number: candidates.filter(c => c.status === 'active').length.toString(), label: 'Active' }
          ].map((stat, index) => (
            <Card key={index} sx={{
              padding: { xs: '16px', sm: '20px', md: '24px' },
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <Typography sx={{ fontSize: { xs: '24px', sm: '28px', md: '32px' }, fontWeight: 700, color: '#f59e0b', marginBottom: { xs: '4px', md: '8px' } }}>
                {stat.number}
              </Typography>
              <Typography sx={{ fontSize: { xs: '11px', sm: '12px', md: '14px' }, color: '#64748b', fontWeight: 500 }}>
                {stat.label}
              </Typography>
            </Card>
          ))}
        </Box>

        {/* Export menu: view options */}
        <Menu
          anchorEl={exportAnchorEl}
          open={isExportOpen}
          onClose={handleCloseExport}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          PaperProps={{
            sx: {
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
            }
          }}
        >
          <MenuItem onClick={() => handleSetViewMode('table')} sx={{ fontSize: '14px', gap: '10px' }}>
            <i className="fas fa-table" style={{ width: 16, color: '#64748b' }}></i>
            Table View
          </MenuItem>
          <MenuItem onClick={() => handleSetViewMode('card')} sx={{ fontSize: '14px', gap: '10px' }}>
            <i className="fas fa-th-large" style={{ width: 16, color: '#64748b' }}></i>
            Card View
          </MenuItem>
        </Menu>

        {viewMode === 'card' ? (
          <>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
                <Typography sx={{ color: '#64748b', fontSize: '16px' }}>Loading candidates...</Typography>
              </Box>
            ) : (
              <>
                {/* Candidates Grid */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      sm: 'repeat(2, minmax(0, 1fr))',
                      md: 'repeat(2, minmax(0, 1fr))',
                      lg: 'repeat(3, minmax(0, 1fr))',
                      xl: 'repeat(4, minmax(0, 1fr))'
                    },
                    gap: { xs: '12px', sm: '14px', md: '16px' }
                  }}
                >
                  {sortedCandidates.map((candidate) => (
                    <Box key={candidate.id}>
                      <Card sx={{
                        position: 'relative',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        padding: { xs: '14px', sm: '16px', md: '20px' },
                        transition: 'all 0.3s ease',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                        '&:hover': {
                          boxShadow: '0 8px 25px rgba(0, 0, 0, 0.1)'
                        }
                      }}>
                        {/* 3-dots menu */}
                        <IconButton
                          size="small"
                          aria-label="candidate options"
                          onClick={(e) => handleOpenMenu(e, candidate)}
                          sx={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            color: '#94a3b8',
                            '&:hover': {
                              background: '#f1f5f9',
                              color: '#64748b'
                            }
                          }}
                        >
                          <i className="fas fa-ellipsis-h" style={{ fontSize: '14px' }}></i>
                        </IconButton>

                        {/* Header */}
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                          <Box sx={{ position: 'relative', flexShrink: 0 }}>
                            <Avatar sx={{ width: 50, height: 50 }} src={`/api/placeholder/50/50`} alt={candidate.name} />
                            <Box sx={{
                              position: 'absolute',
                              bottom: 2,
                              right: 2,
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              border: '2px solid white',
                              background: candidate.isOnline ? '#10b981' : '#f59e0b'
                            }} />
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography
                              variant="h6"
                              sx={{
                                fontSize: '16px',
                                fontWeight: 600,
                                color: '#1e293b',
                                margin: '0 0 4px 0',
                                cursor: 'pointer',
                                '&:hover': { color: '#3b82f6' }
                              }}
                              onClick={() => handleViewDetails(candidate)}
                            >
                              {candidate.name}
                            </Typography>
                            <Typography sx={{ fontSize: '12px', color: '#64748b', margin: '0 0 4px 0' }}>
                              {candidate.experience}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Details */}
                        <Box sx={{ display: 'flex', gap: '24px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
                          <Box>
                            <Typography sx={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 500 }}>
                              Department
                            </Typography>
                            <Typography sx={{ fontSize: '13px', color: '#1e293b', fontWeight: 500, marginTop: '4px' }}>
                              {candidate.department}
                            </Typography>
                          </Box>
                        </Box>

                        {/* Skills */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                          {candidate.skills.map((skill: string, index: number) => (
                            <Chip
                              key={index}
                              label={skill}
                              size="small"
                              sx={{
                                background: '#f1f5f9',
                                color: '#475569',
                                fontSize: '11px',
                                fontWeight: 500,
                                height: 'auto',
                                padding: '3px 8px'
                              }}
                            />
                          ))}
                        </Box>

                        {/* Contact */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
                            <i className="fas fa-envelope" style={{ width: '14px', color: '#94a3b8' }}></i>
                            <span>{candidate.email}</span>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
                            <i className="fas fa-phone" style={{ width: '14px', color: '#94a3b8' }}></i>
                            <span>{candidate.phone}</span>
                          </Box>
                        </Box>

                        

                        {/* Action Buttons */}
                        <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {/* Generate AI Questions or Review Questions Button */}
                          {candidateQuestionSessions[candidate.id] ? (
                            <Button
                              size="small"
                              onClick={() => navigate(`/interview-outline/${candidateQuestionSessions[candidate.id]}`)}
                              sx={{
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                color: 'white',
                                borderRadius: '8px',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '11px',
                                padding: '6px 12px',
                                '&:hover': {
                                  background: 'linear-gradient(135deg, #d97706, #b45309)',
                                  transform: 'translateY(-1px)',
                                  boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                                }
                              }}
                            >
                              <i className="fas fa-list-check" style={{ marginRight: 6, fontSize: '10px' }} />
                              Review Questions
                            </Button>
                          ) : (
                            <Button
                              size="small"
                              onClick={() => {
                                setMenuCandidate(candidate);
                                handleActionClick('questions');
                              }}
                              sx={{
                                background: 'rgba(245, 158, 11, 0.1)',
                                color: '#d97706',
                                border: '1px solid #fbbf2480',
                                borderRadius: '8px',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '11px',
                                padding: '6px 12px',
                                '&:hover': { background: 'rgba(245, 158, 11, 0.2)' }
                              }}
                            >
                              <i className="fas fa-brain" style={{ marginRight: 6, fontSize: '10px' }} />
                              Generate AI Questions
                            </Button>
                          )}

                          {/* Upload Transcript Button - Only show if no transcript */}
                          {!candidate.hasTranscript && (
                            <Button
                              size="small"
                              onClick={() => {
                                setMenuCandidate(candidate);
                                handleActionClick('transcript');
                              }}
                              sx={{
                                background: 'rgba(37, 99, 235, 0.1)',
                                color: '#2563eb',
                                border: '1px solid #2563eb40',
                                borderRadius: '8px',
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '11px',
                                padding: '6px 12px',
                                '&:hover': { background: 'rgba(37, 99, 235, 0.2)' }
                              }}
                            >
                              <i className="fas fa-file-alt" style={{ marginRight: 6, fontSize: '10px' }} />
                              Upload Transcript
                            </Button>
                          )}

                          {/* Show score badge when transcript is uploaded */}
                          {candidate.hasTranscript && candidate.score > 0 && (
                            <Box sx={{
                              background: candidate.score >= 80 ? 'rgba(16, 185, 129, 0.1)' : candidate.score >= 60 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                              color: candidate.score >= 80 ? '#10b981' : candidate.score >= 60 ? '#d97706' : '#ef4444',
                              border: `1px solid ${candidate.score >= 80 ? '#10b98140' : candidate.score >= 60 ? '#fbbf2480' : '#ef444440'}`,
                              borderRadius: '8px',
                              padding: '6px 12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <i className="fas fa-star" style={{ fontSize: '10px' }} />
                              Score: {candidate.score}%
                            </Box>
                          )}
                        </Box>
                      </Card>
                    </Box>
                  ))}
                  {sortedCandidates.length === 0 && !loading && (
                    <Box sx={{ gridColumn: '1 / -1' }}>
                      <Card sx={{ padding: '48px 24px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center', background: 'white' }}>
                        <i className="fas fa-users" style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '16px' }}></i>
                        <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                          No candidates found
                        </Typography>
                        <Typography sx={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                          {searchQuery ?
                            'Try adjusting your search or filters to find matching candidates.' :
                            'No users with candidate role found in the system.'
                          }
                        </Typography>
                        <Button
                          onClick={refreshCandidates}
                          sx={{
                            background: '#f59e0b',
                            color: 'white',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: 600,
                            textTransform: 'none',
                            '&:hover': {
                              background: '#d97706'
                            }
                          }}
                        >
                          <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i>
                          Refresh List
                        </Button>
                      </Card>
                    </Box>
                  )}
                </Box>
              </>
            )}
          </>
        ) : (
          <>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
                <Typography sx={{ color: '#64748b', fontSize: '16px' }}>Loading candidates...</Typography>
              </Box>
            ) : paginatedCandidates.length === 0 ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                <i className="fas fa-users" style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '16px', display: 'block' }}></i>
                <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  No candidates found
                </Typography>
                <Typography sx={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
                  {searchQuery ?
                    'Try adjusting your search or filters to find matching candidates.' :
                    'No users with candidate role found in the system.'
                  }
                </Typography>
                <Button
                  onClick={refreshCandidates}
                  sx={{
                    background: '#f59e0b',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      background: '#d97706'
                    }
                  }}
                >
                  <i className="fas fa-sync-alt" style={{ marginRight: '8px' }}></i>
                  Refresh List
                </Button>
              </Paper>
            ) : isMobile ? (
              /* Mobile Card View */
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {paginatedCandidates.map((candidate) => (
                  <Card key={candidate.id} sx={{ borderRadius: 2, border: '1px solid #e0e0e0', boxShadow: 'none' }}>
                    <CardContent sx={{ p: 2 }}>
                      {/* Header with Avatar and Status */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ position: 'relative' }}>
                            <Avatar sx={{ width: 40, height: 40, backgroundColor: '#f59e0b', color: '#fff', fontSize: '1rem' }}>
                              {candidate.name.charAt(0).toUpperCase()}
                            </Avatar>
                            <Box sx={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              border: '2px solid white',
                              background: candidate.isOnline ? '#10b981' : '#94a3b8'
                            }} />
                          </Box>
                          <Box>
                            <Typography
                              sx={{
                                fontWeight: 600,
                                color: '#1e293b',
                                fontSize: '14px',
                                cursor: 'pointer',
                                '&:hover': { color: '#3b82f6' }
                              }}
                              onClick={() => handleViewDetails(candidate)}
                            >
                              {candidate.name}
                            </Typography>
                            <Typography sx={{ color: '#f59e0b', fontSize: '12px', fontWeight: 600 }}>
                              {candidate.role}
                            </Typography>
                          </Box>
                        </Box>
                        <Chip
                          size="small"
                          label={candidate.status}
                          sx={{
                            textTransform: 'capitalize',
                            background: candidate.status === 'active' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                            color: candidate.status === 'active' ? '#10b981' : '#f59e0b',
                            fontWeight: 600,
                            fontSize: '11px'
                          }}
                        />
                      </Box>

                      {/* Details Grid */}
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
                        <Box>
                          <Typography sx={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                            Department
                          </Typography>
                          <Typography sx={{ fontSize: '13px', color: '#1e293b' }}>
                            {candidate.department}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                            Score
                          </Typography>
                          <Typography sx={{
                            fontSize: '13px',
                            fontWeight: 700,
                            color: candidate.score >= 90 ? '#10b981' : candidate.score >= 80 ? '#f59e0b' : '#ef4444'
                          }}>
                            {candidate.score}%
                          </Typography>
                        </Box>
                      </Box>

                      {/* Email */}
                      <Box sx={{ mb: 2 }}>
                        <Typography sx={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                          Email
                        </Typography>
                        <Typography sx={{ fontSize: '13px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candidate.email}
                        </Typography>
                      </Box>

                      {/* Online Status */}
                      <Box sx={{ mb: 2 }}>
                        <Typography sx={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>
                          Online Status
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mt: 0.5 }}>
                          <Box sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: candidate.isOnline ? '#10b981' : '#94a3b8'
                          }} />
                          <Typography sx={{
                            fontSize: '13px',
                            color: candidate.isOnline ? '#10b981' : '#94a3b8',
                            fontWeight: 500,
                            textTransform: 'capitalize'
                          }}>
                            {candidate.onlineStatus || (candidate.isOnline ? 'Active' : 'Inactive')}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Actions */}
                      <Box sx={{ display: 'flex', gap: 1, pt: 1, borderTop: '1px solid #f1f5f9' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<VisibilityIcon />}
                          onClick={() => handleViewDetails(candidate)}
                          sx={{
                            flex: 1,
                            textTransform: 'none',
                            borderColor: '#3b82f6',
                            color: '#3b82f6',
                            fontSize: '12px',
                            '&:hover': {
                              borderColor: '#2563eb',
                              backgroundColor: 'rgba(59, 130, 246, 0.05)'
                            }
                          }}
                        >
                          View Details
                        </Button>
                        <IconButton
                          size="small"
                          onClick={(e) => handleOpenMenu(e, candidate)}
                          sx={{
                            color: '#64748b',
                            border: '1px solid #e2e8f0',
                            '&:hover': {
                              color: '#f59e0b',
                              borderColor: '#f59e0b',
                              background: 'rgba(245,158,11,0.06)'
                            }
                          }}
                        >
                          <i className="fas fa-ellipsis-h" style={{ fontSize: '14px' }}></i>
                        </IconButton>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            ) : (
              /* Desktop Table View */
              <Paper elevation={0} sx={{ borderRadius: 2, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 800 }}>
                    <TableHead>
                      <TableRow sx={{ background: '#f8fafc' }}>
                        <TableCell
                          sx={{
                            fontWeight: 800,
                            color: '#475569',
                            cursor: 'pointer',
                            userSelect: 'none',
                            '&:hover': { color: '#f59e0b' }
                          }}
                          onClick={() => handleSort('name')}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            Candidate
                            {getSortIcon('name')}
                          </Box>
                        </TableCell>
                        <TableCell
                          sx={{
                            fontWeight: 800,
                            color: '#475569',
                            cursor: 'pointer',
                            userSelect: 'none',
                            '&:hover': { color: '#f59e0b' }
                          }}
                          onClick={() => handleSort('role')}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            Role
                            {getSortIcon('role')}
                          </Box>
                        </TableCell>
                        <TableCell
                          sx={{
                            fontWeight: 800,
                            color: '#475569',
                            cursor: 'pointer',
                            userSelect: 'none',
                            '&:hover': { color: '#f59e0b' }
                          }}
                          onClick={() => handleSort('department')}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            Department
                            {getSortIcon('department')}
                          </Box>
                        </TableCell>
                        <TableCell
                          sx={{
                            fontWeight: 800,
                            color: '#475569',
                            cursor: 'pointer',
                            userSelect: 'none',
                            '&:hover': { color: '#f59e0b' }
                          }}
                          onClick={() => handleSort('status')}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            Status
                            {getSortIcon('status')}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569' }}>
                          Online Status
                        </TableCell>
                        <TableCell
                          sx={{
                            fontWeight: 800,
                            color: '#475569',
                            cursor: 'pointer',
                            userSelect: 'none',
                            '&:hover': { color: '#f59e0b' }
                          }}
                          align="right"
                          onClick={() => handleSort('score')}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                            Score
                            {getSortIcon('score')}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 800, color: '#475569' }} align="right">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedCandidates.map((candidate) => (
                        <TableRow key={candidate.id} hover>
                          <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>
                            <Typography
                              sx={{
                                fontWeight: 700,
                                color: '#1e293b',
                                cursor: 'pointer',
                                '&:hover': { color: '#3b82f6' }
                              }}
                              onClick={() => handleViewDetails(candidate)}
                            >
                              {candidate.name}
                            </Typography>
                            <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                              {candidate.email}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ color: '#f59e0b', fontWeight: 700 }}>{candidate.role}</TableCell>
                          <TableCell sx={{ color: '#1e293b', fontWeight: 600 }}>{candidate.department}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={candidate.status}
                              sx={{
                                textTransform: 'capitalize',
                                background: candidate.status === 'active' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                color: candidate.status === 'active' ? '#10b981' : '#f59e0b',
                                fontWeight: 800
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Box sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: candidate.isOnline ? '#10b981' : '#94a3b8'
                              }} />
                              <Typography sx={{
                                fontSize: '12px',
                                color: candidate.isOnline ? '#10b981' : '#94a3b8',
                                fontWeight: 600,
                                textTransform: 'capitalize'
                              }}>
                                {candidate.onlineStatus || (candidate.isOnline ? 'Active' : 'Inactive')}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 800, color: candidate.score >= 90 ? '#10b981' : candidate.score >= 80 ? '#f59e0b' : '#ef4444' }}>
                            {candidate.score}%
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                              <Tooltip title="View Details">
                                <IconButton
                                  onClick={() => handleViewDetails(candidate)}
                                  sx={{
                                    color: '#3b82f6',
                                    '&:hover': {
                                      color: '#2563eb',
                                      background: 'rgba(59, 130, 246, 0.1)'
                                    }
                                  }}
                                >
                                  <VisibilityIcon sx={{ fontSize: '18px' }} />
                                </IconButton>
                              </Tooltip>
                              <IconButton
                                onClick={(e) => handleOpenMenu(e, candidate)}
                                sx={{
                                  color: '#64748b',
                                  '&:hover': {
                                    color: '#f59e0b',
                                    background: 'rgba(245,158,11,0.06)'
                                  }
                                }}
                              >
                                <i className="fas fa-ellipsis-h" style={{ fontSize: '14px' }}></i>
                              </IconButton>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}

            {/* Pagination for Table View */}
            {sortedCandidates.length > 0 && (
              <Paper sx={{ mt: 2, borderRadius: 2, overflow: 'hidden' }}>
                <TablePagination
                  rowsPerPageOptions={isMobile ? [5, 10] : [5, 10, 25, 50]}
                  component="div"
                  count={sortedCandidates.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  labelRowsPerPage={isMobile ? "Per page:" : "Rows per page:"}
                  sx={{
                    flexShrink: 0,
                    backgroundColor: '#fff',
                    '.MuiTablePagination-toolbar': {
                      flexWrap: 'wrap',
                      justifyContent: isMobile ? 'center' : 'flex-end',
                      padding: isMobile ? '8px' : '8px 16px',
                      gap: isMobile ? 1 : 0,
                    },
                    '.MuiTablePagination-selectLabel': {
                      color: '#64748b',
                      fontWeight: 500,
                      fontSize: isMobile ? '12px' : '14px',
                    },
                    '.MuiTablePagination-displayedRows': {
                      color: '#64748b',
                      fontWeight: 500,
                      fontSize: isMobile ? '12px' : '14px',
                    },
                    '.MuiTablePagination-select': {
                      fontWeight: 500,
                    },
                    '.MuiTablePagination-actions': {
                      marginLeft: isMobile ? 0 : 2,
                    }
                  }}
                />
              </Paper>
            )}
          </>
        )}

        {/* Professional Job Selection Dialog */}
        <Dialog
          open={isJobSelectOpen}
          onClose={() => setIsJobSelectOpen(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: { xs: '12px', md: '16px' },
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
              border: '1px solid #e2e8f0',
              margin: { xs: '12px', md: '32px' },
              maxHeight: { xs: '90vh', md: '85vh' }
            }
          }}
        >
          <DialogTitle sx={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: 'white',
            padding: { xs: '16px 20px', md: '24px 32px' },
            borderRadius: { xs: '12px 12px 0 0', md: '16px 16px 0 0' },
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Box sx={{
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <i className="fas fa-briefcase" style={{ fontSize: '20px' }}></i>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
                Select Job Context
              </Typography>
              <Typography sx={{ fontSize: '14px', opacity: 0.9, margin: 0 }}>
                Choose the position for {activeAction === 'questions' ? 'AI question generation' : 'transcript analysis'}
              </Typography>
            </Box>
          </DialogTitle>
          
          <DialogContent sx={{ padding: { xs: '20px', md: '32px' } }}>

            {/* Job Selection */}
            <Box>
              <Typography sx={{ 
                fontSize: '16px', 
                fontWeight: 600, 
                color: '#1e293b', 
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                mt:"10px"
              }}>
                <i className="fas fa-search" style={{ fontSize: '16px', color: '#f59e0b' }}></i>
                Available Positions
              </Typography>
              
              <FormControl fullWidth>
                <InputLabel sx={{ 
                  color: '#64748b',
                  '&.Mui-focused': { color: '#f59e0b' }
                }}>
                  Select Job Position
                </InputLabel>
                <Select
                  value={selectedJobId}
                  label="Select Job Position"
                  onChange={(e) => setSelectedJobId(Number(e.target.value))}
                  sx={{
                    borderRadius: '12px',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#e2e8f0'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#f59e0b'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#f59e0b',
                      borderWidth: '2px'
                    }
                  }}
                >
                  {jobs.length === 0 ? (
                    <MenuItem disabled>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                        <i className="fas fa-exclamation-circle"></i>
                        No open positions available
                      </Box>
                    </MenuItem>
                  ) : (
                    jobs.map((job) => (
                      <MenuItem key={job.id} value={job.id}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <Typography sx={{ fontWeight: 600, color: '#1e293b' }}>
                            {job.title}
                          </Typography>
                          {job.department && (
                            <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                              {job.department}
                            </Typography>
                          )}
                        </Box>
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>

              {jobs.length > 0 && (
                <Typography sx={{ 
                  fontSize: '12px', 
                  color: '#94a3b8', 
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <i className="fas fa-info-circle"></i>
                  {jobs.length} open position{jobs.length !== 1 ? 's' : ''} available
                </Typography>
              )}
            </Box>
          </DialogContent>
          
          <DialogActions sx={{
            padding: { xs: '16px 20px 20px 20px', md: '24px 32px 32px 32px' },
            gap: { xs: '8px', md: '12px' },
            flexDirection: { xs: 'column', sm: 'row' },
            background: '#fafbfc',
            borderRadius: { xs: '0 0 12px 12px', md: '0 0 16px 16px' }
          }}>
            <Button
              onClick={() => {
                setIsJobSelectOpen(false);
                setSelectedJobId('');
                setActiveAction(null);
              }}
              sx={{
                color: '#64748b',
                textTransform: 'none',
                fontWeight: 600,
                padding: { xs: '10px 20px', md: '10px 24px' },
                borderRadius: '10px',
                width: { xs: '100%', sm: 'auto' },
                order: { xs: 2, sm: 1 },
                '&:hover': {
                  background: '#f1f5f9'
                }
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleJobSelectConfirm}
              variant="contained"
              disabled={!selectedJobId || jobs.length === 0}
              sx={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                textTransform: 'none',
                fontWeight: 600,
                padding: { xs: '10px 20px', md: '10px 32px' },
                borderRadius: '10px',
                width: { xs: '100%', sm: 'auto' },
                order: { xs: 1, sm: 2 },
                boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                  boxShadow: '0 6px 20px rgba(245, 158, 11, 0.4)'
                },
                '&:disabled': {
                  background: '#cbd5e1',
                  color: '#94a3b8'
                }
              }}
            >
              <i className="fas fa-arrow-right" style={{ marginRight: '8px' }}></i>
              Continue
            </Button>
          </DialogActions>
        </Dialog>

        {/* Professional Transcript Upload Dialog */}
        <Dialog
          open={isTranscriptUploadOpen}
          onClose={() => setIsTranscriptUploadOpen(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: { xs: '12px', md: '16px' },
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
              border: '1px solid #e2e8f0',
              margin: { xs: '12px', md: '32px' },
              maxHeight: { xs: '90vh', md: '85vh' }
            }
          }}
        >
          <DialogTitle sx={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            padding: { xs: '16px 20px', md: '24px 32px' },
            borderRadius: { xs: '12px 12px 0 0', md: '16px 16px 0 0' },
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Box sx={{
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <i className="fas fa-file-upload" style={{ fontSize: '20px' }}></i>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
                Upload Interview Transcript
              </Typography>
              <Typography sx={{ fontSize: '14px', opacity: 0.9, margin: 0 }}>
                {menuCandidate?.name} - AI-Powered Scoring
              </Typography>
            </Box>
          </DialogTitle>
          
          <DialogContent sx={{ padding: { xs: '20px', md: '32px' } }}>

            {/* Upload Options */}
            <Box sx={{ marginBottom: { xs: '20px', md: '24px' } }}>
              <Typography sx={{ 
                fontSize: '16px', 
                fontWeight: 600, 
                color: '#1e293b', 
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                mt:"10px"
              }}>
                <i className="fas fa-edit" style={{ fontSize: '16px', color: '#667eea' }}></i>
                Transcript Content
              </Typography>
              
              <TextField
                fullWidth
                multiline
                minRows={8}
                maxRows={20}
                label="Interview Transcript"
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="Interviewer: Good morning! Thank you for joining us today. Could you start by telling us about yourself?

Candidate: Good morning! Thank you for having me. I'm a software engineer with 5 years of experience...

Interviewer: That's great! Can you walk us through your experience with React?

Candidate: Absolutely! I've been working with React for the past 3 years..."
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '12px',
                    background: '#fafbfc',
                    '&:hover': {
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#667eea'
                      }
                    },
                    '&.Mui-focused': {
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#667eea',
                        borderWidth: '2px'
                      }
                    }
                  },
                  '& .MuiInputLabel-root': {
                    color: '#64748b',
                    '&.Mui-focused': {
                      color: '#667eea'
                    }
                  }
                }}
              />
              
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                margin: '20px 0',
                position: 'relative'
              }}>
                <Box sx={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  right: 0,
                  height: '1px',
                  background: 'linear-gradient(90deg, transparent 0%, #e2e8f0 50%, transparent 100%)'
                }} />
                <Typography sx={{
                  background: 'white',
                  padding: '0 16px',
                  fontSize: '12px',
                  color: '#94a3b8',
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  OR
                </Typography>
              </Box>

              {/* File Upload Section */}
              <Box sx={{
                border: '2px dashed #cbd5e1',
                borderRadius: '12px',
                padding: '24px',
                textAlign: 'center',
                background: '#fafbfc',
                transition: 'all 0.3s ease',
                '&:hover': {
                  borderColor: '#667eea',
                  background: '#f8faff'
                }
              }}>
                <Box sx={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '50%',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto'
                }}>
                  <CloudUploadIcon sx={{ color: 'white', fontSize: '24px' }} />
                </Box>
                
                <Typography sx={{ 
                  fontSize: '16px', 
                  fontWeight: 600, 
                  color: '#1e293b', 
                  marginBottom: '8px' 
                }}>
                  Upload Transcript File
                </Typography>
                
                <Typography sx={{ 
                  fontSize: '14px', 
                  color: '#64748b', 
                  marginBottom: '16px',
                  lineHeight: 1.5
                }}>
                  Drag and drop your transcript file here, or click to browse
                  <br />
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Supports: TXT, MD, JSON, CSV (Max 5MB)
                  </span>
                </Typography>
                
                <Button
                  component="label"
                  variant="outlined"
                  startIcon={<CloudUploadIcon />}
                  sx={{
                    borderColor: '#667eea',
                    color: '#667eea',
                    borderRadius: '10px',
                    padding: '10px 24px',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      borderColor: '#5a67d8',
                      background: 'rgba(102, 126, 234, 0.05)'
                    }
                  }}
                >
                  Choose File
                  <input
                    type="file"
                    hidden
                    accept=".txt,.md,.json,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      // Validation: Check file type and size
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error('File too large (Max 5MB). Please upload a smaller text file.');
                        e.target.value = '';
                        return;
                      }

                      const validTypes = ['text/plain', 'text/markdown', 'application/json', 'text/csv'];
                      if (!file.type.startsWith('text/') && !validTypes.includes(file.type) && !file.name.match(/\.(txt|md|json|csv)$/i)) {
                        toast.error('Invalid file type. Please upload a text file (TXT, MD, JSON, CSV).');
                        e.target.value = '';
                        return;
                      }

                      const reader = new FileReader();
                      reader.onload = (e) => {
                        setTranscriptText(e.target?.result as string);
                        toast.success(`File "${file.name}" loaded successfully!`);
                      };
                      reader.onerror = () => toast.error('Error reading file');
                      reader.readAsText(file);
                    }}
                  />
                </Button>
              </Box>
            </Box>

            {/* Character Count */}
            {transcriptText && (
              <Box sx={{
                background: '#f1f5f9',
                borderRadius: '8px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px'
              }}>
                <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                  <i className="fas fa-file-alt" style={{ marginRight: '8px', color: '#667eea' }}></i>
                  Transcript loaded
                </Typography>
                <Typography sx={{ 
                  fontSize: '12px', 
                  color: '#94a3b8',
                  background: 'white',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontWeight: 500
                }}>
                  {transcriptText.length.toLocaleString()} characters
                </Typography>
              </Box>
            )}
          </DialogContent>
          
          <DialogActions sx={{
            padding: { xs: '16px 20px 20px 20px', md: '24px 32px 32px 32px' },
            gap: { xs: '8px', md: '12px' },
            flexDirection: { xs: 'column', sm: 'row' },
            background: '#fafbfc',
            borderRadius: { xs: '0 0 12px 12px', md: '0 0 16px 16px' }
          }}>
            <Button
              onClick={() => {
                setIsTranscriptUploadOpen(false);
                setTranscriptText('');
              }}
              sx={{
                color: '#64748b',
                textTransform: 'none',
                fontWeight: 600,
                padding: { xs: '10px 20px', md: '10px 24px' },
                borderRadius: '10px',
                width: { xs: '100%', sm: 'auto' },
                order: { xs: 2, sm: 1 },
                '&:hover': {
                  background: '#f1f5f9'
                }
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleTranscriptSubmit}
              variant="contained"
              disabled={actionLoading}
              sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                textTransform: 'none',
                fontWeight: 600,
                padding: { xs: '10px 20px', md: '10px 32px' },
                borderRadius: '10px',
                width: { xs: '100%', sm: 'auto' },
                order: { xs: 1, sm: 2 },
                boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
                  boxShadow: '0 6px 20px rgba(102, 126, 234, 0.4)'
                },
                '&:disabled': {
                  background: '#cbd5e1',
                  color: '#94a3b8'
                }
              }}
            >
              {actionLoading ? (
                <>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: '8px' }}></i>
                  Processing...
                </>
              ) : (
                <>
                  <i className="fas fa-magic" style={{ marginRight: '8px' }}></i>
                  Generate AI Score
                </>
              )}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Filter Dialog */}
        <Dialog
          open={isFilterOpen}
          onClose={handleCloseFilter}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: { xs: '12px', md: '16px' },
              margin: { xs: '12px', md: '32px' }
            }
          }}
        >
          <DialogTitle sx={{
            fontSize: { xs: '18px', md: '20px' },
            fontWeight: 700,
            color: '#1e293b',
            padding: { xs: '16px 20px', md: '20px 24px' }
          }}>
            Filter Candidates
          </DialogTitle>
          <DialogContent sx={{ padding: { xs: '0 20px', md: '0 24px' } }}>
            <Box sx={{ marginBottom: '24px' }}>
              <Typography variant="h6" sx={{ marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>
                Status
              </Typography>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={(filters.statuses as Record<string, boolean>).active}
                      onChange={(e) => setFilters(prev => ({
                        ...prev,
                        statuses: { ...(prev.statuses as Record<string, boolean>), active: e.target.checked }
                      }))}
                    />
                  }
                  label="Active"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={(filters.statuses as Record<string, boolean>).pending}
                      onChange={(e) => setFilters(prev => ({
                        ...prev,
                        statuses: { ...(prev.statuses as Record<string, boolean>), pending: e.target.checked }
                      }))}
                    />
                  }
                  label="Pending"
                />
              </FormGroup>
            </Box>

            <Box sx={{ marginBottom: '24px' }}>
              <Typography variant="h6" sx={{ marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>
                Minimum Score: {filters.minScore}%
              </Typography>
              <Slider
                value={filters.minScore}
                onChange={(_, value) => setFilters(prev => ({ ...prev, minScore: value as number }))}
                min={0}
                max={100}
                step={5}
                marks={[
                  { value: 0, label: '0%' },
                  { value: 50, label: '50%' },
                  { value: 100, label: '100%' }
                ]}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ padding: '0 24px 24px 24px', gap: '12px' }}>
            <Button
              onClick={handleClearFilter}
              sx={{
                color: '#64748b',
                textTransform: 'none',
                fontWeight: 600
              }}
            >
              Clear All
            </Button>
            <Button
              onClick={handleCloseFilter}
              variant="contained"
              sx={{
                background: '#6366f1',
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': {
                  background: '#5855eb'
                }
              }}
            >
              Apply Filters
            </Button>
          </DialogActions>
        </Dialog>

        {/* Context Menu */}
        <Menu
          anchorEl={menuAnchorEl}
          open={isMenuOpen}
          onClose={handleCloseMenu}
          PaperProps={{
            sx: {
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0'
            }
          }}
        >
          <MenuItem onClick={handleViewProfile} sx={{ padding: '12px 20px', fontSize: '14px' }}>
            <i className="fas fa-user" style={{ marginRight: '12px', color: '#64748b' }}></i>
            View Profile
          </MenuItem>
         

          
          <MenuItem onClick={handleCloseMenu} sx={{ padding: '12px 20px', fontSize: '14px' }}>
            <i className="fas fa-video" style={{ marginRight: '12px', color: '#64748b' }}></i>
            Schedule Interview
          </MenuItem>
          {/* <MenuItem onClick={handleCloseMenu} sx={{ padding: '12px 20px', fontSize: '14px' }}>
            <i className="fas fa-envelope" style={{ marginRight: '12px', color: '#64748b' }}></i>
            Send Message
          </MenuItem> */}
          <Divider />
          <MenuItem onClick={handleCloseMenu} sx={{ padding: '12px 20px', fontSize: '14px', color: '#ef4444' }}>
            <i className="fas fa-trash" style={{ marginRight: '12px' }}></i>
            Remove Candidate
          </MenuItem>
        </Menu>

        {/* Candidate Details Dialog - Simple & Clean */}
        <Dialog
          open={isDetailOpen}
          onClose={handleCloseDetails}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: { xs: '12px', md: '12px' },
              boxShadow: '0 10px 40px rgba(0, 0, 0, 0.12)',
              margin: { xs: '12px', md: '32px' },
              maxHeight: { xs: '90vh', md: '85vh' }
            }
          }}
        >
          {detailCandidate && (
            <>
              <DialogTitle sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px 24px',
                borderBottom: '1px solid #e2e8f0'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Avatar sx={{ width: 48, height: 48, background: '#f59e0b', fontWeight: 600 }}>
                    {detailCandidate.name?.charAt(0).toUpperCase() || 'C'}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
                      {detailCandidate.name}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                      {detailCandidate.department} • {detailCandidate.experience}
                    </Typography>
                  </Box>
                </Box>
                <IconButton onClick={handleCloseDetails} size="small">
                  <i className="fas fa-times" style={{ fontSize: '14px', color: '#64748b' }}></i>
                </IconButton>
              </DialogTitle>

              <DialogContent sx={{ padding: '24px' }}>
                {/* Contact Info */}
                <Box sx={{ marginBottom: '20px' }}>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px' }}>
                    Contact
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <i className="fas fa-envelope" style={{ color: '#94a3b8', width: '16px', fontSize: '13px' }}></i>
                      <Typography sx={{ fontSize: '14px', color: '#1e293b' }}>{detailCandidate.email}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <i className="fas fa-phone" style={{ color: '#94a3b8', width: '16px', fontSize: '13px' }}></i>
                      <Typography sx={{ fontSize: '14px', color: '#1e293b' }}>{detailCandidate.phone}</Typography>
                    </Box>
                  </Box>
                </Box>

                {/* Status Row */}
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: '10px', sm: '16px' }, marginBottom: '20px' }}>
                  <Box sx={{ flex: 1, background: '#f8fafc', padding: { xs: '10px 14px', md: '12px 16px' }, borderRadius: '8px' }}>
                    <Typography sx={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Status</Typography>
                    <Chip
                      size="small"
                      label={detailCandidate.status}
                      sx={{
                        textTransform: 'capitalize',
                        background: detailCandidate.status === 'active' ? '#dcfce7' : '#fef3c7',
                        color: detailCandidate.status === 'active' ? '#16a34a' : '#d97706',
                        fontWeight: 600,
                        fontSize: '12px'
                      }}
                    />
                  </Box>
                  <Box sx={{ flex: 1, background: '#f8fafc', padding: '12px 16px', borderRadius: '8px' }}>
                    <Typography sx={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Score</Typography>
                    <Typography sx={{
                      fontSize: '20px',
                      fontWeight: 700,
                      color: (detailCandidate.score || 0) >= 80 ? '#16a34a' : (detailCandidate.score || 0) >= 60 ? '#d97706' : '#dc2626'
                    }}>
                      {detailCandidate.score || 0}%
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, background: '#f8fafc', padding: '12px 16px', borderRadius: '8px' }}>
                    <Typography sx={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Online</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Box sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: detailCandidate.isOnline ? '#16a34a' : '#94a3b8'
                      }} />
                      <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>
                        {detailCandidate.isOnline ? 'Online' : 'Offline'}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {/* Skills */}
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '12px' }}>
                    Skills
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {detailCandidate.skills?.map((skill: string, index: number) => (
                      <Chip
                        key={index}
                        label={skill}
                        size="small"
                        sx={{
                          background: '#f1f5f9',
                          color: '#475569',
                          fontSize: '12px',
                          fontWeight: 500
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </DialogContent>

              <DialogActions sx={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', gap: '8px' }}>
                <Button
                  onClick={handleCloseDetails}
                  sx={{
                    color: '#64748b',
                    textTransform: 'none',
                    fontWeight: 500
                  }}
                >
                  Close
                </Button>
                {detailCandidate && candidateQuestionSessions[detailCandidate.id] ? (
                  <Button
                    onClick={() => {
                      navigate(`/interview-outline/${candidateQuestionSessions[detailCandidate.id]}`)
                      handleCloseDetails()
                    }}
                    variant="contained"
                    sx={{
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      textTransform: 'none',
                      fontWeight: 600,
                      '&:hover': { background: 'linear-gradient(135deg, #d97706, #b45309)' }
                    }}
                  >
                    <i className="fas fa-list-check" style={{ marginRight: 8 }} />
                    Review Questions
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      if (detailCandidate) {
                        setMenuCandidate(detailCandidate)
                        handleActionClick('questions')
                      }
                      handleCloseDetails()
                    }}
                    variant="contained"
                    sx={{
                      background: '#f59e0b',
                      textTransform: 'none',
                      fontWeight: 600,
                      '&:hover': { background: '#d97706' }
                    }}
                  >
                    Generate Questions
                  </Button>
                )}
              </DialogActions>
            </>
          )}
        </Dialog>
      </Box>
    </Navigation>
  )
}

export default Candidates