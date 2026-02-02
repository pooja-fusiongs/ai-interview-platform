import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Button, Card, Chip, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, LinearProgress, IconButton, CircularProgress
} from '@mui/material'
import { toast } from 'react-hot-toast'
import Navigation from '../layout/sidebar'
import { recruiterService, RecruiterCandidate } from '../../services/recruiterService'

const RecruiterCandidates = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const jobId = parseInt(searchParams.get('jobId') || '0')
  const jobTitle = searchParams.get('jobTitle') || 'Job'

  const [candidates, setCandidates] = useState<RecruiterCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false)
  const [selectedCandidate, setSelectedCandidate] = useState<RecruiterCandidate | null>(null)
  const [transcriptText, setTranscriptText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [generatingFor, setGeneratingFor] = useState<number | null>(null)
  const [scoringFor, setScoringFor] = useState<number | null>(null)

  // Add candidate form
  const [addForm, setAddForm] = useState({
    name: '', email: '', phone: '', experience_years: '', current_position: '', resume: null as File | null
  })

  const fetchCandidates = useCallback(async () => {
    if (!jobId) return
    try {
      const data = await recruiterService.getCandidates(jobId)
      setCandidates(data)
    } catch (err) {
      console.error('Failed to fetch candidates:', err)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { fetchCandidates() }, [fetchCandidates])

  const handleAddCandidate = async () => {
    if (!addForm.name || !addForm.email) {
      toast.error('Name and email are required')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('name', addForm.name)
      fd.append('email', addForm.email)
      fd.append('phone', addForm.phone)
      fd.append('experience_years', addForm.experience_years || '0')
      fd.append('current_position', addForm.current_position)
      if (addForm.resume) fd.append('resume', addForm.resume)

      await recruiterService.addCandidate(jobId, fd)
      toast.success('Candidate added successfully')
      setAddDialogOpen(false)
      setAddForm({ name: '', email: '', phone: '', experience_years: '', current_position: '', resume: null })
      fetchCandidates()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to add candidate')
    } finally {
      setSubmitting(false)
    }
  }

  const handleGenerateQuestions = async (candidate: RecruiterCandidate) => {
    setGeneratingFor(candidate.id)
    try {
      await recruiterService.generateQuestions(jobId, candidate.id)
      toast.success(`Questions generated for ${candidate.applicant_name}`)
      fetchCandidates()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to generate questions')
    } finally {
      setGeneratingFor(null)
    }
  }

  const handleSubmitTranscript = async () => {
    if (!selectedCandidate || !transcriptText.trim()) {
      toast.error('Please paste the interview transcript')
      return
    }
    setScoringFor(selectedCandidate.id)
    try {
      const result = await recruiterService.submitTranscript(jobId, selectedCandidate.id, transcriptText)
      toast.success(`Scored ${result.overall_score?.toFixed(1)}/10 — ${result.recommendation?.toUpperCase()}`)
      setTranscriptDialogOpen(false)
      setTranscriptText('')
      setSelectedCandidate(null)
      fetchCandidates()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to score transcript')
    } finally {
      setScoringFor(null)
    }
  }

  const getStatusChip = (candidate: RecruiterCandidate) => {
    if (candidate.has_scores) {
      const score = candidate.overall_score || 0
      const color = score >= 7.5 ? '#16a34a' : score >= 5 ? '#f59e0b' : '#ef4444'
      return <Chip label={`${score.toFixed(1)}/10`} size="small" sx={{ background: `${color}20`, color, fontWeight: 700, fontSize: '13px' }} />
    }
    if (candidate.has_transcript) return <Chip label="Scoring..." size="small" sx={{ background: '#dbeafe', color: '#2563eb' }} />
    if (candidate.questions_status === 'approved') return <Chip label="Ready for Interview" size="small" sx={{ background: '#dcfce7', color: '#16a34a' }} />
    if (candidate.has_questions) return <Chip label="Questions Generated" size="small" sx={{ background: '#fef3c7', color: '#d97706' }} />
    if (candidate.has_resume) return <Chip label="Resume Uploaded" size="small" sx={{ background: '#e0e7ff', color: '#4f46e5' }} />
    return <Chip label="Added" size="small" sx={{ background: '#f1f5f9', color: '#64748b' }} />
  }

  const getRecommendationChip = (rec: string | undefined) => {
    if (!rec) return null
    const map: Record<string, { bg: string; color: string; label: string }> = {
      select: { bg: '#dcfce7', color: '#16a34a', label: 'SELECT' },
      next_round: { bg: '#fef3c7', color: '#d97706', label: 'NEXT ROUND' },
      reject: { bg: '#fee2e2', color: '#ef4444', label: 'REJECT' }
    }
    const style = map[rec] || map.reject
    return <Chip label={style.label} size="small" sx={{ background: style.bg, color: style.color, fontWeight: 700 }} />
  }

  return (
    <Navigation>
      <Box sx={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <IconButton onClick={() => navigate(-1)} sx={{ color: '#64748b' }}>
                <i className="fas fa-arrow-left" />
              </IconButton>
              <Box>
                <Typography sx={{ fontSize: '24px', fontWeight: 700, color: '#1e293b' }}>
                  Manage Candidates
                </Typography>
                <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                  {jobTitle} — {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
                </Typography>
              </Box>
            </Box>
          </Box>
          <Button
            onClick={() => setAddDialogOpen(true)}
            sx={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: 'white', borderRadius: '10px', textTransform: 'none',
              fontWeight: 600, px: 3, py: 1.2,
              '&:hover': { background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)', transform: 'translateY(-1px)' }
            }}
          >
            <i className="fas fa-plus" style={{ marginRight: 8 }} /> Add Candidate
          </Button>
        </Box>

        {/* Pipeline Steps Guide */}
        <Card sx={{ p: 2, mb: 3, borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Add Candidate', 'Generate Questions', 'Expert Review', 'Conduct Interview', 'Upload Transcript', 'View Results'].map((step, i) => (
              <Box key={step} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', fontSize: '12px', fontWeight: 700
                }}>{i + 1}</Box>
                <Typography sx={{ fontSize: '13px', color: '#475569', fontWeight: 500 }}>{step}</Typography>
                {i < 5 && <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', fontSize: '10px' }} />}
              </Box>
            ))}
          </Box>
        </Card>

        {/* Loading */}
        {loading && <Box sx={{ textAlign: 'center', py: 8 }}><CircularProgress sx={{ color: '#f59e0b' }} /></Box>}

        {/* Empty State */}
        {!loading && candidates.length === 0 && (
          <Card sx={{ p: 6, textAlign: 'center', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <Box sx={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b20, #d9770620)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
              <i className="fas fa-users" style={{ fontSize: 24, color: '#f59e0b' }} />
            </Box>
            <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', mb: 1 }}>No candidates yet</Typography>
            <Typography sx={{ fontSize: '14px', color: '#64748b', mb: 3 }}>Add candidates by uploading their resumes to get started.</Typography>
            <Button onClick={() => setAddDialogOpen(true)} sx={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white',
              borderRadius: '10px', textTransform: 'none', fontWeight: 600
            }}>
              <i className="fas fa-plus" style={{ marginRight: 8 }} /> Add First Candidate
            </Button>
          </Card>
        )}

        {/* Candidate List */}
        {!loading && candidates.map((candidate) => (
          <Card key={candidate.id} sx={{
            mb: 2, p: 0, borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white',
            transition: 'all 0.2s', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)', borderColor: '#f59e0b40' }
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', p: 2.5, gap: 2.5 }}>
              {/* Avatar */}
              <Avatar sx={{
                width: 48, height: 48, background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                fontSize: '18px', fontWeight: 700, flexShrink: 0
              }}>
                {candidate.applicant_name.charAt(0).toUpperCase()}
              </Avatar>

              {/* Info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                    {candidate.applicant_name}
                  </Typography>
                  {getStatusChip(candidate)}
                  {candidate.has_scores && getRecommendationChip(candidate.recommendation)}
                </Box>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                    <i className="fas fa-envelope" style={{ marginRight: 6, fontSize: 11 }} />{candidate.applicant_email}
                  </Typography>
                  {candidate.experience_years ? (
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                      <i className="fas fa-briefcase" style={{ marginRight: 6, fontSize: 11 }} />{candidate.experience_years} years
                    </Typography>
                  ) : null}
                  {candidate.current_position && (
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                      <i className="fas fa-user-tie" style={{ marginRight: 6, fontSize: 11 }} />{candidate.current_position}
                    </Typography>
                  )}
                  {candidate.parsed_skills.length > 0 && (
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                      <i className="fas fa-code" style={{ marginRight: 6, fontSize: 11 }} />{candidate.parsed_skills.slice(0, 3).join(', ')}{candidate.parsed_skills.length > 3 ? ` +${candidate.parsed_skills.length - 3}` : ''}
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Actions */}
              <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {/* Generate Questions */}
                {candidate.has_resume && !candidate.has_questions && (
                  <Button
                    size="small"
                    disabled={generatingFor === candidate.id}
                    onClick={() => handleGenerateQuestions(candidate)}
                    sx={{
                      background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: '1px solid #fbbf2480',
                      borderRadius: '8px', textTransform: 'none', fontWeight: 600, fontSize: '12px',
                      '&:hover': { background: 'rgba(245, 158, 11, 0.2)' }
                    }}
                  >
                    {generatingFor === candidate.id ? (
                      <><CircularProgress size={14} sx={{ mr: 0.5, color: '#d97706' }} /> Generating...</>
                    ) : (
                      <><i className="fas fa-robot" style={{ marginRight: 6 }} /> Generate Questions</>
                    )}
                  </Button>
                )}

                {/* View/Review Questions */}
                {candidate.has_questions && candidate.question_session_id && (
                  <Button
                    size="small"
                    onClick={() => navigate(`/interview-outline/${candidate.question_session_id}`)}
                    sx={{
                      background: candidate.questions_status === 'approved' ? '#dcfce720' : '#fef3c720',
                      color: candidate.questions_status === 'approved' ? '#16a34a' : '#d97706',
                      border: `1px solid ${candidate.questions_status === 'approved' ? '#16a34a40' : '#d9770640'}`,
                      borderRadius: '8px', textTransform: 'none', fontWeight: 600, fontSize: '12px',
                      '&:hover': { background: candidate.questions_status === 'approved' ? '#dcfce740' : '#fef3c740' }
                    }}
                  >
                    <i className="fas fa-list-check" style={{ marginRight: 6 }} />
                    {candidate.questions_status === 'approved' ? 'Questions Approved' : 'Review Questions'}
                  </Button>
                )}

                {/* Upload Transcript */}
                {candidate.questions_status === 'approved' && !candidate.has_scores && (
                  <Button
                    size="small"
                    onClick={() => { setSelectedCandidate(candidate); setTranscriptDialogOpen(true) }}
                    sx={{
                      background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', border: '1px solid #2563eb40',
                      borderRadius: '8px', textTransform: 'none', fontWeight: 600, fontSize: '12px',
                      '&:hover': { background: 'rgba(37, 99, 235, 0.2)' }
                    }}
                  >
                    <i className="fas fa-file-alt" style={{ marginRight: 6 }} /> Upload Transcript
                  </Button>
                )}

                {/* View Results */}
                {candidate.has_scores && candidate.session_id && (
                  <Button
                    size="small"
                    onClick={() => navigate(`/results?session=${candidate.session_id}`)}
                    sx={{
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white',
                      borderRadius: '8px', textTransform: 'none', fontWeight: 600, fontSize: '12px',
                      '&:hover': { background: 'linear-gradient(135deg, #d97706, #b45309)' }
                    }}
                  >
                    <i className="fas fa-chart-bar" style={{ marginRight: 6 }} /> View Results
                  </Button>
                )}
              </Box>
            </Box>
            {(generatingFor === candidate.id || scoringFor === candidate.id) && (
              <LinearProgress sx={{ '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #f59e0b, #d97706)' } }} />
            )}
          </Card>
        ))}

        {/* ─── Add Candidate Dialog ─── */}
        <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth
          PaperProps={{ sx: { borderRadius: '16px' } }}>
          <DialogTitle sx={{ fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0', pb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white'
              }}>
                <i className="fas fa-user-plus" />
              </Box>
              Add Candidate
            </Box>
          </DialogTitle>
          <DialogContent sx={{ pt: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
              <TextField label="Full Name" required value={addForm.name}
                onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
              <TextField label="Email" type="email" required value={addForm.email}
                onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Phone" value={addForm.phone}
                  onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                  sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
                <TextField label="Experience (years)" type="number" value={addForm.experience_years}
                  onChange={e => setAddForm({ ...addForm, experience_years: e.target.value })}
                  sx={{ width: 160, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
              </Box>
              <TextField label="Current Position" value={addForm.current_position}
                onChange={e => setAddForm({ ...addForm, current_position: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
              {/* Resume Upload */}
              <Box sx={{
                border: '2px dashed #e2e8f0', borderRadius: '12px', p: 3, textAlign: 'center',
                background: addForm.resume ? '#f0fdf4' : '#f8fafc', cursor: 'pointer',
                transition: 'all 0.2s', '&:hover': { borderColor: '#f59e0b', background: '#fffbeb' }
              }}
                onClick={() => document.getElementById('resume-upload')?.click()}>
                <input id="resume-upload" type="file" hidden accept=".pdf,.doc,.docx,.txt"
                  onChange={e => setAddForm({ ...addForm, resume: e.target.files?.[0] || null })} />
                {addForm.resume ? (
                  <Box>
                    <i className="fas fa-check-circle" style={{ fontSize: 24, color: '#16a34a', marginBottom: 8 }} />
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#16a34a' }}>{addForm.resume.name}</Typography>
                    <Typography sx={{ fontSize: '12px', color: '#64748b' }}>Click to change file</Typography>
                  </Box>
                ) : (
                  <Box>
                    <i className="fas fa-cloud-upload-alt" style={{ fontSize: 24, color: '#94a3b8', marginBottom: 8 }} />
                    <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#64748b' }}>Upload Resume (PDF, DOCX, TXT)</Typography>
                    <Typography sx={{ fontSize: '12px', color: '#94a3b8' }}>Click to browse files</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
            <Button onClick={() => setAddDialogOpen(false)} sx={{ color: '#64748b', textTransform: 'none' }}>Cancel</Button>
            <Button onClick={handleAddCandidate} disabled={submitting}
              sx={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white',
                borderRadius: '10px', textTransform: 'none', fontWeight: 600, px: 3,
                '&:hover': { background: 'linear-gradient(135deg, #d97706, #b45309)' },
                '&:disabled': { opacity: 0.6 }
              }}>
              {submitting ? 'Adding...' : 'Add Candidate'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ─── Transcript Upload Dialog ─── */}
        <Dialog open={transcriptDialogOpen} onClose={() => { setTranscriptDialogOpen(false); setTranscriptText('') }}
          maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
          <DialogTitle sx={{ fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0', pb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: 'white'
              }}>
                <i className="fas fa-file-alt" />
              </Box>
              Upload Interview Transcript — {selectedCandidate?.applicant_name}
            </Box>
          </DialogTitle>
          <DialogContent sx={{ pt: 3 }}>
            <Typography sx={{ fontSize: '14px', color: '#64748b', mb: 2 }}>
              Paste the full interview transcript below. The AI will extract answers for each question and score them against the expected answers.
            </Typography>
            <TextField
              multiline rows={14} fullWidth
              placeholder="Paste the interview transcript here...&#10;&#10;Example:&#10;Interviewer: Tell me about your experience with Python.&#10;Candidate: I have been working with Python for 5 years..."
              value={transcriptText}
              onChange={e => setTranscriptText(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': { borderRadius: '12px', fontSize: '14px', fontFamily: 'inherit' },
                '& .MuiOutlinedInput-input': { lineHeight: 1.6 }
              }}
            />
            <Typography sx={{ fontSize: '12px', color: '#94a3b8', mt: 1, textAlign: 'right' }}>
              {transcriptText.length} characters
            </Typography>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, borderTop: '1px solid #e2e8f0' }}>
            <Button onClick={() => { setTranscriptDialogOpen(false); setTranscriptText('') }}
              sx={{ color: '#64748b', textTransform: 'none' }}>Cancel</Button>
            <Button
              onClick={handleSubmitTranscript}
              disabled={!transcriptText.trim() || scoringFor !== null}
              sx={{
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: 'white',
                borderRadius: '10px', textTransform: 'none', fontWeight: 600, px: 3,
                '&:hover': { background: 'linear-gradient(135deg, #1d4ed8, #1e40af)' },
                '&:disabled': { opacity: 0.6 }
              }}>
              {scoringFor ? (
                <><CircularProgress size={16} sx={{ mr: 1, color: 'white' }} /> Scoring with AI...</>
              ) : (
                <><i className="fas fa-magic" style={{ marginRight: 8 }} /> Submit & Score</>
              )}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Navigation>
  )
}

export default RecruiterCandidates
