import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Box, Typography, Button, Card, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, LinearProgress, IconButton, CircularProgress,
  InputAdornment, Skeleton
} from '@mui/material'
import { toast } from 'react-hot-toast'
import Navigation from '../layout/Sidebar'
import { recruiterService, RecruiterCandidate } from '../../services/recruiterService'

const RecruiterCandidates = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const jobId = parseInt(searchParams.get('jobId') || '0')
  const jobTitle = searchParams.get('jobTitle') || 'Job'
  const interviewId = searchParams.get('interviewId') || ''

  const [candidates, setCandidates] = useState<RecruiterCandidate[]>([])
  const [filteredCandidates, setFilteredCandidates] = useState<RecruiterCandidate[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)
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
    if (!jobId) {
      setLoading(false)
      return
    }
    try {
      const data = await recruiterService.getCandidates(jobId)
      setCandidates(data)
      setFilteredCandidates(data) // Initialize filtered candidates
    } catch (err) {
      console.error('Failed to fetch candidates:', err)
      setCandidates([]) // Set empty array on error
      setFilteredCandidates([])
    } finally {
      setLoading(false)
    }
  }, [jobId])

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCandidates(candidates)
    } else {
      const filtered = candidates.filter(candidate =>
        candidate.applicant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.applicant_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.current_position?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        candidate.parsed_skills.some(skill =>
          skill.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
      setFilteredCandidates(filtered)
    }
    setCurrentPage(1) // Reset to first page when search changes
  }, [searchQuery, candidates])

  // Pagination calculations
  const totalPages = Math.ceil(filteredCandidates.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentCandidates = filteredCandidates.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value)
  }

  const clearSearch = () => {
    setSearchQuery('')
  }

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
      await fetchCandidates() // Refresh the list
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
      toast.success(`Questions generated! Click "Review Questions" to approve.`, { duration: 4000 })
      await fetchCandidates() // Refresh the list
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
      toast.success(`Scored ${(result.overall_score / 10)?.toFixed(1)}/10 — ${result.recommendation?.toUpperCase()}`)
      setTranscriptDialogOpen(false)
      setTranscriptText('')
      setSelectedCandidate(null)
      await fetchCandidates() // Refresh the list
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to score transcript')
    } finally {
      setScoringFor(null)
    }
  }


  const getScoreDisplay = (candidate: RecruiterCandidate) => {
    if (candidate.has_scores) {
      const score = candidate.overall_score || 0
      const color = score >= 75 ? '#16a34a' : score >= 50 ? '#f59e0b' : '#ef4444'
      return (
        <Typography sx={{ fontSize: '13px', color, fontWeight: 600 }}>
          Score: {(score / 10).toFixed(1)}/10
        </Typography>
      )
    }
    return null
  }



  return (
    <Navigation>
      <Box sx={{ padding: { xs: '12px', sm: '16px', md: '24px' }, paddingBottom: '100px' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-start' }, mb: "10px", gap: { xs: 1.5, sm: 3 } }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, mb: { xs: 0, sm: 2 } }}>
              <IconButton onClick={() => navigate('/jobs', { state: { openJobId: jobId } })} sx={{ color: '#64748b' }}>
                <i className="fas fa-arrow-left" />
              </IconButton>
              <Typography sx={{ fontSize: { xs: '18px', sm: '24px' }, fontWeight: 700, color: '#1e293b' }}>
                Manage Candidates
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: "flex", gap: "10px", flexShrink: 0 }}>
            <Box sx={{ flex: 1 }}>
              {/* Search Bar */}
              <TextField
                fullWidth
                placeholder="Search..."
                value={searchQuery}
                onChange={handleSearchChange}
                sx={{
                  maxWidth: { xs: 'none', sm: '500px' },
                  padding: 0,
                  '& .MuiOutlinedInput-root': {
                    height: "40px",
                    borderRadius: '12px',
                    backgroundColor: 'white',
                    '&:hover': {
                      backgroundColor: '#f8fafc'
                    },
                    '&.Mui-focused': {
                      backgroundColor: 'white'
                    }
                  }
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <i className="fas fa-search" style={{ color: '#64748b', fontSize: '16px' }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchQuery && (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={clearSearch}
                        sx={{
                          color: '#64748b',
                          '&:hover': {
                            backgroundColor: 'rgba(100, 116, 139, 0.1)'
                          }
                        }}
                      >
                        <i className="fas fa-times" style={{ fontSize: '14px' }} />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Box>
            <Button
              onClick={() => setAddDialogOpen(true)}
              sx={{
                background: 'rgba(245, 158, 11, 0.1)',
                color: '#f59e0b',
                border: '2px solid #f59f0baf',
                borderRadius: '8px',
                fontSize: { xs: '12px', sm: '14px' },
                fontWeight: 600,
                textTransform: 'none',
                whiteSpace: 'nowrap',
                px: { xs: 1.5, sm: 2 },
                '&:hover': {
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderColor: '#f59e0b',
                  transform: 'translateY(-1px)',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                }
              }}
            >
              <i className="fas fa-plus" style={{ marginRight: 6 }} /> Add
            </Button>
          </Box>
        </Box>

        {/* Pipeline Steps Guide - Only show when no candidates exist */}
        {!loading && candidates.length === 0 && (
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
        )}

        {/* Loading Skeleton */}
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} sx={{
                p: 0, borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white',
              }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, p: { xs: 2, sm: 2.5 }, gap: { xs: 1.5, sm: 2.5 } }}>
                  {/* Avatar + Info skeleton */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2.5 }, flex: 1, minWidth: 0 }}>
                    <Skeleton variant="circular" sx={{ width: { xs: 40, sm: 48 }, height: { xs: 40, sm: 48 }, flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                        <Skeleton variant="text" width={140} sx={{ fontSize: { xs: '14px', sm: '15px' } }} />
                        <Skeleton variant="text" width={70} sx={{ fontSize: '13px' }} />
                      </Box>
                      <Box sx={{ display: 'flex', gap: { xs: 1.5, sm: 3 } }}>
                        <Skeleton variant="text" width={160} sx={{ fontSize: { xs: '12px', sm: '13px' } }} />
                        <Skeleton variant="text" width={70} sx={{ fontSize: '13px', display: { xs: 'none', sm: 'block' } }} />
                        <Skeleton variant="text" width={100} sx={{ fontSize: '13px', display: { xs: 'none', sm: 'block' } }} />
                      </Box>
                    </Box>
                  </Box>
                  {/* Action buttons skeleton */}
                  <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                    <Skeleton variant="rounded" width={140} height={36} sx={{ borderRadius: '8px' }} />
                    <Skeleton variant="rounded" width={140} height={36} sx={{ borderRadius: '8px', display: { xs: 'none', sm: 'block' } }} />
                  </Box>
                </Box>
              </Card>
            ))}
          </Box>
        )}

        {/* Empty State */}
        {!loading && candidates.length === 0 && (
          <Card sx={{ p: 6, textAlign: 'center', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <Box sx={{
              width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #f59e0b20, #d9770620)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2
            }}>
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

        {/* No Search Results */}
        {!loading && candidates.length > 0 && filteredCandidates.length === 0 && searchQuery && (
          <Card sx={{ p: 6, textAlign: 'center', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <Box sx={{
              width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #64748b20, #94a3b820)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2
            }}>
              <i className="fas fa-search" style={{ fontSize: 24, color: '#64748b' }} />
            </Box>
            <Typography sx={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', mb: 1 }}>
              No candidates found
            </Typography>
            <Typography sx={{ fontSize: '14px', color: '#64748b', mb: 3 }}>
              No candidates match your search for "{searchQuery}". Try different keywords or clear the search.
            </Typography>
            <Button onClick={clearSearch} sx={{
              background: 'rgba(100, 116, 139, 0.1)', color: '#64748b',
              borderRadius: '10px', textTransform: 'none', fontWeight: 600,
              '&:hover': { background: 'rgba(100, 116, 139, 0.2)' }
            }}>
              <i className="fas fa-times" style={{ marginRight: 8 }} /> Clear Search
            </Button>
          </Card>
        )}

        {/* Candidate List */}
        {!loading && currentCandidates.map((candidate) => (
          <Card key={candidate.id} sx={{
            mb: 2, p: 0, borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white',
            transition: 'all 0.2s', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)', borderColor: '#f59e0b40' }
          }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, p: { xs: 2, sm: 2.5 }, gap: { xs: 1.5, sm: 2.5 } }}>
              {/* Top row: Avatar + Info */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2.5 }, flex: 1, minWidth: 0 }}>
                <Avatar sx={{
                  width: { xs: 40, sm: 48 }, height: { xs: 40, sm: 48 }, background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  fontSize: { xs: '16px', sm: '18px' }, fontWeight: 700, flexShrink: 0
                }}>
                  {candidate.applicant_name.charAt(0).toUpperCase()}
                </Avatar>

                {/* Info */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: { xs: '14px', sm: '15px' }, fontWeight: 600, color: '#1e293b' }}>
                      {candidate.applicant_name}
                    </Typography>
                    {getScoreDisplay(candidate)}
                  </Box>
                  <Box sx={{ display: 'flex', gap: { xs: 1.5, sm: 3 }, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: { xs: '12px', sm: '13px' }, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: { xs: '160px', sm: 'none' } }}>
                      <i className="fas fa-envelope" style={{ marginRight: 6, fontSize: 11 }} />{candidate.applicant_email}
                    </Typography>
                    {candidate.experience_years ? (
                      <Typography sx={{ fontSize: { xs: '12px', sm: '13px' }, color: '#64748b' }}>
                        <i className="fas fa-briefcase" style={{ marginRight: 6, fontSize: 11 }} />{candidate.experience_years} years
                      </Typography>
                    ) : null}
                    {candidate.current_position && (
                      <Typography sx={{ fontSize: { xs: '12px', sm: '13px' }, color: '#64748b', display: { xs: 'none', sm: 'block' } }}>
                        <i className="fas fa-user-tie" style={{ marginRight: 6, fontSize: 11 }} />{candidate.current_position}
                      </Typography>
                    )}
                    {candidate.parsed_skills.length > 0 && (
                      <Typography sx={{ fontSize: { xs: '12px', sm: '13px' }, color: '#64748b', display: { xs: 'none', sm: 'block' } }}>
                        <i className="fas fa-code" style={{ marginRight: 6, fontSize: 11 }} />{candidate.parsed_skills.slice(0, 3).join(', ')}{candidate.parsed_skills.length > 3 ? ` +${candidate.parsed_skills.length - 3}` : ''}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>

              {/* Actions */}
              <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                {/* Generate Questions */}
                {candidate.has_resume && !candidate.has_questions && (
                  <Button
                    size="small"
                    disabled={generatingFor === candidate.id}
                    onClick={() => handleGenerateQuestions(candidate)}
                    sx={{
                      minWidth: { xs: 'auto', sm: '140px' },
                      height: '36px',
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

                {/* Review Questions */}
                {candidate.has_questions && candidate.question_session_id && (
                  <Button
                    size="medium"
                    onClick={() => navigate(`/interview-outline/${candidate.question_session_id}?from=manage-candidates&jobId=${jobId}&jobTitle=${encodeURIComponent(jobTitle)}${interviewId ? `&interviewId=${interviewId}` : ''}`)}
                    sx={{
                      minWidth: { xs: 'auto', sm: '140px' },
                      height: '36px',
                      background: '#fef3c720',
                      color: '#d97706',
                      border: '1px solid #d9770640',
                      borderRadius: '8px', textTransform: 'none', fontWeight: 600, fontSize: '12px',
                      '&:hover': { background: '#fef3c740' }
                    }}
                  >
                    <i className="fas fa-list-check" style={{ marginRight: 6 }} />
                    Review Questions
                  </Button>
                )}

                {/* Upload Transcript */}
                {candidate.has_questions && !candidate.has_scores && (
                  <Button
                    size="small"
                    onClick={() => { setSelectedCandidate(candidate); setTranscriptDialogOpen(true) }}
                    sx={{
                      minWidth: { xs: 'auto', sm: '140px' },
                      height: '36px',
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
                    size="medium"
                    onClick={() => navigate(`/results?session=${candidate.session_id}`)}
                    sx={{
                      minWidth: { xs: 'auto', sm: '140px' },
                      height: '36px',
                      background: '#7c3aed17',
                      color: '#7C3AED',
                      border: '1px solid #7c3aedaf',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'none',
                      '&:hover': {
                        background: '#7c3aed3b',
                        borderColor: '#7c3aedaf',
                      }
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

        {/* Pagination - Fixed with blur on mobile only, normal on desktop */}
        <Box sx={{
          position: { xs: 'fixed', md: 'relative' },
          bottom: { xs: 0, md: 'auto' },
          left: { xs: 0, md: 'auto' },
          right: { xs: 0, md: 'auto' },
          zIndex: { xs: 1000, md: 1 },
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          py: 1.5,
          mt: { xs: 0, md: 3 },
          background: { xs: 'linear-gradient(to top, rgba(255,255,255,0.95) 60%, rgba(255,255,255,0))', md: 'transparent' },
          backdropFilter: { xs: 'blur(8px)', md: 'none' },
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>


            {/* Previous Button */}
            <Button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              sx={{
                minWidth: 'auto',
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: currentPage === 1 ? '#f1f5f9' : 'rgba(245, 158, 11, 0.1)',
                color: currentPage === 1 ? '#94a3b8' : '#f59e0b',
                border: `1px solid ${currentPage === 1 ? '#e2e8f0' : '#f59e0b40'}`,
                '&:hover': {
                  background: currentPage === 1 ? '#f1f5f9' : 'rgba(245, 158, 11, 0.2)',
                }
              }}
            >
              <i className="fas fa-chevron-left" style={{ fontSize: '12px' }} />
            </Button>

            {/* Page Numbers */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              {Array.from({ length: Math.min(Math.max(totalPages, 1), 7) }, (_, i) => {
                let pageNum;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (currentPage <= 4) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = currentPage - 3 + i;
                }

                return (
                  <Button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    sx={{
                      minWidth: 'auto',
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      background: currentPage === pageNum ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(245, 158, 11, 0.1)',
                      color: currentPage === pageNum ? 'white' : '#f59e0b',
                      border: `1px solid ${currentPage === pageNum ? 'transparent' : '#f59e0b40'}`,
                      fontWeight: 600,
                      fontSize: '14px',
                      '&:hover': {
                        background: currentPage === pageNum ? 'linear-gradient(135deg, #d97706, #b45309)' : 'rgba(245, 158, 11, 0.2)',
                      }
                    }}
                  >
                    {pageNum}
                  </Button>
                );
              })}

              {totalPages > 7 && currentPage < totalPages - 3 && (
                <>
                  <Typography sx={{ display: 'flex', alignItems: 'center', color: '#64748b', px: 1 }}>...</Typography>
                  <Button
                    onClick={() => handlePageChange(totalPages)}
                    sx={{
                      minWidth: 'auto',
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      background: 'rgba(245, 158, 11, 0.1)',
                      color: '#f59e0b',
                      border: '1px solid #f59e0b40',
                      fontWeight: 600,
                      fontSize: '14px',
                      '&:hover': {
                        background: 'rgba(245, 158, 11, 0.2)',
                      }
                    }}
                  >
                    {totalPages}
                  </Button>
                </>
              )}
            </Box>

            {/* Next Button */}
            <Button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= Math.max(totalPages, 1)}
              sx={{
                minWidth: 'auto',
                width: 40,
                height: 40,
                borderRadius: '10px',
                background: currentPage >= Math.max(totalPages, 1) ? '#f1f5f9' : 'rgba(245, 158, 11, 0.1)',
                color: currentPage >= Math.max(totalPages, 1) ? '#94a3b8' : '#f59e0b',
                border: `1px solid ${currentPage >= Math.max(totalPages, 1) ? '#e2e8f0' : '#f59e0b40'}`,
                '&:hover': {
                  background: currentPage >= Math.max(totalPages, 1) ? '#f1f5f9' : 'rgba(245, 158, 11, 0.2)',
                }
              }}
            >
              <i className="fas fa-chevron-right" style={{ fontSize: '12px' }} />
            </Button>
          </Box>
        </Box>



        {/* ─── Add Candidate Dialog ─── */}
        <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth
          PaperProps={{ sx: { borderRadius: '16px' } }}>
          <DialogTitle sx={{ fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #e2e8f0', pb: 2 }}>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white'
              }}>
                <i className="fas fa-user-plus" />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '18px', fontWeight: 700 }}>
                  Add Candidate
                </Typography>
                <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                  Add candidate details and upload resume
                </Typography>

              </Box>
            </Box>
          </DialogTitle>
          <DialogContent sx={{ pt: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
              <TextField label="Full Name" required value={addForm.name}
                onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                InputLabelProps={{
                  sx: {
                    top: '50%',
                    left: "10px",
                    transform: 'translateY(-50%)',
                    '&.Mui-focused': {
                      top: 0,
                      transform: 'translateY(-50%) scale(0.75)',
                    },
                    '&.MuiInputLabel-shrink': {
                      top: 0,
                      transform: 'translateY(-50%) scale(0.75)',
                    },
                  },
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: '44px' }, }} />
              <TextField label="Email" type="email" required value={addForm.email}
                onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                InputLabelProps={{
                  sx: {
                    top: '50%',
                    left: "10px",
                    transform: 'translateY(-50%)',
                    '&.Mui-focused': {
                      top: 0,
                      transform: 'translateY(-50%) scale(0.75)',
                    },
                    '&.MuiInputLabel-shrink': {
                      top: 0,
                      transform: 'translateY(-50%) scale(0.75)',
                    },
                  },
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: "44px" } }} />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Phone" value={addForm.phone}
                  onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                  InputLabelProps={{
                  sx: {
                    top: '50%',
                    left: "10px",
                    transform: 'translateY(-50%)',
                    '&.Mui-focused': {
                      top: 0,
                      transform: 'translateY(-50%) scale(0.75)',
                    },
                    '&.MuiInputLabel-shrink': {
                      top: 0,
                      transform: 'translateY(-50%) scale(0.75)',
                    },
                  },
                }}
                  sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '10px', height: "44px" } }} />
                <TextField label="Experience (years)" type="number" value={addForm.experience_years}
                  onChange={e => setAddForm({ ...addForm, experience_years: e.target.value })}
                  InputLabelProps={{
                  sx: {
                    top: '50%',
                    left: "10px",
                    transform: 'translateY(-50%)',
                    '&.Mui-focused': {
                      top: 0,
                      transform: 'translateY(-50%) scale(0.75)',
                    },
                    '&.MuiInputLabel-shrink': {
                      top: 0,
                      transform: 'translateY(-50%) scale(0.75)',
                    },
                  },
                }}
                  sx={{ width: 160, '& .MuiOutlinedInput-root': { borderRadius: '10px', height: "44px" } }} />
              </Box>
              <TextField label="Current Position" value={addForm.current_position}
              InputLabelProps={{
                  sx: {
                    top: '50%',
                    left: "10px",
                    transform: 'translateY(-50%)',
                    '&.Mui-focused': {
                      top: 0,
                      transform: 'translateY(-50%) scale(0.75)',
                    },
                    '&.MuiInputLabel-shrink': {
                      top: 0,
                      transform: 'translateY(-50%) scale(0.75)',
                    },
                  },
                }}
                onChange={e => setAddForm({ ...addForm, current_position: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', height: "44px" } }} />
              {/* Resume Upload */}
              <Box sx={{
                border: '2px dashed #cbd5e1', borderRadius: '12px', p: 3, textAlign: 'center',
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
            <Button onClick={() => setAddDialogOpen(false)} sx={{
              color: '#64748b',
              textTransform: 'none',
              px: 3,
              height: '40px',
              borderRadius: '10px',
              '&:hover': { background: '#f1f5f9' }
            }}>Cancel</Button>
            <Button onClick={handleAddCandidate} disabled={submitting}
              sx={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white',
                borderRadius: '10px', textTransform: 'none', fontWeight: 600, px: 3, height: "40px",
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
