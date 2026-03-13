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
  Alert,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  CircularProgress
} from '@mui/material'
import { apiClient } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { jobService } from '../../services/jobService'
import { recruiterService } from '../../services/recruiterService'
import { toast as hotToast } from 'react-hot-toast'

interface JobDetailsProps {
  selectedJob: any;
  onClose: () => void;
  onJobSelect?: (job: any) => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Open':
    case 'Applied':
    case 'Added by Recruiter':
      return { bg: '#dcfce7', color: '#16a34a' }
    case 'Questions Generated':
      return { bg: '#EEF0FF', color: '#020291' }
    case 'Interview Scheduled':
    case 'Interview In Progress':
      return { bg: '#e3f2fd', color: '#1976d2' }
    case 'Interview Completed':
      return { bg: '#fef3c7', color: '#d97706' }
    case 'Offer Sent':
      return { bg: '#dbeafe', color: '#2563eb' }
    case 'Hired':
      return { bg: '#d1fae5', color: '#059669' }
    case 'Offer Declined':
    case 'Closed':
    case 'Rejected':
      return { bg: '#ffebee', color: '#c62828' }
    case 'Paused':
      return { bg: '#fff3e0', color: '#ef6c00' }
    default:
      return { bg: '#f5f5f5', color: '#666666' }
  }
}

// Collapsible description block to avoid pushing candidates section too far down
const DescriptionBlock: React.FC<{ text: string; canEdit?: boolean; onEdit?: () => void }> = ({ text, canEdit, onEdit }) => {
  const [expanded, setExpanded] = useState(false)
  const MAX_LENGTH = 300
  const isLong = text.length > MAX_LENGTH

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>
          {isLong && !expanded ? text.slice(0, MAX_LENGTH) + '...' : text}
        </Typography>
        {isLong && (
          <Button
            onClick={() => setExpanded(!expanded)}
            sx={{
              textTransform: 'none', fontSize: '13px', fontWeight: 600,
              color: '#020291', p: 0, minWidth: 'auto', mt: 0.5,
              '&:hover': { background: 'transparent', textDecoration: 'underline' }
            }}
          >
            {expanded ? 'Show less' : 'Read more'}
          </Button>
        )}
      </Box>
      {canEdit && (
        <IconButton size="small" onClick={onEdit}
          sx={{ color: '#94a3b8', mt: '-4px', '&:hover': { color: '#020291' } }}>
          <i className="fas fa-pen" style={{ fontSize: 12 }}></i>
        </IconButton>
      )}
    </Box>
  )
}

const JobDetails: React.FC<JobDetailsProps> = ({
  selectedJob,
  onClose,
}) => {
  const [candidates, setCandidates] = useState<any[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(true)
  const [similarCandidates, setSimilarCandidates] = useState<any[]>([])
  const [similarCandidatesLoading, setSimilarCandidatesLoading] = useState(true)
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editedDescription, setEditedDescription] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' })

  // Search, filter & pagination
  const [candidateSearch, setCandidateSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 5

  // Question generation & transcript state per candidate
  const [generatingQuestions, setGeneratingQuestions] = useState<Record<number, boolean>>({})
  const [candidateQuestionSets, setCandidateQuestionSets] = useState<Record<number, string>>({})
  const [candidateVideoIds, setCandidateVideoIds] = useState<Record<number, number>>({})
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false)
  const [transcriptCandidate, setTranscriptCandidate] = useState<any>(null)
  const [transcriptText, setTranscriptText] = useState('')
  const [uploadingTranscript, setUploadingTranscript] = useState(false)

  // Add candidate dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '', email: '', phone: '', location: '', linkedin: '',
    notice_period: '', current_ctc: '', expected_ctc: '',
    experience_years: '',
    interview_datetime: '', duration_minutes: '30',
    resume: null as File | null
  })
  const [addFormErrors, setAddFormErrors] = useState<Record<string, string>>({})
  const [addFormTouched, setAddFormTouched] = useState<Record<string, boolean>>({})

  const navigate = useNavigate()
  const { user } = useAuth()

  // Fetch candidates for this job
  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        setCandidatesLoading(true)
        const response = await apiClient.get(`/api/job/${selectedJob.id}/applications`)
        if (response.status === 200) {
          setCandidates(response.data.applications || [])
        }
      } catch (error) {
        console.error('Error fetching candidates:', error)
      } finally {
        setCandidatesLoading(false)
      }
    }
    if (selectedJob?.id) fetchCandidates()
  }, [selectedJob?.id])

  // Fetch existing question sets & video interviews
  useEffect(() => {
    const fetchQuestionSetsAndVideos = async () => {
      try {
        const [qsRes, viRes] = await Promise.all([
          apiClient.get('/api/interview/question-sets'),
          apiClient.get('/api/video/interviews')
        ])
        const sets = qsRes.data || []
        const qMapping: Record<number, string> = {}
        for (const qs of sets) {
          if (qs.job_id === selectedJob.id && qs.application_id) {
            qMapping[qs.application_id] = qs.id
          }
        }
        setCandidateQuestionSets(qMapping)

        const interviews = viRes.data || []
        const vMapping: Record<number, number> = {}
        for (const vi of interviews) {
          if (vi.job_id === selectedJob.id) {
            const matched = vi.candidate_email ? candidates.find((c: any) =>
              c.applicant_email?.toLowerCase() === vi.candidate_email.toLowerCase()
            ) : null
            if (matched) vMapping[matched.id] = vi.id
          }
        }
        setCandidateVideoIds(vMapping)
      } catch (error) {
        console.error('Error fetching question sets:', error)
      }
    }
    if (selectedJob?.id && candidates.length > 0) fetchQuestionSetsAndVideos()
  }, [selectedJob?.id, candidates.length])

  // Generate questions for a candidate
  const handleGenerateQuestions = async (candidateId: number) => {
    setGeneratingQuestions(prev => ({ ...prev, [candidateId]: true }))
    try {
      hotToast('Generating questions... This may take a minute', { icon: '⏳', duration: 5000 })
      const genResult = await recruiterService.generateQuestions(selectedJob.id, candidateId)
      hotToast.success('Questions generated & interview scheduled!')
      const response = await apiClient.get('/api/interview/question-sets')
      const sets = response.data || []
      const mapping: Record<number, string> = { ...candidateQuestionSets }
      for (const qs of sets) {
        if (qs.job_id === selectedJob.id && qs.application_id) {
          mapping[qs.application_id] = qs.id
        }
      }
      setCandidateQuestionSets(mapping)
      // Always refetch video interviews to get the latest mapping
      try {
        const viRes = await apiClient.get('/api/video/interviews')
        const interviews = viRes.data || []
        const vMapping: Record<number, number> = {}
        for (const vi of interviews) {
          if (vi.job_id === selectedJob.id) {
            const matched = vi.candidate_email ? candidates.find((c: any) =>
              c.applicant_email?.toLowerCase() === vi.candidate_email.toLowerCase()
            ) : null
            if (matched) vMapping[matched.id] = vi.id
          }
        }
        // Also use direct result if available
        if (genResult.video_interview_id) {
          vMapping[candidateId] = genResult.video_interview_id
        }
        setCandidateVideoIds(vMapping)
      } catch (e) { console.error('Failed to refetch video interviews:', e) }
      setCandidates((prev: any[]) => prev.map(c => c.id === candidateId ? { ...c, status: 'Questions Generated' } : c))
    } catch (err: any) {
      hotToast.error(err.response?.data?.detail || 'Failed to generate questions')
    } finally {
      setGeneratingQuestions(prev => ({ ...prev, [candidateId]: false }))
    }
  }

  const handleUpdateStatus = async (candidateId: number, newStatus: string) => {
    try {
      await apiClient.patch(`/api/applications/${candidateId}/status`, { status: newStatus })
      setCandidates((prev: any[]) => prev.map(c => c.id === candidateId ? { ...c, status: newStatus } : c))
      hotToast.success(`Status updated to ${newStatus}`)
    } catch (err: any) {
      hotToast.error(err.response?.data?.detail || 'Failed to update status')
    }
  }

  const handleSendOffer = async (candidateId: number) => {
    try {
      const res = await apiClient.post(`/api/applications/${candidateId}/send-offer`)
      setCandidates((prev: any[]) => prev.map(c => c.id === candidateId ? { ...c, status: 'Offer Sent' } : c))
      hotToast.success(res.data.email_sent ? 'Offer sent to candidate email!' : 'Status updated (email delivery pending)')
    } catch (err: any) {
      hotToast.error(err.response?.data?.detail || 'Failed to send offer')
    }
  }

  // Upload transcript and generate score
  const handleUploadTranscript = async () => {
    if (!transcriptText.trim() || !transcriptCandidate) return
    setUploadingTranscript(true)
    try {
      // Step 1: Upload transcript
      await apiClient.post(`/api/candidates/${transcriptCandidate.id}/upload-transcript`, {
        job_id: selectedJob.id,
        transcript_text: transcriptText.trim()
      })
      // Step 2: Generate score
      await apiClient.post(`/api/candidates/${transcriptCandidate.id}/generate-score`, {
        job_id: selectedJob.id
      })
      hotToast.success('Score generated successfully!')
      setTranscriptDialogOpen(false)
      setTranscriptText('')
      setTranscriptCandidate(null)
      // Redirect to results page
      navigate('/results')
    } catch (err: any) {
      hotToast.error(err.response?.data?.detail || 'Failed to upload transcript')
    } finally {
      setUploadingTranscript(false)
    }
  }

  useEffect(() => {
    const fetchSimilarCandidates = async () => {
      try {
        setSimilarCandidatesLoading(true)
        const response = await apiClient.get('/api/candidates', { params: { limit: 50 } })
        const allCandidates = response.data?.data || []
        const currentEmails = candidates.map((c: any) => c.applicant_email?.toLowerCase())

        let jobSkills: string[] = []
        if (Array.isArray(selectedJob.requirements) && selectedJob.requirements.length > 0) {
          jobSkills = selectedJob.requirements
        } else if (selectedJob.skills_required) {
          try {
            if (typeof selectedJob.skills_required === 'string') {
              jobSkills = JSON.parse(selectedJob.skills_required)
            } else if (Array.isArray(selectedJob.skills_required)) {
              jobSkills = selectedJob.skills_required
            }
          } catch {
            if (typeof selectedJob.skills_required === 'string') {
              jobSkills = selectedJob.skills_required.split(',').map((s: string) => s.trim()).filter(Boolean)
            }
          }
        }
        const jobSkillsLower = jobSkills.map(s => s.toLowerCase())
        const jobTitle = (selectedJob.title || '').toLowerCase()
        const jobCategory = (selectedJob.category || selectedJob.company || '').toLowerCase()

        const scored = allCandidates
          .filter((c: any) => !currentEmails.includes(c.email?.toLowerCase()))
          .map((c: any) => {
            const cSkills = (c.skills || []).map((s: string) => s.toLowerCase())
            const skillMatch = cSkills.filter((s: string) => jobSkillsLower.some(js => s.includes(js) || js.includes(s))).length
            const deptMatch = (c.department || '').toLowerCase().includes(jobCategory) || jobCategory.includes((c.department || '').toLowerCase()) ? 1 : 0
            const titleMatch = jobTitle.split(' ').filter((w: string) => w.length > 2 && (c.department || '').toLowerCase().includes(w)).length
            return { ...c, _score: (skillMatch * 3) + (deptMatch * 2) + titleMatch }
          })
          .filter((c: any) => c._score > 0)
          .sort((a: any, b: any) => b._score - a._score)
          .slice(0, 5)

        setSimilarCandidates(scored)
      } catch (error) {
        console.error('Error fetching similar candidates:', error)
      } finally {
        setSimilarCandidatesLoading(false)
      }
    }
    if (selectedJob?.id && !candidatesLoading) fetchSimilarCandidates()
  }, [selectedJob?.id, candidatesLoading, candidates])

  // Helper functions
  const getExperienceLevel = (job: any) => job.experience_level || job.experienceLevel || 'Not specified'

  const getFormattedDate = (job: any) => {
    const dateStr = job.created_at || job.createdAt
    if (!dateStr) return ''
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch { return '' }
  }

  // Add candidate validation
  const validateAddField = (field: string, value: string): string => {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Full name is required'
        if (value.trim().length < 2) return 'Name must be at least 2 characters'
        if (!/^[a-zA-Z\s.'-]+$/.test(value.trim())) return 'Name can only contain letters and spaces'
        if (value.trim().length > 100) return 'Name must be less than 100 characters'
        return ''
      case 'email':
        if (!value.trim()) return 'Email is required'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Please enter a valid email'
        return ''
      case 'phone':
        if (!value.trim()) return ''  // optional
        if (!/^\d+$/.test(value.trim())) return 'Phone number must contain only digits'
        if (value.trim().length !== 10) return 'Phone number must be exactly 10 digits'
        return ''
      case 'linkedin':
        if (value.trim() && !value.trim().startsWith('http')) return 'Please enter a valid URL'
        return ''
      default:
        return ''
    }
  }

  const handleAddFieldChange = (field: string, value: string) => {
    // For phone, only allow digits
    if (field === 'phone' && value !== '' && !/^\d*$/.test(value)) {
      setAddFormTouched(prev => ({ ...prev, phone: true }))
      setAddFormErrors(prev => ({ ...prev, phone: 'Phone number must contain only digits' }))
      return
    }
    setAddForm(prev => ({ ...prev, [field]: value }))
    // Validate immediately as user types
    setAddFormTouched(prev => ({ ...prev, [field]: true }))
    setAddFormErrors(prev => ({ ...prev, [field]: validateAddField(field, value) }))
  }

  const handleAddFieldBlur = (field: string, value: string) => {
    setAddFormTouched(prev => ({ ...prev, [field]: true }))
    setAddFormErrors(prev => ({ ...prev, [field]: validateAddField(field, value) }))
  }

  const handleAddCandidate = async () => {
    const errors: Record<string, string> = {
      name: validateAddField('name', addForm.name),
      email: validateAddField('email', addForm.email),
      resume: addForm.resume ? '' : 'Resume is required',
    }
    if (addForm.phone) errors.phone = validateAddField('phone', addForm.phone)
    if (addForm.linkedin) errors.linkedin = validateAddField('linkedin', addForm.linkedin)
    setAddFormErrors(errors)
    setAddFormTouched({ name: true, email: true, resume: true, phone: true, linkedin: true })

    if (Object.values(errors).some(e => e !== '')) {
      hotToast.error('Please fix the errors before submitting')
      return
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('name', addForm.name)
      fd.append('email', addForm.email)
      fd.append('phone', addForm.phone)
      fd.append('location', addForm.location)
      fd.append('linkedin_url', addForm.linkedin)
      fd.append('notice_period', addForm.notice_period)
      fd.append('current_ctc', addForm.current_ctc)
      fd.append('expected_ctc', addForm.expected_ctc)
      fd.append('interview_datetime', addForm.interview_datetime)
      fd.append('duration_minutes', addForm.duration_minutes || '30')
      fd.append('experience_years', addForm.experience_years || '0')
      fd.append('current_position', '')
      if (addForm.resume) fd.append('resume', addForm.resume)

      await recruiterService.addCandidate(selectedJob.id, fd)
      hotToast.success('Candidate added successfully')
      setAddDialogOpen(false)
      setAddForm({
        name: '', email: '', phone: '', location: '', linkedin: '',
        notice_period: '', current_ctc: '', expected_ctc: '',
        experience_years: '',
        interview_datetime: '', duration_minutes: '30', resume: null
      })
      setAddFormErrors({})
      setAddFormTouched({})
      // Refresh candidates
      const response = await apiClient.get(`/api/job/${selectedJob.id}/applications`)
      if (response.status === 200) setCandidates(response.data.applications || [])
    } catch (err: any) {
      hotToast.error(err.response?.data?.detail || 'Failed to add candidate')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box sx={{ width: '100%', py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}>
      {/* Back Button */}
      <Button
        onClick={onClose}
        sx={{
          textTransform: 'none', fontWeight: 500, fontSize: '14px', color: '#64748b', mb: 3,
          '&:hover': { color: '#020291', background: 'transparent' },
        }}
      >
        <i className="fas fa-arrow-left" style={{ marginRight: 8, fontSize: 12 }}></i> Back to Jobs
      </Button>

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
      {/* Left Column - Job Details + Candidates */}
      <Box sx={{ flex: 1, minWidth: 0 }}>

      {/* Job Summary Card */}
      <Box sx={{
        p: { xs: '16px', md: '24px' },
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        background: '#fff',
        mb: 3,
      }}>
        {/* Title + Status + Edit */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ fontSize: { xs: '20px', md: '24px' }, fontWeight: 700, color: '#1e293b' }}>
              {selectedJob.title}
            </Typography>
            <Chip
              label={selectedJob.status}
              size="small"
              sx={{
                background: getStatusColor(selectedJob.status).bg,
                color: getStatusColor(selectedJob.status).color,
                fontSize: '12px', fontWeight: 600, height: '24px',
              }}
            />
          </Box>
          {(user?.role === 'recruiter' || user?.role === 'admin') && (
            <Button
              onClick={() => navigate(`/recruiter-candidates?jobId=${selectedJob.id}&jobTitle=${encodeURIComponent(selectedJob.title)}`)}
              variant="outlined"
              sx={{
                textTransform: 'none', fontWeight: 600, fontSize: '13px',
                borderRadius: '8px', borderColor: '#e2e8f0', color: '#1e293b',
                '&:hover': { borderColor: '#020291', background: '#f8fafc' }
              }}
            >
              <i className="fas fa-pen" style={{ marginRight: 6, fontSize: 12 }}></i> Edit
            </Button>
          )}
        </Box>

        {/* Meta info row */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1.5, md: 3 }, mb: 2, color: '#64748b', fontSize: '13px' }}>
          {selectedJob.company && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <i className="fas fa-building" style={{ fontSize: 12 }}></i>
              <Typography sx={{ fontSize: '13px', color: '#64748b' }}>{selectedJob.company}</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <i className="fas fa-briefcase" style={{ fontSize: 12 }}></i>
            <Typography sx={{ fontSize: '13px', color: '#64748b' }}>{getExperienceLevel(selectedJob)} experience</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <i className="fas fa-users" style={{ fontSize: 12 }}></i>
            <Typography sx={{ fontSize: '13px', color: '#64748b' }}>{candidates.length} candidate{candidates.length !== 1 ? 's' : ''}</Typography>
          </Box>
          {getFormattedDate(selectedJob) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <i className="fas fa-clock" style={{ fontSize: 12 }}></i>
              <Typography sx={{ fontSize: '13px', color: '#64748b' }}>{getFormattedDate(selectedJob)}</Typography>
            </Box>
          )}
        </Box>

        {/* Description - commented out as requested */}
        {/* <Typography sx={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6 }}>
          {selectedJob.fullDescription || selectedJob.description}
        </Typography> */}

        {/* Inline editable description */}
        {isEditingDesc ? (
          <Box>
            <TextField
              multiline minRows={3} maxRows={10} fullWidth
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              sx={{
                mb: '12px',
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px', fontSize: '14px',
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#020291' },
                  '&.Mui-focused fieldset': { borderColor: '#020291' },
                }
              }}
            />
            <Box sx={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsEditingDesc(false)} disabled={savingDesc}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '13px', color: '#64748b', borderRadius: '8px', '&:hover': { background: '#f1f5f9' } }}>
                Cancel
              </Button>
              <Button variant="contained" disabled={savingDesc}
                onClick={async () => {
                  try {
                    setSavingDesc(true)
                    await jobService.updateJob(selectedJob.id, { description: editedDescription })
                    selectedJob.description = editedDescription
                    selectedJob.fullDescription = editedDescription
                    setIsEditingDesc(false)
                    setToast({ open: true, message: 'Description updated', severity: 'success' })
                  } catch {
                    setToast({ open: true, message: 'Failed to update', severity: 'error' })
                  } finally { setSavingDesc(false) }
                }}
                sx={{
                  textTransform: 'none', fontWeight: 600, fontSize: '13px', borderRadius: '8px',
                  background: '#020291', '&:hover': { background: '#06109E' }
                }}>
                {savingDesc ? 'Saving...' : 'Save'}
              </Button>
            </Box>
          </Box>
        ) : (
          (selectedJob.fullDescription || selectedJob.description) && (
            <DescriptionBlock
              text={selectedJob.fullDescription || selectedJob.description}
              canEdit={user?.role === 'recruiter' || user?.role === 'admin'}
              onEdit={() => {
                setEditedDescription(selectedJob.fullDescription || selectedJob.description || '')
                setIsEditingDesc(true)
              }}
            />
          )
        )}

        {/* Skills */}
        {(() => {
          let skills: string[] = []
          // Try requirements array first (mapped from skills_required)
          if (Array.isArray(selectedJob.requirements) && selectedJob.requirements.length > 0) {
            skills = selectedJob.requirements
          } else if (selectedJob.skills_required) {
            try {
              if (typeof selectedJob.skills_required === 'string') {
                skills = JSON.parse(selectedJob.skills_required)
              } else if (Array.isArray(selectedJob.skills_required)) {
                skills = selectedJob.skills_required
              }
            } catch {
              if (typeof selectedJob.skills_required === 'string') {
                skills = selectedJob.skills_required.split(',').map((s: string) => s.trim()).filter(Boolean)
              }
            }
          }
          if (!skills.length) return null
          return (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {skills.map((skill: string, index: number) => (
                  <Chip key={index} label={skill} size="small"
                    sx={{
                      fontSize: '12px', fontWeight: 500, height: '26px',
                      backgroundColor: '#ede9fe', color: '#6d28d9', border: '1px solid #ddd6fe',
                    }}
                  />
                ))}
              </Box>
            </Box>
          )
        })()}
      </Box>

      {/* Candidates Section Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
        <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
          Candidates
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {!candidatesLoading && candidates.length > 0 && (
            <>
              <TextField
                placeholder="Search..."
                value={candidateSearch}
                onChange={(e) => { setCandidateSearch(e.target.value); setCurrentPage(1) }}
                size="small"
                sx={{
                  width: 180,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '8px', height: '34px', fontSize: '12px',
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    '& fieldset': { border: 'none' },
                    '&:hover': { background: '#f1f5f9' },
                    '&.Mui-focused': { background: '#fff', border: '1px solid #020291' }
                  }
                }}
                InputProps={{
                  startAdornment: <i className="fas fa-search" style={{ marginRight: 6, fontSize: 11, color: '#94a3b8' }}></i>
                }}
              />
              <TextField
                select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
                size="small"
                sx={{
                  width: 140,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '8px', height: '34px', fontSize: '12px',
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    '& fieldset': { border: 'none' },
                    '&:hover': { background: '#f1f5f9' },
                    '&.Mui-focused': { background: '#fff', border: '1px solid #020291' }
                  }
                }}
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="Applied">Applied</MenuItem>
                <MenuItem value="Added by Recruiter">Added by Recruiter</MenuItem>
                <MenuItem value="Questions Generated">Questions Generated</MenuItem>
                <MenuItem value="Interview Scheduled">Interview Scheduled</MenuItem>
                <MenuItem value="Interview Completed">Interview Completed</MenuItem>
                <MenuItem value="Offer Sent">Offer Sent</MenuItem>
                <MenuItem value="Offer Declined">Offer Declined</MenuItem>
                <MenuItem value="Hired">Hired</MenuItem>
                <MenuItem value="Rejected">Rejected</MenuItem>
              </TextField>
            </>
          )}
          {(user?.role === 'recruiter' || user?.role === 'admin') && (
            <Button
              onClick={() => setAddDialogOpen(true)}
              sx={{
                background: '#020291', color: 'white', borderRadius: '8px',
                textTransform: 'none', fontWeight: 600, fontSize: '12px', px: 2, height: '34px',
                '&:hover': { background: '#06109E' }
              }}
            >
              <i className="fas fa-plus" style={{ marginRight: 5, fontSize: 10 }}></i> Add candidate
            </Button>
          )}
        </Box>
      </Box>

      {/* Candidate List */}
      {candidatesLoading ? (
        <Box sx={{ textAlign: 'center', py: 4, color: '#64748b' }}>Loading candidates...</Box>
      ) : candidates.length === 0 ? (
        <Box sx={{
          textAlign: 'center', py: 6, borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff'
        }}>
          <i className="fas fa-users" style={{ fontSize: 32, color: '#cbd5e1', marginBottom: 12 }}></i>
          <Typography sx={{ fontSize: '15px', color: '#64748b', mb: 1 }}>No candidates yet</Typography>
          <Typography sx={{ fontSize: '13px', color: '#94a3b8' }}>Add candidates to get started</Typography>
        </Box>
      ) : (() => {
        const filtered = candidates.filter((c: any) => {
          const search = candidateSearch.toLowerCase()
          const matchesSearch = !search || (c.applicant_name || '').toLowerCase().includes(search) || (c.applicant_email || '').toLowerCase().includes(search)
          const matchesStatus = statusFilter === 'all' || (c.status || 'Applied') === statusFilter
          return matchesSearch && matchesStatus
        })
        const totalPages = Math.ceil(filtered.length / itemsPerPage)
        const paginatedCandidates = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
        if (filtered.length === 0) return (
          <Box sx={{ textAlign: 'center', py: 5, borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff' }}>
            <i className="fas fa-search" style={{ fontSize: 28, color: '#cbd5e1', marginBottom: 10 }}></i>
            <Typography sx={{ fontSize: '14px', color: '#64748b' }}>No candidates match your search</Typography>
          </Box>
        )
        return (
          <>
            <Box sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', overflow: 'hidden' }}>
              <Box sx={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>Candidate</th>
                      <th style={{ textAlign: 'center', padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>Experience</th>
                      <th style={{ textAlign: 'center', padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>Recruiter</th>
                      <th style={{ textAlign: 'center', padding: '12px 16px', color: '#64748b', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCandidates.map((candidate: any) => {
                      const hasQuestions = !!candidateQuestionSets[candidate.id]
                      const questionSetId = candidateQuestionSets[candidate.id]
                      const isGenerating = generatingQuestions[candidate.id]
                      return (
                        <tr
                          key={candidate.id}
                          style={{ borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '12px 16px' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Avatar sx={{
                                width: 32, height: 32, fontSize: '13px', fontWeight: 700,
                                background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)', color: '#475569'
                              }}>
                                {(candidate.applicant_name || 'U').charAt(0).toUpperCase()}
                              </Avatar>
                              <Box>
                                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>
                                  {candidate.applicant_name}
                                </Typography>
                                <Typography sx={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                                  {candidate.applicant_email}
                                </Typography>
                              </Box>
                            </Box>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                              {candidate.experience_years ? `${candidate.experience_years} yrs` : '-'}
                            </Typography>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <Chip
                              label={candidate.status || 'Applied'}
                              size="small"
                              sx={{
                                fontSize: '11px', fontWeight: 600, height: '22px',
                                backgroundColor: getStatusColor(candidate.status || 'Applied').bg,
                                color: getStatusColor(candidate.status || 'Applied').color,
                              }}
                            />
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <Typography sx={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                              {candidate.recruiter_name || '-'}
                            </Typography>
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', flexWrap: 'nowrap' }}>
                              {(() => {
                                const st = candidate.status || 'Applied'
                                const btnSx = (borderColor: string, color: string, hoverBg: string) => ({
                                  textTransform: 'none' as const, fontSize: '11px', fontWeight: 600,
                                  borderRadius: '6px', px: 1.2, height: '28px', minWidth: 0,
                                  borderColor, color,
                                  '&:hover': { background: hoverBg, color: '#fff', borderColor }
                                })

                                if (st === 'Offer Sent' || st === 'Offer Declined' || st === 'Hired' || st === 'Rejected') {
                                  return (
                                    <Typography sx={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                                      {st === 'Offer Sent' ? 'Awaiting response' : st === 'Hired' ? 'Onboarding' : st === 'Offer Declined' ? 'Offer declined' : 'Closed'}
                                    </Typography>
                                  )
                                }

                                if (st === 'Interview Completed') {
                                  return (
                                    <>
                                      <Button onClick={() => handleSendOffer(candidate.id)} size="small" variant="outlined" sx={btnSx('#2563eb', '#2563eb', '#2563eb')}>
                                        <i className="fas fa-paper-plane" style={{ marginRight: 4, fontSize: 10 }}></i>Send Offer
                                      </Button>
                                      <Button onClick={() => handleUpdateStatus(candidate.id, 'Rejected')} size="small" variant="outlined" sx={btnSx('#dc2626', '#dc2626', '#dc2626')}>
                                        <i className="fas fa-times" style={{ marginRight: 4, fontSize: 10 }}></i>Reject
                                      </Button>
                                    </>
                                  )
                                }

                                if (hasQuestions || st === 'Questions Generated' || st === 'Interview Scheduled') {
                                  return (
                                    <>
                                      <Button onClick={() => navigate(`/interview-outline/${questionSetId}?jobId=${selectedJob.id}&jobTitle=${encodeURIComponent(selectedJob.title)}`)} size="small" variant="outlined" sx={btnSx('#020291', '#020291', '#020291')}>
                                        <i className="fas fa-eye" style={{ marginRight: 4, fontSize: 10 }}></i>Review
                                      </Button>
                                      {candidateVideoIds[candidate.id] && (
                                        <Button onClick={() => navigate(`/video-room/${candidateVideoIds[candidate.id]}`)} size="small" variant="outlined" sx={btnSx('#7c3aed', '#7c3aed', '#7c3aed')}>
                                          <i className="fas fa-video" style={{ marginRight: 4, fontSize: 10 }}></i>Start Interview
                                        </Button>
                                      )}
                                    </>
                                  )
                                }

                                return (
                                  <Button
                                    onClick={() => handleGenerateQuestions(candidate.id)}
                                    disabled={isGenerating}
                                    size="small" variant="outlined"
                                    sx={{ ...btnSx('#020291', '#020291', '#020291'), '&:disabled': { opacity: 0.5 } }}
                                  >
                                    {isGenerating ? (
                                      <CircularProgress size={12} sx={{ color: '#020291' }} />
                                    ) : (
                                      <><i className="fas fa-magic" style={{ marginRight: 4, fontSize: 10 }}></i>Generate</>
                                    )}
                                  </Button>
                                )
                              })()}
                            </Box>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Box>
            </Box>

            {totalPages > 1 && (
              <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                mt: 2, p: '12px 16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0'
              }}>
                <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                  Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} candidates
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                    sx={{
                      minWidth: '36px', height: '36px', borderRadius: '8px', p: 0,
                      color: '#64748b', border: '1px solid #e2e8f0', background: '#fff',
                      '&:hover': { borderColor: '#020291', color: '#020291' },
                      '&:disabled': { opacity: 0.4 }
                    }}
                  >
                    <i className="fas fa-chevron-left" style={{ fontSize: 12 }} />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <Button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      sx={{
                        minWidth: '36px', height: '36px', borderRadius: '8px', p: 0,
                        fontWeight: 600, fontSize: '13px',
                        background: page === currentPage ? '#020291' : '#fff',
                        color: page === currentPage ? '#fff' : '#64748b',
                        border: `1px solid ${page === currentPage ? '#020291' : '#e2e8f0'}`,
                        '&:hover': { borderColor: '#020291', background: page === currentPage ? '#06109E' : '#EEF0FF' }
                      }}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                    sx={{
                      minWidth: '36px', height: '36px', borderRadius: '8px', p: 0,
                      color: '#64748b', border: '1px solid #e2e8f0', background: '#fff',
                      '&:hover': { borderColor: '#020291', color: '#020291' },
                      '&:disabled': { opacity: 0.4 }
                    }}
                  >
                    <i className="fas fa-chevron-right" style={{ fontSize: 12 }} />
                  </Button>
                </Box>
              </Box>
            )}
          </>
        )
      })()}

      </Box>{/* End Left Column */}

      {/* Right Column - Similar Candidates */}
      <Box sx={{
        width: { xs: '100%', md: 300 }, flexShrink: 0,
        display: { xs: 'none', md: 'block' }
      }}>
        <Box sx={{
          p: '16px', borderRadius: '12px', border: '1px solid #e2e8f0',
          background: '#fff', position: 'sticky', top: 24
        }}>
          <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 24, height: 24, borderRadius: '6px', background: '#EEF0FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fas fa-user-friends" style={{ fontSize: 10, color: '#020291' }}></i>
            </Box>
            Similar Candidates
          </Typography>

          {similarCandidatesLoading ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CircularProgress size={20} sx={{ color: '#020291' }} />
            </Box>
          ) : similarCandidates.length === 0 ? (
            <Typography sx={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', py: 3 }}>
              No similar candidates found
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {similarCandidates.map((candidate: any) => (
                <Box
                  key={candidate.id}
                  onClick={() => navigate('/candidates')}
                  sx={{
                    p: '10px 12px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s',
                    border: '1px solid #f1f5f9', background: '#fafbfc',
                    '&:hover': { borderColor: '#020291', background: '#EEF0FF', transform: 'translateY(-1px)', boxShadow: '0 2px 6px rgba(2,2,145,0.06)' }
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{
                      width: 28, height: 28, fontSize: '11px', fontWeight: 700,
                      background: 'linear-gradient(135deg, #020291, #4f46e5)', color: '#fff', flexShrink: 0
                    }}>
                      {(candidate.name || 'U').charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {candidate.name}
                      </Typography>
                      <Typography sx={{ fontSize: '10px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {candidate.email}
                      </Typography>
                    </Box>
                    {candidate.experience && (
                      <Typography sx={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0, background: '#f1f5f9', borderRadius: '4px', px: 0.8, py: 0.2 }}>
                        {candidate.experience}
                      </Typography>
                    )}
                  </Box>
                  {candidate.skills?.length > 0 && (() => {
                    let jobSkillsLower: string[] = []
                    try {
                      const sr = selectedJob.skills_required
                      const reqs = selectedJob.requirements
                      const raw = Array.isArray(reqs) && reqs.length > 0 ? reqs : typeof sr === 'string' ? JSON.parse(sr) : Array.isArray(sr) ? sr : []
                      jobSkillsLower = raw.map((s: string) => s.toLowerCase())
                    } catch { /* ignore */ }
                    return (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, mt: 0.8, ml: '36px' }}>
                        {candidate.skills.slice(0, 4).map((skill: string, idx: number) => {
                          const isMatch = jobSkillsLower.some((js: string) => skill.toLowerCase().includes(js) || js.includes(skill.toLowerCase()))
                          return (
                            <Typography key={idx} sx={{
                              fontSize: '9px', fontWeight: isMatch ? 600 : 500, borderRadius: '3px', px: 0.7, py: 0.1,
                              color: isMatch ? '#16a34a' : '#64748b',
                              background: isMatch ? '#dcfce7' : '#f1f5f9',
                            }}>
                              {isMatch && <i className="fas fa-check" style={{ fontSize: 7, marginRight: 2 }}></i>}
                              {skill}
                            </Typography>
                          )
                        })}
                      </Box>
                    )
                  })()}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
      </Box>{/* End Two Column Layout */}

      {/* ─── Add Candidate Dialog ─── */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0', pb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#020291', color: 'white'
            }}>
              <i className="fas fa-user-plus" />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>Add Candidate</Typography>
              <Typography sx={{ fontSize: '13px', color: '#64748b' }}>Add a new candidate for this position</Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
            {/* Full Name + Email row */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
                  Full Name <span style={{ color: '#ef4444' }}>*</span>
                </Typography>
                <TextField fullWidth placeholder="Jane Smith" value={addForm.name}
                  onChange={e => handleAddFieldChange('name', e.target.value)}
                  onBlur={() => handleAddFieldBlur('name', addForm.name)}
                  error={addFormTouched.name && !!addFormErrors.name}
                  helperText={addFormTouched.name && addFormErrors.name}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
                  Email <span style={{ color: '#ef4444' }}>*</span>
                </Typography>
                <TextField fullWidth placeholder="jane@example.com" type="email" value={addForm.email}
                  onChange={e => handleAddFieldChange('email', e.target.value)}
                  onBlur={() => handleAddFieldBlur('email', addForm.email)}
                  error={addFormTouched.email && !!addFormErrors.email}
                  helperText={addFormTouched.email && addFormErrors.email}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
            </Box>

            {/* Resume Upload (required) */}
            <Box>
              <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
                Resume <span style={{ color: '#ef4444' }}>*</span>
              </Typography>
              <Box sx={{
                border: `2px dashed ${addFormTouched.resume && addFormErrors.resume ? '#ef4444' : '#cbd5e1'}`,
                borderRadius: '12px', p: 2.5, textAlign: 'center',
                background: addForm.resume ? '#f0fdf4' : addFormTouched.resume && addFormErrors.resume ? '#fef2f2' : '#f8fafc',
                cursor: 'pointer', transition: 'all 0.2s',
                '&:hover': { borderColor: addForm.resume ? '#16a34a' : '#020291', background: addForm.resume ? '#f0fdf4' : '#EEF0FF' }
              }}
                onClick={() => document.getElementById('resume-upload-detail')?.click()}>
                <input id="resume-upload-detail" type="file" hidden accept=".pdf,.doc,.docx,.txt"
                  onChange={e => {
                    const file = e.target.files?.[0] || null
                    setAddForm(prev => ({ ...prev, resume: file }))
                    setAddFormTouched(prev => ({ ...prev, resume: true }))
                    setAddFormErrors(prev => ({ ...prev, resume: file ? '' : 'Resume is required' }))
                  }} />
                {addForm.resume ? (
                  <Box>
                    <i className="fas fa-check-circle" style={{ fontSize: 22, color: '#16a34a', marginBottom: 6 }} />
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#16a34a' }}>{addForm.resume.name}</Typography>
                    <Typography sx={{ fontSize: '12px', color: '#64748b' }}>Click to change file</Typography>
                  </Box>
                ) : (
                  <Box>
                    <i className="fas fa-cloud-upload-alt" style={{ fontSize: 22, color: '#94a3b8', marginBottom: 6 }} />
                    <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#64748b' }}>Upload resume for personalized questions</Typography>
                    <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>.pdf, .docx, .txt</Typography>
                  </Box>
                )}
              </Box>
              {addFormTouched.resume && addFormErrors.resume && (
                <Typography sx={{ color: '#ef4444', fontSize: '12px', mt: '4px' }}>{addFormErrors.resume}</Typography>
              )}
              <Typography sx={{ fontSize: '12px', color: '#94a3b8', mt: '4px' }}>
                Required — AI uses this to generate hyper-personalized interview questions
              </Typography>
            </Box>

            {/* Optional Details Divider */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
              <Box sx={{ height: '1px', flex: 1, background: '#e2e8f0' }} />
              <Typography sx={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Optional Details
              </Typography>
              <Box sx={{ height: '1px', flex: 1, background: '#e2e8f0' }} />
            </Box>

            {/* Experience + Phone */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Experience (Years)</Typography>
                <TextField fullWidth placeholder="3" type="number" value={addForm.experience_years}
                  onChange={e => handleAddFieldChange('experience_years', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Phone Number</Typography>
                <TextField fullWidth placeholder="9876543210" value={addForm.phone}
                  onChange={e => handleAddFieldChange('phone', e.target.value)}
                  onBlur={() => handleAddFieldBlur('phone', addForm.phone)}
                  error={addFormTouched.phone && !!addFormErrors.phone}
                  helperText={addFormTouched.phone && addFormErrors.phone}
                  inputProps={{ maxLength: 10 }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
            </Box>

            {/* Location + LinkedIn */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Current Location</Typography>
                <TextField fullWidth placeholder="Bangalore, India" value={addForm.location}
                  onChange={e => handleAddFieldChange('location', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>LinkedIn</Typography>
                <TextField fullWidth placeholder="https://linkedin.com/in/janesmith" value={addForm.linkedin}
                  onChange={e => handleAddFieldChange('linkedin', e.target.value)}
                  onBlur={() => handleAddFieldBlur('linkedin', addForm.linkedin)}
                  error={addFormTouched.linkedin && !!addFormErrors.linkedin}
                  helperText={addFormTouched.linkedin && addFormErrors.linkedin}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
            </Box>

            {/* Notice Period + Current CTC */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Notice Period</Typography>
                <TextField fullWidth placeholder="30 days" value={addForm.notice_period}
                  onChange={e => handleAddFieldChange('notice_period', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Current CTC</Typography>
                <TextField fullWidth placeholder="12 LPA" value={addForm.current_ctc}
                  onChange={e => handleAddFieldChange('current_ctc', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
            </Box>

            {/* Expected CTC */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Expected CTC</Typography>
                <TextField fullWidth placeholder="18 LPA" value={addForm.expected_ctc}
                  onChange={e => handleAddFieldChange('expected_ctc', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
            </Box>

            {/* Interview Date & Duration */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Interview Date & Time</Typography>
                <TextField fullWidth type="datetime-local" value={addForm.interview_datetime}
                  onChange={e => handleAddFieldChange('interview_datetime', e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Duration</Typography>
                <TextField fullWidth select value={addForm.duration_minutes}
                  onChange={e => handleAddFieldChange('duration_minutes', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }}>
                  <MenuItem value="15">15 minutes (5 questions)</MenuItem>
                  <MenuItem value="30">30 minutes (10 questions)</MenuItem>
                  <MenuItem value="45">45 minutes (15 questions)</MenuItem>
                  <MenuItem value="60">60 minutes (20 questions)</MenuItem>
                </TextField>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setAddDialogOpen(false)} sx={{
            color: '#64748b', textTransform: 'none', px: 3, height: '40px', borderRadius: '10px',
            '&:hover': { background: '#f1f5f9' }
          }}>Cancel</Button>
          <Button onClick={handleAddCandidate} disabled={submitting}
            sx={{
              background: '#020291', color: 'white',
              borderRadius: '10px', textTransform: 'none', fontWeight: 600, px: 3, height: '40px',
              '&:hover': { background: '#06109E' },
              '&:disabled': { opacity: 0.6, color: 'white' }
            }}>
            {submitting ? <><CircularProgress size={16} sx={{ mr: 1, color: 'white' }} /> Adding...</> : <>Add candidate <i className="fas fa-arrow-right" style={{ marginLeft: 8, fontSize: 12 }} /></>}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Upload Transcript Dialog ─── */}
      <Dialog open={transcriptDialogOpen} onClose={() => !uploadingTranscript && setTranscriptDialogOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0', pb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#16a34a', color: 'white'
            }}>
              <i className="fas fa-file-alt" />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>Upload Transcript</Typography>
              <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                {transcriptCandidate?.applicant_name} — Paste the interview transcript below
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Box sx={{ mt: 1 }}>
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>
              Interview Transcript <span style={{ color: '#ef4444' }}>*</span>
            </Typography>
            <TextField
              multiline minRows={8} maxRows={16} fullWidth
              placeholder="Paste the full interview transcript here...&#10;&#10;Interviewer: Tell me about yourself.&#10;Candidate: I am a software developer with 3 years of experience..."
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px', fontSize: '14px',
                  '& fieldset': { borderColor: '#e2e8f0' },
                  '&:hover fieldset': { borderColor: '#020291' },
                  '&.Mui-focused fieldset': { borderColor: '#020291' },
                }
              }}
            />
            <Typography sx={{ fontSize: '12px', color: '#94a3b8', mt: '6px' }}>
              AI will analyze the transcript, score each answer, and generate a comprehensive report
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setTranscriptDialogOpen(false)} disabled={uploadingTranscript}
            sx={{
              color: '#64748b', textTransform: 'none', px: 3, height: '40px', borderRadius: '10px',
              '&:hover': { background: '#f1f5f9' }
            }}>Cancel</Button>
          <Button onClick={handleUploadTranscript} disabled={uploadingTranscript || !transcriptText.trim()}
            sx={{
              background: '#16a34a', color: 'white',
              borderRadius: '10px', textTransform: 'none', fontWeight: 600, px: 3, height: '40px',
              '&:hover': { background: '#15803d' },
              '&:disabled': { opacity: 0.6, color: 'white' }
            }}>
            {uploadingTranscript ? (
              <><CircularProgress size={16} sx={{ mr: 1, color: 'white' }} /> Scoring...</>
            ) : (
              <><i className="fas fa-upload" style={{ marginRight: 8, fontSize: 12 }} /> Upload & Score</>
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(prev => ({ ...prev, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setToast(prev => ({ ...prev, open: false }))} severity={toast.severity} sx={{ width: '100%' }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default JobDetails
