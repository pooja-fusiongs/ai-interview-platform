import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Candidate, CandidateFilters } from '../../types'
import { apiClient } from '../../services/api'
import { toast } from 'react-hot-toast'
import {
  Box,
  Typography,
  Button,
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
  Drawer,
  Slider,
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
  Skeleton
} from '@mui/material'
import Navigation from '../layout/Sidebar'
import { CloudUpload as CloudUploadIcon } from '@mui/icons-material'

const pastelColors = [
  '#6C7A89', '#7E8C8D', '#5B7FA5', '#6B8E7B', '#8B7B8E',
  '#7A8B99', '#6E8898', '#7B9EA8', '#8E8579', '#6D8A96',
  '#7C8A6E', '#847D8B', '#6A8F8D', '#8B8178', '#7A7E93',
];

const getAvatarColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return pastelColors[Math.abs(hash) % pastelColors.length];
};

const Candidates = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('search') || '')
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const [menuCandidate, setMenuCandidate] = useState<Candidate | null>(null)
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false)
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false)
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [sortField, setSortField] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [filters, setFilters] = useState<CandidateFilters>({
    statuses: {},
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

  // Edit candidate state
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', experience_years: '', current_position: '', location: '', linkedin_url: '', notice_period: '', current_ctc: '', expected_ctc: '' })
  const [editSaving, setEditSaving] = useState(false)
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
    } catch {
      // Silently ignore - online status is non-critical
    }
  }

  useEffect(() => {
    fetchCandidates()
    fetchJobs()
  }, [])

  // Auto-open detail drawer when navigated with ?search=email
  useEffect(() => {
    const searchEmail = searchParams.get('search')
    if (searchEmail && candidates.length > 0) {
      const match = candidates.find((c: Candidate) => c.email?.toLowerCase() === searchEmail.toLowerCase())
      if (match && !isDetailOpen) {
        handleViewDetails(match)
        // Clear the search param so it doesn't re-trigger
        setSearchParams({}, { replace: true })
      }
    }
  }, [candidates, searchParams])

  // Set up real-time status updates (every 60 seconds)
  useEffect(() => {
    const interval = setInterval(updateOnlineStatus, 60000)
    return () => clearInterval(interval)
  }, [])

  // Refresh candidates function for external use
  const refreshCandidates = () => {
    fetchCandidates()
  }

  const isMenuOpen = Boolean(menuAnchorEl)


  const handleCloseMenu = () => {
    setMenuAnchorEl(null)
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

  const handleToggleStatus = async (candidate: Candidate) => {
    try {
      const response = await apiClient.patch(`/api/candidates/${candidate.id}/toggle-status`)
      const newStatus = response.data.is_active
      setCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, is_active: newStatus } : c))
      // Also update the detail panel if open
      if (detailCandidate && detailCandidate.id === candidate.id) {
        setDetailCandidate({ ...detailCandidate, is_active: newStatus })
      }
      toast.success(`Candidate marked as ${newStatus ? 'Active' : 'Inactive'}`)
    } catch (error) {
      console.error('Error toggling status:', error)
      toast.error('Failed to update status')
    }
  }

  const handleOpenEdit = (candidate: Candidate) => {
    setEditForm({
      name: candidate.name || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      experience_years: candidate.experience ? candidate.experience.replace(/[^0-9]/g, '') : '',
      current_position: candidate.currentPosition || '',
      location: candidate.location || '',
      linkedin_url: '',
      notice_period: '',
      current_ctc: '',
      expected_ctc: '',
    })
    setIsEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!detailCandidate) return
    setEditSaving(true)
    try {
      const payload: Record<string, any> = {}
      if (editForm.name) payload.name = editForm.name
      if (editForm.email) payload.email = editForm.email
      if (editForm.phone) payload.phone = editForm.phone
      if (editForm.experience_years) payload.experience_years = parseInt(editForm.experience_years) || 0
      if (editForm.current_position) payload.current_position = editForm.current_position
      if (editForm.location) payload.location = editForm.location
      if (editForm.linkedin_url) payload.linkedin_url = editForm.linkedin_url
      if (editForm.notice_period) payload.notice_period = editForm.notice_period
      if (editForm.current_ctc) payload.current_ctc = editForm.current_ctc
      if (editForm.expected_ctc) payload.expected_ctc = editForm.expected_ctc

      await apiClient.patch(`/api/candidates/${detailCandidate.id}/edit`, payload)
      toast.success('Candidate updated successfully')
      setIsEditOpen(false)
      // Refresh candidates list and update detail panel
      fetchCandidates()
      setDetailCandidate({
        ...detailCandidate,
        name: editForm.name || detailCandidate.name,
        email: editForm.email || detailCandidate.email,
        phone: editForm.phone || detailCandidate.phone,
        experience: editForm.experience_years ? `${editForm.experience_years} years` : detailCandidate.experience,
        currentPosition: editForm.current_position || detailCandidate.currentPosition,
        location: editForm.location || detailCandidate.location,
      })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update candidate')
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeleteCandidate = async (candidate: Candidate) => {
    if (!window.confirm(`Are you sure you want to delete "${candidate.name}"?`)) return
    try {
      await apiClient.delete(`/api/candidates/${candidate.id}`)
      toast.success('Candidate deleted')
      setCandidates(prev => prev.filter(c => c.id !== candidate.id))
    } catch (error) {
      console.error('Error deleting candidate:', error)
      toast.error('Failed to delete candidate')
    }
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


  const handleOpenFilter = () => setIsFilterOpen(true)
  const handleCloseFilter = () => setIsFilterOpen(false)
  const handleClearFilter = () => {
    setFilters({
      statuses: {},
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
      ? <i className="fas fa-sort-up" style={{ color: '#020291', fontSize: '12px', marginLeft: '4px' }}></i>
      : <i className="fas fa-sort-down" style={{ color: '#020291', fontSize: '12px', marginLeft: '4px' }}></i>
  }

  const filteredCandidates = candidates.filter((candidate) => {
    const query = searchQuery.trim().toLowerCase()
    const haystack = [
      candidate.name,
      candidate.email,
      candidate.phone,
      candidate.experience,
      candidate.currentPosition || '',
      candidate.location || '',
      candidate.department,
      candidate.skills.join(' '),
      (candidate.appliedJobs || []).map(j => j.title).join(' ')
    ]
      .join(' ')
      .toLowerCase()

    // search filter
    const matchesSearch = !query ? true : haystack.includes(query)
    if (!matchesSearch) return false

    // status filter
    // status filter (if no status selected, show all)
    const selectedStatuses = Object.entries((filters.statuses as Record<string, boolean>) || {}).filter(([, v]) => v).map(([k]) => k)
    if (selectedStatuses.length > 0 && !selectedStatuses.includes(candidate.status)) return false

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
      <Box sx={{ p: { xs: 2, md: 3 }, background: '#f8fafc', minHeight: '100%' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>Candidates</Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{
                width: 220,
                '& .MuiOutlinedInput-root': { borderRadius: '8px', background: '#fff', fontSize: '13px' },
              }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><i className="fas fa-search" style={{ color: '#94a3b8', fontSize: '13px' }}></i></InputAdornment>,
              }}
            />
            <IconButton onClick={refreshCandidates} size="small" sx={{ color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', '&:hover': { color: '#020291' } }}>
              <i className="fas fa-sync-alt" style={{ fontSize: '13px' }}></i>
            </IconButton>
            <IconButton onClick={handleOpenFilter} size="small" sx={{ color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', '&:hover': { color: '#020291' } }}>
              <i className="fas fa-filter" style={{ fontSize: '13px' }}></i>
            </IconButton>
          </Box>
        </Box>

        {/* Stats Row */}
        {!loading && (
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            {[
              { label: 'Total', count: candidates.length, color: '#334155' },
              { label: 'Applied', count: candidates.filter(c => c.status === 'Applied').length, color: '#020291' },
              { label: 'Interview', count: candidates.filter(c => c.status === 'Interview').length, color: '#2563eb' },
              { label: 'Hired', count: candidates.filter(c => c.status === 'Hired').length, color: '#059669' },
            ].map((s) => (
              <Chip
                key={s.label}
                label={`${s.label}: ${s.count}`}
                size="small"
                sx={{ fontWeight: 600, fontSize: '12px', color: s.color, background: '#fff', border: '1px solid #e2e8f0' }}
              />
            ))}
          </Box>
        )}


        {/* Table */}
        <Paper elevation={0} sx={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0', background: '#fff' }}>
          {loading ? (
            <Box sx={{ p: 2 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: '1px solid #f1f5f9' }}>
                  <Skeleton variant="circular" width={32} height={32} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="30%" sx={{ fontSize: '14px' }} />
                    <Skeleton variant="text" width="20%" sx={{ fontSize: '12px' }} />
                  </Box>
                  <Skeleton variant="text" width={60} />
                  <Skeleton variant="rounded" width={55} height={22} sx={{ borderRadius: '4px' }} />
                </Box>
              ))}
            </Box>
          ) : paginatedCandidates.length === 0 ? (
            <Box sx={{ p: 5, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '15px', color: '#94a3b8', mb: 1 }}>No candidates found</Typography>
              <Button onClick={refreshCandidates} size="small" sx={{ textTransform: 'none', color: '#020291' }}>
                Refresh
              </Button>
            </Box>
          ) : (
            <>
            {/* Desktop Table View */}
            <TableContainer sx={{ display: { xs: 'none', sm: 'block' } }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{ fontWeight: 600, color: '#64748b', fontSize: '13px', py: 1.5, cursor: 'pointer', '&:hover': { color: '#020291' } }}
                      onClick={() => handleSort('name')}
                    >
                      Name {getSortIcon('name')}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b', fontSize: '13px', py: 1.5 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b', fontSize: '13px', py: 1.5 }}>Experience</TableCell>
                    <TableCell
                      sx={{ fontWeight: 600, color: '#64748b', fontSize: '13px', py: 1.5, cursor: 'pointer', '&:hover': { color: '#020291' } }}
                      onClick={() => handleSort('status')}
                    >
                      Status {getSortIcon('status')}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b', fontSize: '13px', py: 1.5 }}>Account</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b', fontSize: '13px', py: 1.5 }}>Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedCandidates.map((candidate) => (
                    <TableRow
                      key={candidate.id}
                      onClick={() => handleViewDetails(candidate)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { background: '#fafbff' },
                        '& td': { py: 1.5, borderBottom: '1px solid #f1f5f9' }
                      }}
                    >
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar sx={{ width: 32, height: 32, background: getAvatarColor(candidate.name), fontSize: '13px', fontWeight: 600 }}>
                            {candidate.name.charAt(0).toUpperCase()}
                          </Avatar>
                          <Typography sx={{ fontWeight: 600, color: '#1e293b', fontSize: '14px' }}>
                            {candidate.name}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '13px', color: '#64748b' }}>{candidate.email}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '13px', color: '#1e293b' }}>{candidate.experience || '--'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={candidate.status}
                          sx={{
                            fontWeight: 600, fontSize: '11px', borderRadius: '4px', height: 22,
                            background:
                              candidate.status === 'Hired' ? '#ecfdf5' :
                              candidate.status === 'Interview' ? '#eff6ff' :
                              candidate.status === 'Reviewed' ? '#f5f3ff' :
                              candidate.status === 'Rejected' ? '#fef2f2' : '#f0f0ff',
                            color:
                              candidate.status === 'Hired' ? '#059669' :
                              candidate.status === 'Interview' ? '#2563eb' :
                              candidate.status === 'Reviewed' ? '#7c3aed' :
                              candidate.status === 'Rejected' ? '#dc2626' : '#020291',
                          }}
                        />
                      </TableCell>
                      {/* Account Column - just shows status */}
                      <TableCell>
                        <Chip
                          size="small"
                          icon={<i className={`fas ${candidate.is_active === false ? 'fa-user-times' : 'fa-user-check'}`} style={{ fontSize: '10px', color: 'inherit' }}></i>}
                          label={candidate.is_active === false ? 'Inactive' : 'Active'}
                          sx={{
                            fontWeight: 600, fontSize: '11px', borderRadius: '4px', height: 24,
                            background: candidate.is_active === false ? '#fef2f2' : '#ecfdf5',
                            color: candidate.is_active === false ? '#dc2626' : '#059669',
                            '& .MuiChip-icon': { color: 'inherit', ml: '6px' },
                          }}
                        />
                      </TableCell>
                      {/* Action Column - toggle + view + delete */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Tooltip title={candidate.is_active === false ? 'Mark as Active' : 'Mark as Inactive'}>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                const action = candidate.is_active === false ? 'activate' : 'deactivate';
                                if (window.confirm(`Are you sure you want to ${action} "${candidate.name}"?\n\n${action === 'deactivate' ? 'Inactive candidates will not appear in Similar Candidates.' : 'This candidate will appear in Similar Candidates again.'}`)) {
                                  handleToggleStatus(candidate);
                                }
                              }}
                              sx={{
                                color: candidate.is_active === false ? '#059669' : '#f59e0b',
                                '&:hover': {
                                  color: candidate.is_active === false ? '#047857' : '#d97706',
                                  background: candidate.is_active === false ? 'rgba(5,150,105,0.08)' : 'rgba(245,158,11,0.08)',
                                },
                              }}
                            >
                              <i className={`fas ${candidate.is_active === false ? 'fa-toggle-off' : 'fa-toggle-on'}`} style={{ fontSize: '16px' }}></i>
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="View Details">
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); handleViewDetails(candidate) }}
                              sx={{ color: '#94a3b8', '&:hover': { color: '#020291', background: 'rgba(2,2,145,0.06)' } }}
                            >
                              <i className="fas fa-eye" style={{ fontSize: '13px' }}></i>
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete Candidate">
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); handleDeleteCandidate(candidate) }}
                              sx={{ color: '#94a3b8', '&:hover': { color: '#dc2626', background: 'rgba(220,38,38,0.06)' } }}
                            >
                              <i className="fas fa-trash-alt" style={{ fontSize: '12px' }}></i>
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Mobile Card View */}
            <Box sx={{ display: { xs: 'flex', sm: 'none' }, flexDirection: 'column', gap: 0 }}>
              {paginatedCandidates.map((candidate) => (
                <Box
                  key={candidate.id}
                  onClick={() => handleViewDetails(candidate)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    px: 2, py: 1.5, cursor: 'pointer',
                    borderBottom: '1px solid #f1f5f9',
                    '&:hover': { background: '#fafbff' },
                    '&:active': { background: '#f1f5f9' },
                  }}
                >
                  <Avatar sx={{ width: 36, height: 36, background: getAvatarColor(candidate.name), fontSize: '14px', fontWeight: 600, flexShrink: 0 }}>
                    {candidate.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                      <Typography sx={{ fontWeight: 600, color: '#1e293b', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {candidate.name}
                      </Typography>
                      <Chip
                        size="small"
                        label={candidate.status}
                        sx={{
                          fontWeight: 600, fontSize: '9px', borderRadius: '4px', height: 18, flexShrink: 0,
                          background:
                            candidate.status === 'Hired' ? '#ecfdf5' :
                            candidate.status === 'Interview' ? '#eff6ff' :
                            candidate.status === 'Reviewed' ? '#f5f3ff' :
                            candidate.status === 'Rejected' ? '#fef2f2' : '#f0f0ff',
                          color:
                            candidate.status === 'Hired' ? '#059669' :
                            candidate.status === 'Interview' ? '#2563eb' :
                            candidate.status === 'Reviewed' ? '#7c3aed' :
                            candidate.status === 'Rejected' ? '#dc2626' : '#020291',
                        }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {candidate.email}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
                      {candidate.experience && (
                        <Typography sx={{ fontSize: '11px', color: '#64748b' }}>
                          <i className="fas fa-briefcase" style={{ fontSize: 9, marginRight: 3 }} />{candidate.experience}
                        </Typography>
                      )}
                      <Chip
                        size="small"
                        label={candidate.is_active === false ? 'Inactive' : 'Active'}
                        sx={{
                          fontWeight: 600, fontSize: '9px', borderRadius: '4px', height: 16,
                          background: candidate.is_active === false ? '#fef2f2' : '#ecfdf5',
                          color: candidate.is_active === false ? '#dc2626' : '#059669',
                        }}
                      />
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexShrink: 0 }}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        const action = candidate.is_active === false ? 'activate' : 'deactivate';
                        if (window.confirm(`Are you sure you want to ${action} "${candidate.name}"?\n\n${action === 'deactivate' ? 'Inactive candidates will not appear in Similar Candidates.' : 'This candidate will appear in Similar Candidates again.'}`)) {
                          handleToggleStatus(candidate);
                        }
                      }}
                      sx={{
                        color: candidate.is_active === false ? '#059669' : '#f59e0b',
                        p: 0.5,
                      }}
                    >
                      <i className={`fas ${candidate.is_active === false ? 'fa-toggle-off' : 'fa-toggle-on'}`} style={{ fontSize: '14px' }}></i>
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCandidate(candidate) }}
                      sx={{ color: '#94a3b8', p: 0.5 }}
                    >
                      <i className="fas fa-trash-alt" style={{ fontSize: '11px' }}></i>
                    </IconButton>
                  </Box>
                </Box>
              ))}
            </Box>
            </>
          )}
          {/* Pagination */}
          {sortedCandidates.length > 0 && !loading && (
            <TablePagination
              rowsPerPageOptions={[10, 25, 50]}
              component="div"
              count={sortedCandidates.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              sx={{
                borderTop: '1px solid #f1f5f9',
                '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
                  color: '#64748b', fontSize: '13px',
                },
              }}
            />
          )}
        </Paper>

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
            background: 'linear-gradient(135deg, primary.main0%, #020291 100%)',
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
                mt: "10px"
              }}>
                <i className="fas fa-search" style={{ fontSize: '16px', color: '#020291' }}></i>
                Available Positions
              </Typography>

              <FormControl fullWidth>
                <InputLabel sx={{
                  color: '#64748b',
                  '&.Mui-focused': { color: '#020291' }
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
                      borderColor: '#020291'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#020291',
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
                background: 'linear-gradient(135deg, primary.main0%, #020291 100%)',
                textTransform: 'none',
                fontWeight: 600,
                padding: { xs: '10px 20px', md: '10px 32px' },
                borderRadius: '10px',
                width: { xs: '100%', sm: 'auto' },
                order: { xs: 1, sm: 2 },
                boxShadow: '0 4px 15px rgba(2, 2, 145, 0.3)',
                '&:hover': {
                  background: '#020291',
                  boxShadow: '#020291'
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
                mt: "10px"
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
          maxWidth="xs"
          fullWidth
          PaperProps={{
            sx: {
              borderRadius: '16px',
              margin: { xs: '12px', md: '32px' },
              overflow: 'hidden'
            }
          }}
        >
          <DialogTitle sx={{
            fontSize: '17px',
            fontWeight: 700,
            color: 'white',
            background: '#020291',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            Filter Candidates
            <IconButton onClick={handleCloseFilter} sx={{ color: 'white', p: 0.5 }}>
              <i className="fas fa-times" style={{ fontSize: '14px' }} />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ padding: '20px 24px !important' }}>
            {/* Status Section */}
            <Typography sx={{ fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.5 }}>
              Status
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
              {['active', 'pending'].map(status => {
                const checked = (filters.statuses as Record<string, boolean>)[status] ?? false
                return (
                  <Chip
                    key={status}
                    label={status.charAt(0).toUpperCase() + status.slice(1)}
                    onClick={() => setFilters(prev => ({
                      ...prev,
                      statuses: { ...(prev.statuses as Record<string, boolean>), [status]: !checked }
                    }))}
                    sx={{
                      fontWeight: 600,
                      fontSize: '13px',
                      borderRadius: '8px',
                      border: '1.5px solid',
                      borderColor: checked ? '#020291' : '#e2e8f0',
                      background: checked ? '#EEF0FF' : 'white',
                      color: checked ? '#020291' : '#64748b',
                      cursor: 'pointer',
                      '&:hover': { background: '#EEF0FF', borderColor: '#020291' }
                    }}
                  />
                )
              })}
            </Box>

            <Divider sx={{ mb: 2.5 }} />

            {/* Department Section */}
            {(() => {
              const departments = [...new Set(candidates.map(c => c.department).filter(Boolean))]
              if (departments.length === 0) return null
              return (
                <>
                  <Typography sx={{ fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.5 }}>
                    Department
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
                    {departments.map(dept => {
                      const checked = (filters.departments as Record<string, boolean>)?.[dept] ?? false
                      return (
                        <Chip
                          key={dept}
                          label={dept}
                          onClick={() => setFilters(prev => ({
                            ...prev,
                            departments: { ...(prev.departments as Record<string, boolean>), [dept]: !checked }
                          }))}
                          sx={{
                            fontWeight: 600,
                            fontSize: '13px',
                            borderRadius: '8px',
                            border: '1.5px solid',
                            borderColor: checked ? '#020291' : '#e2e8f0',
                            background: checked ? '#EEF0FF' : 'white',
                            color: checked ? '#020291' : '#64748b',
                            cursor: 'pointer',
                            '&:hover': { background: '#EEF0FF', borderColor: '#020291' }
                          }}
                        />
                      )
                    })}
                  </Box>
                  <Divider sx={{ mb: 2.5 }} />
                </>
              )
            })()}

            {/* Min Score Section */}
            <Typography sx={{ fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
              Minimum Score
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Slider
                value={filters.minScore}
                onChange={(_, value) => setFilters(prev => ({ ...prev, minScore: value as number }))}
                min={0}
                max={100}
                step={5}
                sx={{
                  color: '#020291',
                  '& .MuiSlider-thumb': { width: 18, height: 18 },
                }}
              />
              <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#020291', minWidth: '40px' }}>
                {filters.minScore}%
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions sx={{ padding: '12px 24px 20px', gap: '10px' }}>
            <Button
              onClick={handleClearFilter}
              sx={{
                color: '#64748b',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '13px',
                borderRadius: '10px',
                border: '1.5px solid #e2e8f0',
                px: 2.5,
                '&:hover': { background: '#f8fafc', borderColor: '#cbd5e1' }
              }}
            >
              Clear All
            </Button>
            <Button
              onClick={handleCloseFilter}
              variant="contained"
              sx={{
                background: '#020291',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '13px',
                borderRadius: '10px',
                px: 3,
                '&:hover': { background: '#01016d' }
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
          <MenuItem onClick={() => { if (menuCandidate) { handleViewDetails(menuCandidate); handleCloseMenu(); } }} sx={{ padding: '12px 20px', fontSize: '14px' }}>
            <i className="fas fa-user" style={{ marginRight: '12px', color: '#64748b' }}></i>
            View Profile
          </MenuItem>



          <MenuItem onClick={() => { navigate('/video-scheduler'); }} sx={{ padding: '12px 20px', fontSize: '14px' }}>
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

        {/* Candidate Details Panel */}
        <Drawer
          anchor="right"
          open={isDetailOpen}
          onClose={handleCloseDetails}
          transitionDuration={300}
          SlideProps={{ easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
          PaperProps={{
            sx: {
              width: { xs: 'calc(100% - 32px)', sm: 420 },
              m: { xs: '16px', sm: '16px' },
              height: 'calc(100% - 32px)',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
              overflow: 'hidden',
            }
          }}
        >
          {detailCandidate && (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <Box sx={{ p: 3, pb: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ width: 48, height: 48, background: getAvatarColor(detailCandidate.name), fontSize: '18px', fontWeight: 700 }}>
                      {detailCandidate.name?.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', lineHeight: 1.3 }}>{detailCandidate.name}</Typography>
                      <Typography sx={{ fontSize: '13px', color: '#64748b' }}>{detailCandidate.email}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, alignSelf: 'flex-start' }}>
                    <Tooltip title="Edit candidate">
                      <IconButton onClick={() => handleOpenEdit(detailCandidate)} size="small" sx={{ color: '#94a3b8', '&:hover': { color: '#020291' } }}>
                        <i className="fas fa-pen" style={{ fontSize: '12px' }}></i>
                      </IconButton>
                    </Tooltip>
                    <IconButton onClick={handleCloseDetails} size="small" sx={{ color: '#94a3b8' }}>
                      <i className="fas fa-times" style={{ fontSize: '14px' }}></i>
                    </IconButton>
                  </Box>
                </Box>
                {/* Info row with icons */}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {detailCandidate.phone && detailCandidate.phone !== '--' && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <i className="fas fa-phone" style={{ fontSize: '11px', color: '#94a3b8' }}></i>
                      <Typography sx={{ fontSize: '12px', color: '#64748b' }}>{detailCandidate.phone}</Typography>
                    </Box>
                  )}
                  {detailCandidate.location && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <i className="fas fa-map-marker-alt" style={{ fontSize: '11px', color: '#94a3b8' }}></i>
                      <Typography sx={{ fontSize: '12px', color: '#64748b' }}>{detailCandidate.location}</Typography>
                    </Box>
                  )}
                  {detailCandidate.experience && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                      <i className="fas fa-briefcase" style={{ fontSize: '11px', color: '#94a3b8' }}></i>
                      <Typography sx={{ fontSize: '12px', color: '#64748b' }}>{detailCandidate.experience}</Typography>
                    </Box>
                  )}
                </Box>

                {/* Action buttons: Toggle Active/Inactive */}
                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <Button
                    size="small"
                    onClick={() => handleToggleStatus(detailCandidate)}
                    sx={{
                      textTransform: 'none', fontSize: '12px', fontWeight: 600, borderRadius: '8px', px: 2, height: '32px',
                      border: '1px solid',
                      borderColor: detailCandidate.is_active !== false ? '#dc2626' : '#16a34a',
                      color: detailCandidate.is_active !== false ? '#dc2626' : '#16a34a',
                      '&:hover': {
                        background: detailCandidate.is_active !== false ? '#fef2f2' : '#f0fdf4',
                      }
                    }}
                  >
                    <i className={detailCandidate.is_active !== false ? 'fas fa-user-slash' : 'fas fa-user-check'} style={{ fontSize: 11, marginRight: 6 }} />
                    {detailCandidate.is_active !== false ? 'Mark Inactive' : 'Mark Active'}
                  </Button>
                  <Chip
                    size="small"
                    label={detailCandidate.is_active !== false ? 'Active' : 'Inactive'}
                    sx={{
                      fontWeight: 600, fontSize: '11px', height: '32px',
                      background: detailCandidate.is_active !== false ? '#ecfdf5' : '#fef2f2',
                      color: detailCandidate.is_active !== false ? '#059669' : '#dc2626',
                    }}
                  />
                </Box>
              </Box>

              <Divider />

              {/* Body */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
                {/* Status, Score, Experience cards */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 3 }}>
                  <Box sx={{ p: 1.5, background: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', mb: 0.5 }}>Status</Typography>
                    <Chip size="small" label={detailCandidate.status} sx={{
                      fontWeight: 600, fontSize: '11px', borderRadius: '4px',
                      background:
                        detailCandidate.status === 'Hired' ? '#ecfdf5' :
                        detailCandidate.status === 'Interview' ? '#eff6ff' :
                        detailCandidate.status === 'Rejected' ? '#fef2f2' : '#f0f0ff',
                      color:
                        detailCandidate.status === 'Hired' ? '#059669' :
                        detailCandidate.status === 'Interview' ? '#2563eb' :
                        detailCandidate.status === 'Rejected' ? '#dc2626' : '#020291',
                    }} />
                  </Box>
                  <Box sx={{ p: 1.5, background: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', mb: 0.5 }}>Score</Typography>
                    <Typography sx={{
                      fontSize: '20px', fontWeight: 800, lineHeight: 1,
                      color: detailCandidate.score >= 75 ? '#059669' : detailCandidate.score >= 50 ? '#2563eb' : detailCandidate.score > 0 ? '#dc2626' : '#cbd5e1'
                    }}>
                      {detailCandidate.score > 0 ? `${detailCandidate.score}%` : '--'}
                    </Typography>
                    {detailCandidate.recommendation && (
                      <Typography sx={{ fontSize: '9px', fontWeight: 600, textTransform: 'capitalize', mt: 0.3,
                        color: detailCandidate.recommendation === 'select' ? '#059669' : detailCandidate.recommendation === 'next_round' ? '#2563eb' : '#dc2626'
                      }}>
                        {detailCandidate.recommendation.replace('_', ' ')}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ p: 1.5, background: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', mb: 0.5 }}>Jobs</Typography>
                    <Typography sx={{ fontSize: '20px', fontWeight: 800, lineHeight: 1, color: '#020291' }}>
                      {detailCandidate.appliedJobs?.length || 0}
                    </Typography>
                  </Box>
                </Box>

                {/* Skills */}
                {detailCandidate.skills && detailCandidate.skills.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography sx={{ fontSize: '12px', color: '#334155', fontWeight: 600, mb: 1 }}>Skills</Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                      {detailCandidate.skills.map((skill: string, i: number) => (
                        <Chip key={i} label={skill} size="small" sx={{ fontSize: '12px', fontWeight: 500, background: '#f1f5f9', color: '#475569', borderRadius: '6px' }} />
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Applied Jobs */}
                <Box>
                  <Typography sx={{ fontSize: '12px', color: '#334155', fontWeight: 600, mb: 1 }}>
                    Applied Jobs
                  </Typography>
                  {detailCandidate.appliedJobs && detailCandidate.appliedJobs.length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {detailCandidate.appliedJobs.map((job, idx) => (
                        <Box key={idx} sx={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          p: 1.5, border: '1px solid #e2e8f0', borderRadius: '10px',
                          '&:hover': { background: '#fafbff', borderColor: '#d0d5dd' }
                        }}>
                          <Box>
                            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{job.title}</Typography>
                            <Typography sx={{ fontSize: '11px', color: '#94a3b8' }}>Application #{job.application_id}</Typography>
                          </Box>
                          <Chip size="small" label={job.status} sx={{
                            fontWeight: 600, fontSize: '10px', height: 22, borderRadius: '4px',
                            background:
                              job.status === 'Hired' ? '#ecfdf5' :
                              job.status === 'Interview' ? '#eff6ff' :
                              job.status === 'Rejected' ? '#fef2f2' : '#f0f0ff',
                            color:
                              job.status === 'Hired' ? '#059669' :
                              job.status === 'Interview' ? '#2563eb' :
                              job.status === 'Rejected' ? '#dc2626' : '#020291',
                          }} />
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: '13px', color: '#cbd5e1', py: 2, textAlign: 'center' }}>No applications</Typography>
                  )}
                </Box>
              </Box>

              {/* Footer */}
              {candidateQuestionSessions[detailCandidate.id] && (
                <Box sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
                  <Button
                    fullWidth
                    onClick={() => { navigate(`/interview-outline/${candidateQuestionSessions[detailCandidate.id]}`); handleCloseDetails() }}
                    sx={{ background: '#020291', color: '#fff', textTransform: 'none', fontWeight: 600, borderRadius: '10px', py: 1.2, '&:hover': { background: '#01016e' } }}
                  >
                    Review Questions
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </Drawer>

        {/* Edit Candidate Dialog */}
        <Dialog open={isEditOpen} onClose={() => !editSaving && setIsEditOpen(false)} maxWidth="sm" fullWidth
          PaperProps={{ sx: { borderRadius: '16px' } }}>
          <DialogTitle sx={{ fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0', pb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020291', color: 'white' }}>
                <i className="fas fa-user-edit" />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>Edit Candidate</Typography>
                <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Update candidate details</Typography>
              </Box>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ pt: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Full Name</Typography>
                  <TextField fullWidth value={editForm.name} onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Email</Typography>
                  <TextField fullWidth value={editForm.email} onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Phone</Typography>
                  <TextField fullWidth value={editForm.phone} onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                    inputProps={{ maxLength: 10 }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Experience (Years)</Typography>
                  <TextField fullWidth type="number" value={editForm.experience_years} onChange={e => setEditForm(prev => ({ ...prev, experience_years: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Current Position</Typography>
                  <TextField fullWidth value={editForm.current_position} onChange={e => setEditForm(prev => ({ ...prev, current_position: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Location</Typography>
                  <TextField fullWidth value={editForm.location} onChange={e => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>LinkedIn</Typography>
                  <TextField fullWidth value={editForm.linkedin_url} onChange={e => setEditForm(prev => ({ ...prev, linkedin_url: e.target.value }))}
                    placeholder="https://linkedin.com/in/..."
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Notice Period</Typography>
                  <TextField fullWidth value={editForm.notice_period} onChange={e => setEditForm(prev => ({ ...prev, notice_period: e.target.value }))}
                    placeholder="30 days"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Current CTC</Typography>
                  <TextField fullWidth value={editForm.current_ctc} onChange={e => setEditForm(prev => ({ ...prev, current_ctc: e.target.value }))}
                    placeholder="12 LPA"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Expected CTC</Typography>
                  <TextField fullWidth value={editForm.expected_ctc} onChange={e => setEditForm(prev => ({ ...prev, expected_ctc: e.target.value }))}
                    placeholder="18 LPA"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
                </Box>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
            <Button onClick={() => setIsEditOpen(false)} disabled={editSaving} sx={{ color: '#64748b', textTransform: 'none', px: 3, height: '40px', borderRadius: '10px', '&:hover': { background: '#f1f5f9' } }}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}
              sx={{ background: '#020291', color: 'white', borderRadius: '10px', textTransform: 'none', fontWeight: 600, px: 3, height: '40px', '&:hover': { background: '#06109E' }, '&:disabled': { opacity: 0.6, color: 'white' } }}>
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Navigation>
  )
}

export default Candidates