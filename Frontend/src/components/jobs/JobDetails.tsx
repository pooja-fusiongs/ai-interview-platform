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
  CircularProgress,
  Tooltip,
  Skeleton
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
        <Typography sx={{ fontSize: '14px', color: '#64748b', lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
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
  const [candidateQuestionSets, setCandidateQuestionSets] = useState<Record<number, string>>({})
  const [candidateVideoIds, setCandidateVideoIds] = useState<Record<number, number>>({})
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false)
  const [transcriptCandidate, setTranscriptCandidate] = useState<any>(null)
  const [transcriptText, setTranscriptText] = useState('')
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [schedulingCandidate, setSchedulingCandidate] = useState<any>(null)
  const [scheduleForm, setScheduleForm] = useState({ date: '', time: '', duration_minutes: '30' })
  const [scheduling, setScheduling] = useState(false)
  const [uploadingTranscript, setUploadingTranscript] = useState(false)

  // Add candidate dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addMode, setAddMode] = useState<'choose' | 'new' | 'existing'>('choose')
  const [existingSearch, setExistingSearch] = useState('')
  const [existingResults, setExistingResults] = useState<any[]>([])
  const [existingLoading, setExistingLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '', email: '', phone: '', location: '', linkedin: '',
    notice_period: '', current_ctc: '', expected_ctc: '',
    experience_years: '',
    resume: null as File | null
  })
  const [addFormErrors, setAddFormErrors] = useState<Record<string, string>>({})
  const [addFormTouched, setAddFormTouched] = useState<Record<string, boolean>>({})

  const navigate = useNavigate()
  const { user } = useAuth()

  // Fetch candidates + question sets + video interviews all at once
  const fetchCandidates = async () => {
    if (!selectedJob?.id) return
    try {
      setCandidatesLoading(true)
      const [candidateRes, qsRes, viRes] = await Promise.all([
        apiClient.get(`/api/job/${selectedJob.id}/applications`),
        apiClient.get('/api/interview/question-sets'),
        apiClient.get('/api/video/interviews')
      ])

      const fetchedCandidates = candidateRes.data?.applications || []
      setCandidates(fetchedCandidates)

      // Map question sets
      const sets = qsRes.data || []
      const qMapping: Record<number, string> = {}
      for (const qs of sets) {
        if (qs.job_id === selectedJob.id && qs.application_id) {
          qMapping[qs.application_id] = qs.id
        }
      }
      setCandidateQuestionSets(qMapping)

      // Map video interviews
      const interviews = viRes.data || []
      const vMapping: Record<number, number> = {}
      for (const vi of interviews) {
        if (vi.job_id === selectedJob.id) {
          // Match by application_id first (most reliable), then fallback to email
          let matched = vi.application_id ? fetchedCandidates.find((c: any) => c.id === vi.application_id) : null
          if (!matched && vi.candidate_email) {
            matched = fetchedCandidates.find((c: any) =>
              c.applicant_email?.toLowerCase() === vi.candidate_email.toLowerCase()
            )
          }
          if (matched) vMapping[matched.id] = vi.id
        }
      }
      setCandidateVideoIds(vMapping)
    } catch (error) {
      console.error('Error fetching candidates:', error)
    } finally {
      setCandidatesLoading(false)
    }
  }

  useEffect(() => {
    fetchCandidates()
  }, [selectedJob?.id])

  // Generate questions for a candidate


  const handleScheduleInterview = async () => {
    if (!schedulingCandidate || !selectedJob) return
    if (!scheduleForm.date || !scheduleForm.time) {
      hotToast.error('Please select date and time')
      return
    }
    setScheduling(true)
    try {
      const scheduledAt = `${scheduleForm.date}T${scheduleForm.time}:00`
      const result = await recruiterService.scheduleInterview(selectedJob.id, schedulingCandidate.id, scheduledAt, parseInt(scheduleForm.duration_minutes))
      hotToast.success('Interview scheduled! Questions generated and email sent to candidate.', { duration: 4000 })
      setScheduleDialogOpen(false)
      setSchedulingCandidate(null)
      setScheduleForm({ date: '', time: '', duration_minutes: '30' })
      // Refresh question sets and video IDs
      const response = await apiClient.get('/api/interview/question-sets')
      const sets = response.data || []
      const mapping: Record<number, string> = { ...candidateQuestionSets }
      for (const qs of sets) {
        if (qs.job_id === selectedJob.id && qs.application_id) {
          mapping[qs.application_id] = qs.id
        }
      }
      setCandidateQuestionSets(mapping)
      try {
        const viRes = await apiClient.get('/api/video/interviews')
        const interviews = viRes.data || []
        const vMapping: Record<number, number> = { ...candidateVideoIds }
        for (const vi of interviews) {
          if (vi.job_id === selectedJob.id) {
            let matched = vi.application_id ? candidates.find((c: any) => c.id === vi.application_id) : null
            if (!matched && vi.candidate_email) {
              matched = candidates.find((c: any) =>
                c.applicant_email?.toLowerCase() === vi.candidate_email.toLowerCase()
              )
            }
            if (matched) vMapping[matched.id] = vi.id
          }
        }
        if (result.id) vMapping[schedulingCandidate.id] = result.id
        setCandidateVideoIds(vMapping)
      } catch (e) { console.error('Failed to refetch video interviews:', e) }
      setCandidates((prev: any[]) => prev.map(c => c.id === schedulingCandidate.id ? { ...c, status: 'Interview Scheduled' } : c))
    } catch (err: any) {
      hotToast.error(err.response?.data?.detail || 'Failed to schedule interview')
    } finally {
      setScheduling(false)
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

        // --- Parse job skills ---
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
        // If no skills defined, extract keywords from job description/title
        if (jobSkills.length === 0 && selectedJob.description) {
          const desc = (selectedJob.description || '').toLowerCase()
          const commonKeywords = ['python', 'java', 'javascript', 'react', 'node', 'sql', 'aws', 'azure', 'docker',
            'kubernetes', 'machine learning', 'data science', 'analytics', 'statistics', 'tensorflow', 'pytorch',
            'excel', 'tableau', 'power bi', 'r', 'scala', 'spark', 'hadoop', 'mongodb', 'postgresql', 'mysql',
            'html', 'css', 'typescript', 'angular', 'vue', 'django', 'flask', 'spring', 'git', 'linux',
            'c++', 'c#', '.net', 'php', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'figma', 'photoshop',
            'salesforce', 'sap', 'jira', 'agile', 'scrum', 'devops', 'ci/cd', 'api', 'rest', 'graphql',
            'deep learning', 'nlp', 'computer vision', 'data analysis', 'data modeling', 'etl', 'data warehouse',
            'communication', 'leadership', 'project management', 'problem solving', 'teamwork']
          jobSkills = commonKeywords.filter(kw => desc.includes(kw))
        }
        const jobSkillsLower = jobSkills.map(s => s.toLowerCase())
        const jobTitle = (selectedJob.title || '').toLowerCase()
        const jobCategory = (selectedJob.category || selectedJob.department || '').toLowerCase()
        // --- Parse job experience requirement ---
        const jobExpStr = selectedJob.experience_level || selectedJob.experienceLevel || ''
        const jobExpMatch = jobExpStr.match(/(\d+)/)
        const jobExpYears = jobExpMatch ? parseInt(jobExpMatch[1]) : 0

        const titleWords = jobTitle.split(' ').filter((w: string) => w.length > 2)

        console.log('[SimilarCandidates] Job:', selectedJob.title, '| jobSkills:', jobSkills, '| jobExpYears:', jobExpYears, '| jobCategory:', jobCategory)
        console.log('[SimilarCandidates] Total candidates fetched:', allCandidates.length)

        const scored = allCandidates
          .filter((c: any) => !currentEmails.includes(c.email?.toLowerCase()) && c.is_active !== false)
          .map((c: any) => {
            // --- 1. Skills match (0-100) weight: 35% ---
            const cSkills = (c.skills || []).map((s: string) => s.toLowerCase())
            const matchedSkillsList = cSkills.filter((s: string) => jobSkillsLower.some(js => s.includes(js) || js.includes(s)))
            let skillScore = 0
            if (jobSkillsLower.length > 0 && cSkills.length > 0) {
              skillScore = Math.min(100, Math.round((matchedSkillsList.length / jobSkillsLower.length) * 100))
            }

            // --- 2. Position/title relevance (0-100) weight: 25% ---
            const candidatePos = (c.currentPosition || '').toLowerCase()
            let titleScore = 0
            if (titleWords.length > 0 && candidatePos) {
              const posWords = candidatePos.split(/[\s,\-\/]+/).filter((w: string) => w.length > 2)
              const matchedTitleWords = titleWords.filter((tw: string) =>
                posWords.some((pw: string) => pw.includes(tw) || tw.includes(pw))
              )
              titleScore = Math.round((matchedTitleWords.length / titleWords.length) * 100)
              if (candidatePos.includes(jobTitle) || jobTitle.includes(candidatePos)) {
                titleScore = Math.min(100, titleScore + 30)
              }
            }

            // --- 3. Applied to similar roles (0-100) weight: 20% ---
            let roleScore = 0
            const appliedJobs = c.appliedJobs || []
            if (appliedJobs.length > 0 && titleWords.length > 0) {
              let bestJobMatch = 0
              for (const aj of appliedJobs) {
                const ajTitle = (aj.title || '').toLowerCase()
                const ajWords = ajTitle.split(/[\s,\-\/]+/).filter((w: string) => w.length > 2)
                const matched = titleWords.filter((tw: string) =>
                  ajWords.some((aw: string) => aw.includes(tw) || tw.includes(aw))
                ).length
                const pct = titleWords.length > 0 ? Math.round((matched / titleWords.length) * 100) : 0
                if (pct > bestJobMatch) bestJobMatch = pct
              }
              roleScore = bestJobMatch
            }

            // --- 4. Experience fit (0-100) weight: 15% ---
            let expScore = 0
            const expStr = c.experience || ''
            const expMatch = expStr.match(/(\d+)/)
            const candExpYears = expMatch ? parseInt(expMatch[1]) : 0
            if (candExpYears > 0) {
              if (jobExpYears > 0) {
                const diff = Math.abs(candExpYears - jobExpYears)
                if (diff === 0) expScore = 100
                else if (diff <= 2) expScore = 85
                else if (diff <= 5) expScore = 65
                else if (diff <= 10) expScore = 40
                else expScore = 20
                if (candExpYears >= jobExpYears && expScore < 100) expScore = Math.min(100, expScore + 10)
              } else {
                expScore = candExpYears >= 5 ? 70 : candExpYears >= 3 ? 55 : candExpYears >= 1 ? 35 : 15
              }
            }

            // --- 5. Department/company match (0-100) weight: 5% ---
            let deptScore = 0
            const candDept = (c.department || '').toLowerCase()
            if (jobCategory && candDept) {
              if (candDept.includes(jobCategory) || jobCategory.includes(candDept)) {
                deptScore = 100
              }
            }

            // --- Weighted composite ---
            const _matchPercent = Math.round(
              (skillScore * 0.35) + (titleScore * 0.25) + (roleScore * 0.20) + (expScore * 0.15) + (deptScore * 0.05)
            )
            const _score = _matchPercent

            const _matchedSkills = (c.skills || []).filter((s: string) =>
              jobSkillsLower.some((js: string) => s.toLowerCase().includes(js) || js.includes(s.toLowerCase()))
            )

            console.log(`[SimilarCandidates] ${c.name}: skills=${skillScore} title=${titleScore} role=${roleScore} exp=${expScore} dept=${deptScore} => ${_matchPercent}% | candidateSkills=${JSON.stringify(cSkills)} | position="${candidatePos}" | exp="${expStr}" | appliedJobs=${appliedJobs.map((j:any)=>j.title).join(',')}`)

            return { ...c, _score, _matchPercent, _matchedSkills }
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
        resume: null
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

  // Fetch existing candidates (all or filtered by search)
  const fetchExistingCandidates = async (query: string = '') => {
    setExistingLoading(true)
    try {
      const url = query.trim()
        ? `/api/candidates?search=${encodeURIComponent(query.trim())}&limit=20`
        : `/api/candidates?limit=20`
      const response = await apiClient.get(url)
      if (response.data?.success && response.data.data) {
        // Filter out candidates already in this job
        const existingEmails = new Set(candidates.map((c: any) => c.applicant_email?.toLowerCase()))
        setExistingResults(response.data.data.filter((c: any) => !existingEmails.has(c.email?.toLowerCase())))
      }
    } catch {
      setExistingResults([])
    } finally {
      setExistingLoading(false)
    }
  }

  // Search existing candidates for "Add Existing" flow
  const handleSearchExisting = async (query: string) => {
    setExistingSearch(query)
    fetchExistingCandidates(query)
  }

  // Add existing candidate to this job
  const handleAddExistingCandidate = async (candidateEmail: string) => {
    setSubmitting(true)
    try {
      await apiClient.post(`/api/recruiter/job/${selectedJob.id}/add-existing-candidate`, {
        candidate_email: candidateEmail,
      })
      hotToast.success('Candidate added successfully')
      setAddDialogOpen(false)
      setAddMode('choose')
      setExistingSearch('')
      setExistingResults([])
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
    <Box sx={{ width: '100%', py: { xs: 2, md: 4 }, px: { xs: 1, sm: 2, md: 3 }, overflowX: 'hidden' }}>
      {/* Responsive helper: hide Recruiter column on md (960-1199px) screens */}
      <style>{`
        @media (min-width: 960px) and (max-width: 1199px) {
          .hide-on-md { display: none !important; }
          .btn-label-md { display: none !important; }
          .job-action-btn { padding-left: 6px !important; padding-right: 6px !important; min-width: 28px !important; }
        }
      `}</style>
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

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 2, md: 2, lg: 3 }, alignItems: 'flex-start', maxWidth: '100%' }}>
      {/* Left Column - Job Card + Candidates */}
      <Box sx={{ flex: 1, minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}>

      {/* Job Summary Card */}
      <Box sx={{
        p: { xs: '16px', md: '24px' },
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        background: '#fff',
        mb: 3,
      }}>
        {/* Title + Status + Edit */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
            <Typography sx={{ fontSize: { xs: '18px', sm: '20px', md: '24px' }, fontWeight: 700, color: '#1e293b', wordBreak: 'break-word' }}>
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
      </Box>{/* End Job Summary Card */}

      {/* Mobile Similar Candidates - shown only on xs, hidden on md+ where right column shows */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 2 }}>
        <Box sx={{
          borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff',
          overflow: 'hidden',
        }}>
          <Box sx={{
            px: 2, py: 1.5,
            background: 'linear-gradient(135deg, #f8faff 0%, #eef0ff 100%)',
            borderBottom: '1px solid #e8eaf6',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                width: 28, height: 28, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#020291', color: '#fff', fontSize: '12px'
              }}>
                <i className="fas fa-user-friends" />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>
                  Similar Candidates
                </Typography>
                <Typography sx={{ fontSize: '10px', color: '#94a3b8' }}>Based on required skills</Typography>
              </Box>
            </Box>
            {similarCandidates.length > 0 && (
              <Chip label={similarCandidates.length} size="small" sx={{
                height: 22, fontSize: '11px', fontWeight: 700,
                background: '#020291', color: '#fff',
              }} />
            )}
          </Box>
          <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {similarCandidatesLoading ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <CircularProgress size={24} sx={{ color: '#020291' }} />
              </Box>
            ) : similarCandidates.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>No similar candidates found</Typography>
              </Box>
            ) : (
              similarCandidates.map((candidate: any) => {
                const matchPercent = candidate._matchPercent || 0
                return (
                  <Box
                    key={candidate.id}
                    onClick={() => navigate('/candidates')}
                    sx={{
                      p: '10px', borderRadius: '10px', cursor: 'pointer',
                      border: '1px solid #f1f5f9', background: '#fafbfc',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{
                        width: 32, height: 32, fontSize: '12px', fontWeight: 700,
                        background: 'linear-gradient(135deg, #020291, #4f46e5)', color: '#fff', flexShrink: 0
                      }}>
                        {(candidate.name || 'U').charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candidate.name}
                        </Typography>
                        <Typography sx={{ fontSize: '10px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candidate.email}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: '10px', fontWeight: 600, color: matchPercent >= 70 ? '#059669' : matchPercent >= 40 ? '#eab308' : '#dc2626', flexShrink: 0 }}>
                        {matchPercent}%
                      </Typography>
                    </Box>
                  </Box>
                )
              })
            )}
          </Box>
        </Box>
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
          <IconButton
            onClick={fetchCandidates}
            size="small"
            sx={{
              color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px',
              width: '34px', height: '34px',
              '&:hover': { background: '#f1f5f9', color: '#020291', borderColor: '#020291' }
            }}
          >
            <i className="fas fa-sync-alt" style={{ fontSize: 12 }}></i>
          </IconButton>
          {(user?.role === 'recruiter' || user?.role === 'admin') && (
            <Tooltip title={selectedJob?.status === 'Closed' ? 'Cannot add candidates to a closed job' : ''}>
              <span>
                <Button
                  onClick={() => { setAddMode('choose'); setAddDialogOpen(true) }}
                  disabled={selectedJob?.status === 'Closed'}
                  sx={{
                    background: selectedJob?.status === 'Closed' ? '#94a3b8' : '#020291', color: 'white', borderRadius: '8px',
                    textTransform: 'none', fontWeight: 600, fontSize: '12px', px: 2, height: '34px',
                    '&:hover': { background: selectedJob?.status === 'Closed' ? '#94a3b8' : '#06109E' },
                    '&.Mui-disabled': { color: 'rgba(255,255,255,0.7)', background: '#94a3b8' },
                  }}
                >
                  <i className="fas fa-plus" style={{ marginRight: 5, fontSize: 10 }}></i> Add candidate
                </Button>
              </span>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Candidate List */}
      {candidatesLoading ? (
        <Box sx={{ p: 2 }}>
          {[1, 2, 3].map(i => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, borderBottom: '1px solid #f1f5f9' }}>
              <Skeleton variant="circular" width={36} height={36} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="40%" height={20} />
                <Skeleton variant="text" width="25%" height={16} />
              </Box>
              <Skeleton variant="text" width="10%" height={16} />
              <Skeleton variant="rounded" width={90} height={28} sx={{ borderRadius: '6px' }} />
              <Skeleton variant="text" width="15%" height={16} />
              <Skeleton variant="rounded" width={80} height={30} sx={{ borderRadius: '8px' }} />
            </Box>
          ))}
        </Box>
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
            <Box sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', display: { xs: 'none', sm: 'block' } }}>
              <Box sx={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>Candidate</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#64748b', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>Experience</th>
                      <th style={{ textAlign: 'center', padding: '10px 8px', color: '#64748b', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>Status</th>
                      <th className="hide-on-md" style={{ textAlign: 'left', padding: '10px 8px', color: '#64748b', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>Recruiter</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', color: '#64748b', fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCandidates.map((candidate: any) => {
                      const hasQuestions = !!candidateQuestionSets[candidate.id]
                      const questionSetId = candidateQuestionSets[candidate.id]
                      return (
                        <tr
                          key={candidate.id}
                          style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                          onClick={(e) => {
                            // Don't navigate if clicking a button or action element
                            if ((e.target as HTMLElement).closest('button, .job-action-btn, .MuiChip-root')) return
                            navigate(`/candidates?search=${encodeURIComponent(candidate.applicant_email)}`)
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '10px 12px' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar sx={{
                                width: 30, height: 30, fontSize: '12px', fontWeight: 700,
                                background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)', color: '#475569'
                              }}>
                                {(candidate.applicant_name || 'U').charAt(0).toUpperCase()}
                              </Avatar>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  onClick={() => navigate(`/candidates?search=${encodeURIComponent(candidate.applicant_email)}`)}
                                  sx={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: { sm: '140px', md: '120px', lg: '140px' }, cursor: 'pointer', '&:hover': { color: '#020291', textDecoration: 'underline' } }}>
                                  {candidate.applicant_name}
                                </Typography>
                                <Typography sx={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: { sm: '140px', md: '120px', lg: '140px' } }}>
                                  {candidate.applicant_email}
                                </Typography>
                              </Box>
                            </Box>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                              {candidate.experience_years ? `${candidate.experience_years} yrs` : '-'}
                            </Typography>
                          </td>
                          <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <Chip
                              label={candidate.status || 'Applied'}
                              size="small"
                              sx={{
                                fontSize: '10px', fontWeight: 600, height: '22px',
                                backgroundColor: getStatusColor(candidate.status || 'Applied').bg,
                                color: getStatusColor(candidate.status || 'Applied').color,
                              }}
                            />
                          </td>
                          <td className="hide-on-md" style={{ padding: '10px 8px' }}>
                            <Typography sx={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
                              {candidate.recruiter_name || '-'}
                            </Typography>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', flexWrap: 'nowrap' }}>
                              {(() => {
                                const st = candidate.status || 'Applied'
                                const btnSx = (borderColor: string, color: string, hoverBg: string) => ({
                                  textTransform: 'none' as const, fontSize: '11px', fontWeight: 600,
                                  borderRadius: '6px', px: 1.2, height: '28px', minWidth: 0,
                                  whiteSpace: 'nowrap' as const,
                                  borderColor, color,
                                  '&:hover': { background: hoverBg, color: '#fff', borderColor }
                                })

                                if (st === 'Offer Sent' || st === 'Offer Declined' || st === 'Hired' || st === 'Rejected') {
                                  const actionLabel = st === 'Offer Sent' ? 'Awaiting' : st === 'Hired' ? 'Onboarding' : st === 'Offer Declined' ? 'Declined' : 'Closed'
                                  const actionColors: Record<string, { bg: string; color: string; icon: string }> = {
                                    'Offer Sent': { bg: '#eff6ff', color: '#2563eb', icon: 'fas fa-clock' },
                                    'Hired': { bg: '#ecfdf5', color: '#059669', icon: 'fas fa-user-check' },
                                    'Offer Declined': { bg: '#fef2f2', color: '#dc2626', icon: 'fas fa-times-circle' },
                                    'Rejected': { bg: '#fef2f2', color: '#dc2626', icon: 'fas fa-ban' },
                                  }
                                  const ac = actionColors[st] || actionColors['Rejected']
                                  return (
                                    <Chip
                                      icon={<i className={ac.icon} style={{ fontSize: 10, color: ac.color, marginLeft: 8 }} />}
                                      label={actionLabel}
                                      size="small"
                                      sx={{
                                        fontSize: '11px', fontWeight: 600, height: '24px',
                                        backgroundColor: ac.bg, color: ac.color,
                                        border: 'none', '& .MuiChip-label': { px: 1 }
                                      }}
                                    />
                                  )
                                }

                                if (st === 'Interview Completed') {
                                  return (
                                    <>
                                      <Button className="job-action-btn" onClick={() => {
                                        const sessionId = candidateQuestionSets[candidate.id]
                                        if (sessionId) navigate(`/results?session=${sessionId}`)
                                        else hotToast.error('No results found for this candidate')
                                      }} size="small" variant="outlined" sx={btnSx('#020291', '#020291', '#020291')}>
                                        <i className="fas fa-download" style={{ fontSize: 10 }}></i><span className="btn-label-md" style={{ marginLeft: 4 }}>Report</span>
                                      </Button>
                                      <Button className="job-action-btn" onClick={() => handleSendOffer(candidate.id)} size="small" variant="outlined" sx={btnSx('#2563eb', '#2563eb', '#2563eb')}>
                                        <i className="fas fa-paper-plane" style={{ fontSize: 10 }}></i><span className="btn-label-md" style={{ marginLeft: 4 }}>Offer</span>
                                      </Button>
                                      <Button className="job-action-btn" onClick={() => handleUpdateStatus(candidate.id, 'Rejected')} size="small" variant="outlined" sx={btnSx('#dc2626', '#dc2626', '#dc2626')}>
                                        <i className="fas fa-times" style={{ fontSize: 10 }}></i><span className="btn-label-md" style={{ marginLeft: 4 }}>Reject</span>
                                      </Button>
                                    </>
                                  )
                                }

                                if (hasQuestions || st === 'Questions Generated' || st === 'Interview Scheduled') {
                                  return (
                                    <>
                                      <Button className="job-action-btn" onClick={() => navigate(`/interview-outline/${questionSetId}?jobId=${selectedJob.id}&jobTitle=${encodeURIComponent(selectedJob.title)}`)} size="small" variant="outlined" sx={btnSx('#020291', '#020291', '#020291')}>
                                        <i className="fas fa-eye" style={{ fontSize: 10 }}></i><span className="btn-label-md" style={{ marginLeft: 4 }}>Review</span>
                                      </Button>
                                      {candidateVideoIds[candidate.id] && (
                                        <Button className="job-action-btn" onClick={() => navigate(`/video-room/${candidateVideoIds[candidate.id]}`)} size="small" variant="outlined" sx={btnSx('#7c3aed', '#7c3aed', '#7c3aed')}>
                                          <i className="fas fa-video" style={{ fontSize: 10 }}></i><span className="btn-label-md" style={{ marginLeft: 4 }}>Interview</span>
                                        </Button>
                                      )}
                                    </>
                                  )
                                }

                                return (
                                  <Button
                                    className="job-action-btn"
                                    onClick={() => { setSchedulingCandidate(candidate); setScheduleDialogOpen(true) }}
                                    size="small" variant="outlined"
                                    sx={btnSx('#020291', '#020291', '#020291')}
                                  >
                                    <i className="fas fa-calendar-plus" style={{ fontSize: 10 }}></i><span className="btn-label-md" style={{ marginLeft: 4 }}>Schedule</span>
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

            {/* Mobile Card View */}
            <Box sx={{ display: { xs: 'flex', sm: 'none' }, flexDirection: 'column', gap: 1.5 }}>
              {paginatedCandidates.map((candidate: any) => {
                const hasQuestions = !!candidateQuestionSets[candidate.id]
                const questionSetId = candidateQuestionSets[candidate.id]
                const st = candidate.status || 'Applied'
                const btnSx = (borderColor: string, color: string, hoverBg: string) => ({
                  textTransform: 'none' as const, fontSize: '11px', fontWeight: 600,
                  borderRadius: '6px', px: 1.2, height: '28px', minWidth: 0,
                  borderColor, color,
                  '&:hover': { background: hoverBg, color: '#fff', borderColor }
                })
                return (
                  <Box key={candidate.id} sx={{ borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff', p: 1.5, cursor: 'pointer', '&:hover': { borderColor: '#cbd5e1', background: '#f8fafc' } }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button, .MuiChip-root')) return
                      navigate(`/candidates?search=${encodeURIComponent(candidate.applicant_email)}`)
                    }}>
                    {/* Row 1: Avatar + Name + Status */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Avatar sx={{
                        width: 32, height: 32, fontSize: '13px', fontWeight: 700,
                        background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)', color: '#475569'
                      }}>
                        {(candidate.applicant_name || 'U').charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          onClick={() => navigate(`/candidates?search=${encodeURIComponent(candidate.applicant_email)}`)}
                          sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer', '&:hover': { color: '#020291', textDecoration: 'underline' } }}>
                          {candidate.applicant_name}
                        </Typography>
                        <Typography sx={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candidate.applicant_email}
                        </Typography>
                      </Box>
                      <Chip
                        label={st}
                        size="small"
                        sx={{
                          fontSize: '10px', fontWeight: 600, height: '20px', flexShrink: 0,
                          backgroundColor: getStatusColor(st).bg,
                          color: getStatusColor(st).color,
                        }}
                      />
                    </Box>
                    {/* Row 2: Experience + Recruiter */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 1, pl: '44px' }}>
                      <Typography sx={{ fontSize: '11px', color: '#64748b' }}>
                        <i className="fas fa-briefcase" style={{ fontSize: 9, marginRight: 4 }} />
                        {candidate.experience_years ? `${candidate.experience_years} yrs` : '-'}
                      </Typography>
                      {candidate.recruiter_name && (
                        <Typography sx={{ fontSize: '11px', color: '#64748b' }}>
                          <i className="fas fa-user-tie" style={{ fontSize: 9, marginRight: 4 }} />
                          {candidate.recruiter_name}
                        </Typography>
                      )}
                    </Box>
                    {/* Row 3: Actions */}
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', pl: '44px' }}>
                      {(() => {
                        if (st === 'Offer Sent' || st === 'Offer Declined' || st === 'Hired' || st === 'Rejected') {
                          const actionLabel = st === 'Offer Sent' ? 'Awaiting response' : st === 'Hired' ? 'Onboarding' : st === 'Offer Declined' ? 'Offer declined' : 'Closed'
                          const actionColors: Record<string, { bg: string; color: string; icon: string }> = {
                            'Offer Sent': { bg: '#eff6ff', color: '#2563eb', icon: 'fas fa-clock' },
                            'Hired': { bg: '#ecfdf5', color: '#059669', icon: 'fas fa-user-check' },
                            'Offer Declined': { bg: '#fef2f2', color: '#dc2626', icon: 'fas fa-times-circle' },
                            'Rejected': { bg: '#fef2f2', color: '#dc2626', icon: 'fas fa-ban' },
                          }
                          const ac = actionColors[st] || actionColors['Rejected']
                          return (
                            <Chip
                              icon={<i className={ac.icon} style={{ fontSize: 10, color: ac.color, marginLeft: 8 }} />}
                              label={actionLabel}
                              size="small"
                              sx={{ fontSize: '10px', fontWeight: 600, height: '22px', backgroundColor: ac.bg, color: ac.color, border: 'none', '& .MuiChip-label': { px: 1 } }}
                            />
                          )
                        }
                        if (st === 'Interview Completed') {
                          return (
                            <>
                              <Button onClick={() => {
                                const sessionId = candidateQuestionSets[candidate.id]
                                if (sessionId) navigate(`/results?session=${sessionId}`)
                                else hotToast.error('No results found')
                              }} size="small" variant="outlined" sx={btnSx('#020291', '#020291', '#020291')}>
                                <i className="fas fa-download" style={{ marginRight: 4, fontSize: 10 }}></i>Report
                              </Button>
                              <Button onClick={() => handleSendOffer(candidate.id)} size="small" variant="outlined" sx={btnSx('#2563eb', '#2563eb', '#2563eb')}>
                                <i className="fas fa-paper-plane" style={{ marginRight: 4, fontSize: 10 }}></i>Offer
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
                                  <i className="fas fa-video" style={{ marginRight: 4, fontSize: 10 }}></i>Interview
                                </Button>
                              )}
                            </>
                          )
                        }
                        return (
                          <Button
                            onClick={() => { setSchedulingCandidate(candidate); setScheduleDialogOpen(true) }}
                            size="small" variant="outlined"
                            sx={btnSx('#020291', '#020291', '#020291')}
                          >
                            <i className="fas fa-calendar-plus" style={{ marginRight: 4, fontSize: 10 }}></i>Schedule
                          </Button>
                        )
                      })()}
                    </Box>
                  </Box>
                )
              })}
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
        width: { md: 220, lg: 300 }, flexShrink: 0,
        display: { xs: 'none', md: 'flex' }, flexDirection: 'column',
        alignSelf: 'flex-start',
      }}>
        <Box sx={{
          borderRadius: '16px', border: '1px solid #e2e8f0',
          background: '#fff', position: 'sticky', top: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 120px)',
        }}>
          {/* Header */}
          <Box sx={{
            px: 2, py: 1.5,
            background: 'linear-gradient(135deg, #f8faff 0%, #eef0ff 100%)',
            borderBottom: '1px solid #e8eaf6',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                width: 28, height: 28, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#020291', color: '#fff', fontSize: '12px'
              }}>
                <i className="fas fa-user-friends" />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>
                  Similar Candidates
                </Typography>
                <Typography sx={{ fontSize: '10px', color: '#94a3b8' }}>Based on required skills</Typography>
              </Box>
            </Box>
            {similarCandidates.length > 0 && (
              <Chip label={similarCandidates.length} size="small" sx={{
                height: 22, fontSize: '11px', fontWeight: 700,
                background: '#020291', color: '#fff',
              }} />
            )}
          </Box>
          {/* Body */}
          <Box sx={{ p: 1.5, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {similarCandidatesLoading ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <CircularProgress size={24} sx={{ color: '#020291' }} />
              </Box>
            ) : similarCandidates.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>No similar candidates found</Typography>
              </Box>
            ) : (
              similarCandidates.map((candidate: any) => {
                const matchPercent = candidate._matchPercent || 0
                const matchedSkills = candidate._matchedSkills || []

                return (
                  <Box
                    key={candidate.id}
                    onClick={() => navigate('/candidates')}
                    sx={{
                      p: '12px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s',
                      border: '1px solid #f1f5f9', background: '#fafbfc',
                      '&:hover': { borderColor: '#c7d2fe', background: '#f5f3ff', transform: 'translateY(-1px)', boxShadow: '0 4px 12px rgba(2,2,145,0.08)' }
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                      <Avatar sx={{
                        width: 36, height: 36, fontSize: '13px', fontWeight: 700,
                        background: 'linear-gradient(135deg, #020291, #4f46e5)', color: '#fff', flexShrink: 0
                      }}>
                        {(candidate.name || 'U').charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '12.5px', fontWeight: 600, color: '#1e293b', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candidate.name}
                        </Typography>
                        <Typography sx={{ fontSize: '10px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {candidate.email}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        {candidate.experience ? (
                          <Typography sx={{ fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>
                            {candidate.experience}
                          </Typography>
                        ) : (
                          <Typography sx={{ fontSize: '10px', color: '#94a3b8' }}>N/A</Typography>
                        )}
                      </Box>
                    </Box>
                    {/* Match bar */}
                    <Box sx={{ mt: 1 }}>
                      <Box sx={{ height: 4, borderRadius: 2, background: '#f1f5f9', overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', borderRadius: 2, width: `${matchPercent}%`, background: matchPercent >= 70 ? '#059669' : matchPercent >= 40 ? '#eab308' : '#dc2626', transition: 'width 0.5s' }} />
                      </Box>
                      <Typography sx={{ fontSize: '10px', fontWeight: 600, color: matchPercent >= 70 ? '#059669' : matchPercent >= 40 ? '#eab308' : '#dc2626', textAlign: 'right', mt: 0.3 }}>
                        {matchPercent}% match
                      </Typography>
                    </Box>
                    {matchedSkills.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {matchedSkills.slice(0, 4).map((skill: string, idx: number) => (
                          <Typography key={idx} sx={{
                            fontSize: '9px', px: 0.8, py: 0.2, borderRadius: '4px',
                            background: idx === 0 ? '#ecfdf5' : '#f1f5f9',
                            color: idx === 0 ? '#059669' : '#64748b',
                            fontWeight: idx === 0 ? 600 : 500,
                            border: idx === 0 ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                          }}>
                            {idx === 0 && <span style={{ marginRight: 2 }}>✓</span>}{skill}
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </Box>
                )
              })
            )}
          </Box>
        </Box>
      </Box>
      </Box>{/* End Two Column Layout */}

      {/* ─── Add Candidate Dialog ─── */}
      <Dialog open={addDialogOpen} onClose={() => { setAddDialogOpen(false); setAddMode('choose'); setExistingSearch(''); setExistingResults([]) }} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0', pb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#020291', color: 'white'
            }}>
              <i className={addMode === 'existing' ? 'fas fa-search' : 'fas fa-user-plus'} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>
                {addMode === 'choose' ? 'Add Candidate' : addMode === 'new' ? 'Add New Candidate' : 'Add Existing Candidate'}
              </Typography>
              <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                {addMode === 'choose' ? 'Choose how to add a candidate' : addMode === 'new' ? 'Add a new candidate for this position' : 'Search and select an existing candidate'}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {/* ─── Choose Mode ─── */}
          {addMode === 'choose' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Box
                onClick={() => setAddMode('new')}
                sx={{
                  p: 2.5, borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer',
                  transition: 'all 0.2s', '&:hover': { borderColor: '#020291', background: '#f8fafc' }
                }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EEF0FF', color: '#020291' }}>
                    <i className="fas fa-user-plus" style={{ fontSize: 16 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>Add New Candidate</Typography>
                    <Typography sx={{ fontSize: '12px', color: '#64748b' }}>Enter candidate details and upload resume</Typography>
                  </Box>
                  <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }} />
                </Box>
              </Box>
              <Box
                onClick={() => { setAddMode('existing'); fetchExistingCandidates() }}
                sx={{
                  p: 2.5, borderRadius: '12px', border: '1px solid #e2e8f0', cursor: 'pointer',
                  transition: 'all 0.2s', '&:hover': { borderColor: '#020291', background: '#f8fafc' }
                }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', color: '#16a34a' }}>
                    <i className="fas fa-search" style={{ fontSize: 16 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>Add Existing Candidate</Typography>
                    <Typography sx={{ fontSize: '12px', color: '#64748b' }}>Search by name or email from existing candidates</Typography>
                  </Box>
                  <i className="fas fa-chevron-right" style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }} />
                </Box>
              </Box>
            </Box>
          )}

          {/* ─── Existing Candidate Search ─── */}
          {addMode === 'existing' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                fullWidth
                placeholder="Search by name or email..."
                value={existingSearch}
                onChange={e => handleSearchExisting(e.target.value)}
                autoFocus
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }}
                InputProps={{
                  startAdornment: <Box sx={{ mr: 1, color: '#94a3b8' }}><i className="fas fa-search" style={{ fontSize: 14 }} /></Box>
                }}
              />
              {existingLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} sx={{ color: '#020291' }} />
                </Box>
              )}
              {!existingLoading && existingResults.length === 0 && (
                <Typography sx={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', py: 2 }}>
                  {existingSearch.trim() ? 'No matching candidates found' : 'No candidates available'}
                </Typography>
              )}
              {existingResults.map((c: any) => (
                <Box
                  key={c.id}
                  onClick={() => !submitting && handleAddExistingCandidate(c.email)}
                  sx={{
                    p: 2, borderRadius: '10px', border: '1px solid #e2e8f0', cursor: submitting ? 'default' : 'pointer',
                    opacity: submitting ? 0.6 : 1,
                    transition: 'all 0.2s', '&:hover': submitting ? {} : { borderColor: '#020291', background: '#f8fafc' }
                  }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{
                      width: 36, height: 36, fontSize: '14px', fontWeight: 700,
                      background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)', color: '#475569'
                    }}>
                      {(c.name || 'U').charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{c.name}</Typography>
                      <Typography sx={{ fontSize: '11px', color: '#64748b' }}>{c.email}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      {c.experience && c.experience !== 'N/A' && (
                        <Typography sx={{ fontSize: '11px', color: '#64748b' }}>{c.experience}</Typography>
                      )}
                      {c.skills?.length > 0 && (
                        <Typography sx={{ fontSize: '10px', color: '#94a3b8', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.skills.slice(0, 3).join(', ')}
                        </Typography>
                      )}
                    </Box>
                    <i className="fas fa-plus-circle" style={{ fontSize: 16, color: '#020291' }} />
                  </Box>
                </Box>
              ))}
              {submitting && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
                  <CircularProgress size={20} sx={{ color: '#020291' }} />
                  <Typography sx={{ fontSize: '13px', color: '#64748b', ml: 1 }}>Adding candidate...</Typography>
                </Box>
              )}
            </Box>
          )}

          {/* ─── New Candidate Form ─── */}
          {addMode === 'new' && (
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

            
          </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
          {addMode !== 'choose' && (
            <Button onClick={() => { setAddMode('choose'); setExistingSearch(''); setExistingResults([]) }} sx={{
              color: '#64748b', textTransform: 'none', px: 2, height: '40px', borderRadius: '10px', mr: 'auto',
              '&:hover': { background: '#f1f5f9' }
            }}><i className="fas fa-arrow-left" style={{ marginRight: 6, fontSize: 12 }} />Back</Button>
          )}
          <Button onClick={() => { setAddDialogOpen(false); setAddMode('choose'); setExistingSearch(''); setExistingResults([]) }} sx={{
            color: '#64748b', textTransform: 'none', px: 3, height: '40px', borderRadius: '10px',
            '&:hover': { background: '#f1f5f9' }
          }}>Cancel</Button>
          {addMode === 'new' && (
            <Button onClick={handleAddCandidate} disabled={submitting}
              sx={{
                background: '#020291', color: 'white',
                borderRadius: '10px', textTransform: 'none', fontWeight: 600, px: 3, height: '40px',
                '&:hover': { background: '#06109E' },
                '&:disabled': { opacity: 0.6, color: 'white' }
              }}>
              {submitting ? <><CircularProgress size={16} sx={{ mr: 1, color: 'white' }} /> Adding...</> : <>Add candidate <i className="fas fa-arrow-right" style={{ marginLeft: 8, fontSize: 12 }} /></>}
            </Button>
          )}
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

      {/* ─── Schedule Interview Dialog ─── */}
      <Dialog open={scheduleDialogOpen} onClose={() => { setScheduleDialogOpen(false); setSchedulingCandidate(null); setScheduleForm({ date: '', time: '', duration_minutes: '30' }) }}
        maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0', pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #020291, #020291)', color: 'white'
            }}>
              <i className="fas fa-calendar-plus" />
            </Box>
            Schedule Interview
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {schedulingCandidate && (
            <Typography sx={{ fontSize: '14px', color: '#64748b', mb: 2.5 }}>
              Scheduling interview for <strong>{schedulingCandidate.applicant_name}</strong>. Questions will be auto-generated and an email will be sent to the candidate.
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box>
              <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Date *</Typography>
              <TextField fullWidth type="date" value={scheduleForm.date}
                onChange={e => setScheduleForm(prev => ({ ...prev, date: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Time *</Typography>
              <TextField fullWidth type="time" value={scheduleForm.time}
                onChange={e => setScheduleForm(prev => ({ ...prev, time: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Duration</Typography>
              <TextField fullWidth select value={scheduleForm.duration_minutes}
                onChange={e => setScheduleForm(prev => ({ ...prev, duration_minutes: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }}>
                <MenuItem value="15">15 minutes</MenuItem>
                <MenuItem value="30">30 minutes</MenuItem>
                <MenuItem value="45">45 minutes</MenuItem>
                <MenuItem value="60">60 minutes</MenuItem>
              </TextField>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => { setScheduleDialogOpen(false); setSchedulingCandidate(null); setScheduleForm({ date: '', time: '', duration_minutes: '30' }) }}
            sx={{ color: '#64748b', textTransform: 'none', px: 3, height: '40px', borderRadius: '10px' }}>Cancel</Button>
          <Button
            onClick={handleScheduleInterview}
            disabled={scheduling || !scheduleForm.date || !scheduleForm.time}
            sx={{
              background: 'linear-gradient(135deg, #020291, #020291)', color: 'white',
              borderRadius: '10px', textTransform: 'none', fontWeight: 600, px: 3, height: '40px',
              '&:hover': { background: 'linear-gradient(135deg, #010178, #010178)' },
              '&:disabled': { opacity: 0.6, color: 'white' }
            }}>
            {scheduling ? (
              <><CircularProgress size={16} sx={{ mr: 1, color: 'white' }} /> Scheduling...</>
            ) : (
              <><i className="fas fa-calendar-check" style={{ marginRight: 8 }} /> Schedule Interview</>
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
