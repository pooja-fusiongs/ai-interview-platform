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
      return { bg: '#dcfce7', color: '#16a34a' }
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
  onJobSelect,
}) => {
  const [candidates, setCandidates] = useState<any[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(true)
  const [similarJobs, setSimilarJobs] = useState<any[]>([])
  const [similarJobsLoading, setSimilarJobsLoading] = useState(true)
  const [isEditingDesc, setIsEditingDesc] = useState(false)
  const [editedDescription, setEditedDescription] = useState('')
  const [savingDesc, setSavingDesc] = useState(false)
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' })

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 5

  // Question generation & transcript state per candidate
  const [generatingQuestions, setGeneratingQuestions] = useState<Record<number, boolean>>({})
  const [candidateQuestionSets, setCandidateQuestionSets] = useState<Record<number, string>>({}) // candidateId -> questionSetId
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

  // Fetch existing question sets to know which candidates have questions
  useEffect(() => {
    const fetchQuestionSets = async () => {
      try {
        const response = await apiClient.get('/api/interview/question-sets')
        const sets = response.data || []
        const mapping: Record<number, string> = {}
        for (const qs of sets) {
          if (qs.job_id === selectedJob.id && qs.application_id) {
            mapping[qs.application_id] = qs.id
          }
        }
        setCandidateQuestionSets(mapping)
      } catch (error) {
        console.error('Error fetching question sets:', error)
      }
    }
    if (selectedJob?.id) fetchQuestionSets()
  }, [selectedJob?.id])

  // Generate questions for a candidate
  const handleGenerateQuestions = async (candidateId: number) => {
    setGeneratingQuestions(prev => ({ ...prev, [candidateId]: true }))
    try {
      await recruiterService.generateQuestions(selectedJob.id, candidateId)
      hotToast.success('Questions generated successfully!')
      // Refresh question sets to get the session ID
      const response = await apiClient.get('/api/interview/question-sets')
      const sets = response.data || []
      const mapping: Record<number, string> = { ...candidateQuestionSets }
      for (const qs of sets) {
        if (qs.job_id === selectedJob.id && qs.application_id) {
          mapping[qs.application_id] = qs.id
        }
      }
      setCandidateQuestionSets(mapping)
    } catch (err: any) {
      hotToast.error(err.response?.data?.detail || 'Failed to generate questions')
    } finally {
      setGeneratingQuestions(prev => ({ ...prev, [candidateId]: false }))
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

  // Fetch similar jobs (same company or category, excluding current job)
  useEffect(() => {
    const fetchSimilarJobs = async () => {
      try {
        setSimilarJobsLoading(true)
        const data = await jobService.getJobs({ limit: 20 })
        const jobs = Array.isArray(data) ? data : data.jobs || []
        const filtered = jobs
          .filter((j: any) => j.id !== selectedJob.id)
          .slice(0, 5)
        setSimilarJobs(filtered)
      } catch (error) {
        console.error('Error fetching similar jobs:', error)
      } finally {
        setSimilarJobsLoading(false)
      }
    }
    if (selectedJob?.id) fetchSimilarJobs()
  }, [selectedJob?.id])

  // Helper functions
  const getExperienceLevel = (job: any) => job.experience_level || job.experienceLevel || 'Not specified'
  const getNumberOfQuestions = (job: any) => job.number_of_questions || job.numberOfQuestions || 10

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
        return ''
      case 'email':
        if (!value.trim()) return 'Email is required'
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'Please enter a valid email'
        return ''
      case 'linkedin':
        if (value.trim() && !value.trim().startsWith('http')) return 'Please enter a valid URL'
        return ''
      default:
        return ''
    }
  }

  const handleAddFieldChange = (field: string, value: string) => {
    setAddForm(prev => ({ ...prev, [field]: value }))
    if (addFormTouched[field]) {
      setAddFormErrors(prev => ({ ...prev, [field]: validateAddField(field, value) }))
    }
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
    if (addForm.linkedin) errors.linkedin = validateAddField('linkedin', addForm.linkedin)
    setAddFormErrors(errors)
    setAddFormTouched({ name: true, email: true, resume: true, linkedin: true })

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
      fd.append('experience_years', '0')
      fd.append('current_position', '')
      if (addForm.resume) fd.append('resume', addForm.resume)

      await recruiterService.addCandidate(selectedJob.id, fd)
      hotToast.success('Candidate added successfully')
      setAddDialogOpen(false)
      setAddForm({
        name: '', email: '', phone: '', location: '', linkedin: '',
        notice_period: '', current_ctc: '', expected_ctc: '',
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

      {/* Candidates Section */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
          Candidates
        </Typography>
        {(user?.role === 'recruiter' || user?.role === 'admin') && (
          <Button
            onClick={() => setAddDialogOpen(true)}
            sx={{
              background: '#020291', color: 'white', borderRadius: '8px',
              textTransform: 'none', fontWeight: 600, fontSize: '13px', px: 2.5,
              '&:hover': { background: '#06109E' }
            }}
          >
            <i className="fas fa-plus" style={{ marginRight: 6, fontSize: 11 }}></i> Add candidate
          </Button>
        )}
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
        const totalPages = Math.ceil(candidates.length / itemsPerPage)
        const paginatedCandidates = candidates.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
        return (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {paginatedCandidates.map((candidate: any) => {
                const hasQuestions = !!candidateQuestionSets[candidate.id]
                const questionSetId = candidateQuestionSets[candidate.id]
                const isGenerating = generatingQuestions[candidate.id]
                return (
                <Box key={candidate.id} sx={{
                  p: '14px 18px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#fff',
                  transition: 'all 0.2s',
                  '&:hover': { borderColor: '#02029140', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{
                      width: 36, height: 36, fontSize: '14px', fontWeight: 700,
                      background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)', color: '#475569'
                    }}>
                      {(candidate.applicant_name || 'U').charAt(0).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
                        {candidate.applicant_name}
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1, md: 2 }, alignItems: 'center' }}>
                        <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                          <i className="fas fa-envelope" style={{ marginRight: 4, fontSize: 10 }}></i>
                          {candidate.applicant_email}
                        </Typography>
                        <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                          {candidate.duration_minutes || 30} min
                        </Typography>
                        <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                          <i className="fas fa-list" style={{ marginRight: 4, fontSize: 10 }}></i>
                          {getNumberOfQuestions(selectedJob)} questions
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      label={candidate.status || 'Applied'}
                      size="small"
                      sx={{
                        fontSize: '11px', fontWeight: 600, height: '22px',
                        backgroundColor: getStatusColor(candidate.status === 'Added by Recruiter' ? 'Open' : candidate.status || 'Applied').bg,
                        color: getStatusColor(candidate.status === 'Added by Recruiter' ? 'Open' : candidate.status || 'Applied').color,
                      }}
                    />
                  </Box>

                  {/* Action Buttons */}
                  <Box sx={{ display: 'flex', gap: 1, mt: 1.5, ml: '52px' }}>
                    {!hasQuestions ? (
                      <Button
                        onClick={() => handleGenerateQuestions(candidate.id)}
                        disabled={isGenerating}
                        size="small"
                        sx={{
                          textTransform: 'none', fontSize: '12px', fontWeight: 600,
                          borderRadius: '6px', px: 1.5, py: 0.5, height: '30px',
                          background: '#020291', color: 'white',
                          '&:hover': { background: '#06109E' },
                          '&:disabled': { opacity: 0.6, color: 'white' }
                        }}
                      >
                        {isGenerating ? (
                          <><CircularProgress size={12} sx={{ mr: 0.5, color: 'white' }} /> Generating...</>
                        ) : (
                          <><i className="fas fa-magic" style={{ marginRight: 5, fontSize: 10 }}></i> Generate Questions</>
                        )}
                      </Button>
                    ) : (
                      <>
                        <Button
                          onClick={() => navigate(`/interview-outline/${questionSetId}?jobId=${selectedJob.id}&jobTitle=${encodeURIComponent(selectedJob.title)}`)}
                          size="small"
                          sx={{
                            textTransform: 'none', fontSize: '12px', fontWeight: 600,
                            borderRadius: '6px', px: 1.5, py: 0.5, height: '30px',
                            border: '1px solid #020291', color: '#020291', background: 'white',
                            '&:hover': { background: '#EEF0FF' }
                          }}
                        >
                          <i className="fas fa-eye" style={{ marginRight: 5, fontSize: 10 }}></i> Review
                        </Button>
                        <Button
                          onClick={() => {
                            setTranscriptCandidate(candidate)
                            setTranscriptText('')
                            setTranscriptDialogOpen(true)
                          }}
                          size="small"
                          sx={{
                            textTransform: 'none', fontSize: '12px', fontWeight: 600,
                            borderRadius: '6px', px: 1.5, py: 0.5, height: '30px',
                            background: '#16a34a', color: 'white',
                            '&:hover': { background: '#15803d' }
                          }}
                        >
                          <i className="fas fa-file-upload" style={{ marginRight: 5, fontSize: 10 }}></i> Upload Transcript
                        </Button>
                      </>
                    )}
                  </Box>
                </Box>
                )
              })}
            </Box>

            {/* Pagination */}
            {totalPages > 1 && (
              <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                mt: 2, p: '12px 16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0'
              }}>
                <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                  Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, candidates.length)} of {candidates.length} candidates
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

      {/* Right Column - Similar Jobs */}
      <Box sx={{
        width: { xs: '100%', md: 320 }, flexShrink: 0,
        display: { xs: 'none', md: 'block' }
      }}>
        <Box sx={{
          p: '20px', borderRadius: '12px', border: '1px solid #e2e8f0',
          background: '#fff', position: 'sticky', top: 24
        }}>
          <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e293b', mb: 2 }}>
            <i className="fas fa-briefcase" style={{ marginRight: 8, fontSize: 14, color: '#020291' }}></i>
            Similar Jobs
          </Typography>

          {similarJobsLoading ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <CircularProgress size={24} sx={{ color: '#020291' }} />
            </Box>
          ) : similarJobs.length === 0 ? (
            <Typography sx={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', py: 3 }}>
              No similar jobs found
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {similarJobs.map((job: any) => (
                <Box
                  key={job.id}
                  onClick={() => onJobSelect?.(job)}
                  sx={{
                    p: '12px', borderRadius: '10px', border: '1px solid #f1f5f9',
                    background: '#f8fafc', cursor: 'pointer', transition: 'all 0.2s',
                    '&:hover': { borderColor: '#020291', background: '#EEF0FF', transform: 'translateY(-1px)', boxShadow: '0 2px 8px rgba(2,2,145,0.08)' }
                  }}
                >
                  <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: 0.5, lineHeight: 1.3 }}>
                    {job.title}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                    {job.company && (
                      <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                        <i className="fas fa-building" style={{ marginRight: 3, fontSize: 10 }}></i>
                        {job.company}
                      </Typography>
                    )}
                    <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                      <i className="fas fa-briefcase" style={{ marginRight: 3, fontSize: 10 }}></i>
                      {job.experience_level || job.experienceLevel || 'N/A'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Chip
                      label={job.status || 'Open'}
                      size="small"
                      sx={{
                        fontSize: '10px', fontWeight: 600, height: '20px',
                        backgroundColor: getStatusColor(job.status || 'Open').bg,
                        color: getStatusColor(job.status || 'Open').color,
                      }}
                    />
                    {getFormattedDate(job) && (
                      <Typography sx={{ fontSize: '11px', color: '#94a3b8' }}>
                        {getFormattedDate(job)}
                      </Typography>
                    )}
                  </Box>
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

            {/* Phone + Location */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Phone Number</Typography>
                <TextField fullWidth placeholder="+91 98765 43210" value={addForm.phone}
                  onChange={e => handleAddFieldChange('phone', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Current Location</Typography>
                <TextField fullWidth placeholder="Bangalore, India" value={addForm.location}
                  onChange={e => handleAddFieldChange('location', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
            </Box>

            {/* LinkedIn + Notice Period */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>LinkedIn</Typography>
                <TextField fullWidth placeholder="https://linkedin.com/in/janesmith" value={addForm.linkedin}
                  onChange={e => handleAddFieldChange('linkedin', e.target.value)}
                  onBlur={() => handleAddFieldBlur('linkedin', addForm.linkedin)}
                  error={addFormTouched.linkedin && !!addFormErrors.linkedin}
                  helperText={addFormTouched.linkedin && addFormErrors.linkedin}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Notice Period</Typography>
                <TextField fullWidth placeholder="30 days" value={addForm.notice_period}
                  onChange={e => handleAddFieldChange('notice_period', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
            </Box>

            {/* CTC */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', mb: '6px' }}>Current CTC</Typography>
                <TextField fullWidth placeholder="12 LPA" value={addForm.current_ctc}
                  onChange={e => handleAddFieldChange('current_ctc', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' } }} />
              </Box>
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
