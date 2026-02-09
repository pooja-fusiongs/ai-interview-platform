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
  FormControl
} from '@mui/material'
import Navigation from '../layout/sidebar'
import { CloudUpload as CloudUploadIcon } from '@mui/icons-material'

const Candidates = () => {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const [menuCandidate, setMenuCandidate] = useState<Candidate | null>(null)
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false)
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false)
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card')
  const [exportAnchorEl, setExportAnchorEl] = useState<null | HTMLElement>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [sortField, setSortField] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
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
  const [candidateInterviews, setCandidateInterviews] = useState<any[]>([])

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

  const handleCloseProfile = () => {
    setIsProfileOpen(false)
    setMenuCandidate(null)
  }

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
      await apiClient.post(`/api/candidates/${menuCandidate.id}/generate-questions`, {
        job_id: jobId,
        total_questions: 10 // Default
      })
      toast.dismiss()
      toast.success('Questions generated successfully! Added to candidate object.')
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
    if (!selectedJobId || !menuCandidate || !transcriptText) return

    try {
      setActionLoading(true)
      toast.loading('Uploading transcript and generating score...')
      
      // Upload transcript
      const response = await apiClient.post(`/api/candidates/${menuCandidate.id}/upload-transcript`, {
        job_id: selectedJobId,
        transcript_text: transcriptText
      })
      
      // Auto-generate score after transcript upload
      const scoreResponse = await apiClient.post(`/api/candidates/${menuCandidate.id}/generate-score`, {
        job_id: selectedJobId
      })
      
      toast.dismiss()
      toast.success(`Transcript uploaded and score generated: ${scoreResponse.data.score?.toFixed(1) || 0}%`)

      // Update candidate state with transcript and new score
      setCandidates(prevCandidates =>
        prevCandidates.map(candidate =>
          candidate.id === menuCandidate.id
            ? { 
                ...candidate, 
                hasTranscript: true,
                score: scoreResponse.data.score || candidate.score
              }
            : candidate
        )
      )

      // Update menuCandidate as well
      setMenuCandidate(prev => prev ? { 
        ...prev, 
        hasTranscript: true,
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

  const allDepartments = Array.from(new Set(candidates.map(c => c.department))).sort()

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

  return (
    <Navigation>
      <Box sx={{ padding: '20px', background: '#f8fafc', height: '100%' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1, minWidth: 260, maxWidth: 420 }}>
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
                  padding: '14px 16px',
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

          <Box sx={{ display: 'flex', gap: '16px' }}>
            <Button
              onClick={refreshCandidates}
              sx={{
                background: 'white',
                color: '#64748b',
                border: '2px solid #e2e8f0',
                padding: '12px 20px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                '&:hover': {
                  borderColor: '#10b981',
                  color: '#10b981',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(16, 185, 129, 0.15)'
                }
              }}
            >
              <i className="fas fa-sync-alt"></i> Refresh
            </Button>
            <Button
              onClick={handleOpenFilter}
              sx={{
                background: 'white',
                color: '#64748b',
                border: '2px solid #e2e8f0',
                padding: '12px 20px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                '&:hover': {
                  borderColor: '#f59e0b',
                  color: '#f59e0b',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(245, 158, 11, 0.15)'
                }
              }}
            >
              <i className="fas fa-filter"></i> Filter Candidates
            </Button>
            <Button
              onClick={handleOpenExport}
              sx={{
                background: 'white',
                color: '#64748b',
                border: '2px solid #e2e8f0',
                padding: '12px 20px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                textTransform: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                '&:hover': {
                  borderColor: '#f59e0b',
                  color: '#f59e0b',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 25px rgba(245, 158, 11, 0.15)'
                }
              }}
            >
              <i className="fas fa-download"></i> View
            </Button>
          </Box>
        </Box>

        {/* Candidates Stats */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}>
          {[
            { number: candidates.length.toString(), label: 'Total Candidates' },
            { number: candidates.filter(c => c.status === 'pending').length.toString(), label: 'Pending Review' },
            { number: candidates.filter(c => c.score && c.score >= 80).length.toString(), label: 'High Scored' },
            { number: candidates.filter(c => c.status === 'active').length.toString(), label: 'Active' }
          ].map((stat, index) => (
            <Card key={index} sx={{
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <Typography sx={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b', marginBottom: '8px' }}>
                {stat.number}
              </Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b', fontWeight: 500 }}>
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
                      md: 'repeat(3, minmax(0, 1fr))',
                      lg: 'repeat(4, minmax(0, 1fr))',
                      xl: 'repeat(4, minmax(0, 1fr))'
                    },
                    gap: '16px'
                  }}
                >
                  {sortedCandidates.map((candidate) => (
                    <Box key={candidate.id}>
                      <Card sx={{
                        position: 'relative',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        padding: '20px',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                        '&:hover': {
                          transform: 'translateY(-2px)',
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
                            <Typography variant="h6" sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: '0 0 4px 0' }}>
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
                          {/* Generate AI Questions Button */}
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
            ) : (
              <>
                <TableContainer
                  component={Paper}
                  sx={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    overflow: 'hidden',
                    background: 'white'
                  }}
                >
                  <Table size="small">
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
                      {sortedCandidates.map((candidate) => (
                        <TableRow key={candidate.id} hover>
                          <TableCell sx={{ fontWeight: 700, color: '#1e293b' }}>
                            {candidate.name}
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
                          </TableCell>
                        </TableRow>
                      ))}
                      {sortedCandidates.length === 0 && !loading && (
                        <TableRow>
                          <TableCell colSpan={7} sx={{ textAlign: 'center', padding: '48px 24px' }}>
                            <Box>
                              <i className="fas fa-users" style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '16px' }}></i>
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
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </>
        )}

        {/* Job Selection Dialog */}
        <Dialog open={isJobSelectOpen} onClose={() => setIsJobSelectOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Select Job Context</DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
              Please select the job to apply this action to.
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Job</InputLabel>
              <Select
                value={selectedJobId}
                label="Job"
                onChange={(e) => setSelectedJobId(Number(e.target.value))}
              >
                {jobs.map((job) => (
                  <MenuItem key={job.id} value={job.id}>{job.title}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setIsJobSelectOpen(false)}>Cancel</Button>
            <Button onClick={handleJobSelectConfirm} variant="contained" disabled={!selectedJobId}>Continue</Button>
          </DialogActions>
        </Dialog>

        {/* Transcript Upload Dialog */}
        <Dialog open={isTranscriptUploadOpen} onClose={() => setIsTranscriptUploadOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Upload Transcript</DialogTitle>
          <DialogContent>
            <Box sx={{ padding: '20px 0' }}>
              <TextField
                fullWidth
                multiline
                minRows={10}
                label="Paste Transcript Text (or auto-extracted from file)"
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="Speaker 1: Hello...\nSpeaker 2: Hi there..."
              />
              <Box sx={{ marginTop: '16px', textAlign: 'center' }}>
                <Typography sx={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
                  OR Upload a text file (Integration pending)
                </Typography>
                <Button
                  component="label"
                  startIcon={<CloudUploadIcon />}
                >
                  Upload File (Simulation)
                  <input
                    type="file"
                    hidden
                    accept=".txt,.md,.json,.csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      // Validation: Check file type and size to prevent freezing on large videos
                      if (file.size > 5 * 1024 * 1024) { // 5MB limit
                        toast.error('File too large (Max 5MB). Please upload a text transcript.');
                        e.target.value = ''; // Reset input
                        return;
                      }

                      // Basic type check - allow text/* or known text extensions
                      const validTypes = ['text/plain', 'text/markdown', 'application/json', 'text/csv'];
                      if (!file.type.startsWith('text/') && !validTypes.includes(file.type) && !file.name.match(/\.(txt|md|json|csv)$/i)) {
                        toast.error('Invalid file type. Please upload a text file (txt, md, json).');
                        e.target.value = ''; // Reset input
                        return;
                      }

                      const reader = new FileReader();
                      reader.onload = (e) => setTranscriptText(e.target?.result as string);
                      reader.onerror = () => toast.error('Error reading file');
                      reader.readAsText(file);
                    }} />
                </Button>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setIsTranscriptUploadOpen(false)}>Cancel</Button>
            <Button onClick={handleTranscriptSubmit} variant="contained" disabled={!transcriptText || actionLoading}>
              {actionLoading ? 'Processing...' : 'Submit & Auto-Generate Score'}
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
              borderRadius: '16px'
            }
          }}
        >
          <DialogTitle sx={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#1e293b'
          }}>
            Filter Candidates
          </DialogTitle>
          <DialogContent>
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
          <MenuItem
            onClick={() => {
              handleCloseMenu()
              handleActionClick('questions')
            }}
            sx={{ padding: '12px 20px', fontSize: '14px' }}
          >
            <i className="fas fa-brain" style={{ marginRight: '12px', color: '#64748b' }}></i>
            Generate AI Questions
          </MenuItem>

          {/* Upload Transcript - Only show if no transcript */}
          {!menuCandidate?.hasTranscript && (
            <MenuItem
              onClick={() => {
                handleCloseMenu()
                handleActionClick('transcript')
              }}
              sx={{ padding: '12px 20px', fontSize: '14px' }}
            >
              <i className="fas fa-file-alt" style={{ marginRight: '12px', color: '#64748b' }}></i>
              Upload Transcript
            </MenuItem>
          )}
          <MenuItem onClick={handleCloseMenu} sx={{ padding: '12px 20px', fontSize: '14px' }}>
            <i className="fas fa-video" style={{ marginRight: '12px', color: '#64748b' }}></i>
            Schedule Interview
          </MenuItem>
          <MenuItem onClick={handleCloseMenu} sx={{ padding: '12px 20px', fontSize: '14px' }}>
            <i className="fas fa-envelope" style={{ marginRight: '12px', color: '#64748b' }}></i>
            Send Message
          </MenuItem>
          <Divider />
          <MenuItem onClick={handleCloseMenu} sx={{ padding: '12px 20px', fontSize: '14px', color: '#ef4444' }}>
            <i className="fas fa-trash" style={{ marginRight: '12px' }}></i>
            Remove Candidate
          </MenuItem>
        </Menu>
      </Box>
    </Navigation>
  )
}

export default Candidates