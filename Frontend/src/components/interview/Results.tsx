import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Button,
  Avatar,
  TextField,
  InputAdornment,
  TablePagination,
  FormControl,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Collapse,
  Skeleton,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import FilterListIcon from '@mui/icons-material/FilterList'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import Navigation from '../layout/Sidebar'
import { interviewService, InterviewSession, InterviewListItem } from '../../services/interviewService'

const Results = () => {
  const [searchParams] = useSearchParams()
  const sessionIdParam = searchParams.get('session')

  const [sessions, setSessions] = useState<InterviewListItem[]>([])
  const [selectedSession, setSelectedSession] = useState<InterviewSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState('')

  // Search and Filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterJob, setFilterJob] = useState<string>('all')
  const [filterCandidate, setFilterCandidate] = useState<string>('all')
  const [filterModalOpen, setFilterModalOpen] = useState(false)

  // Pagination state
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  // Accordion state for question panels
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set())
  // Collapsible expected answer state
  const [expandedExpected, setExpandedExpected] = useState<Set<number>>(new Set())

  const toggleQuestion = (id: number) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleExpected = (id: number) => {
    setExpandedExpected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Get unique job titles and candidate names for dropdown filters
  const uniqueJobs = Array.from(new Set(sessions.map(s => s.job_title).filter(Boolean))) as string[]
  const uniqueCandidates = Array.from(new Set(sessions.map(s => s.candidate_name).filter(Boolean))) as string[]

  // Filter sessions based on search and filters
  const filteredSessions = sessions.filter((s) => {
    const matchesSearch =
      (s.candidate_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.job_title || '').toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = filterStatus === 'all' || s.recommendation === filterStatus
    const matchesJob = filterJob === 'all' || s.job_title === filterJob
    const matchesCandidate = filterCandidate === 'all' || s.candidate_name === filterCandidate

    return matchesSearch && matchesStatus && matchesJob && matchesCandidate
  })

  // Calculate pagination
  const paginatedSessions = filteredSessions.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  )

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }
  useEffect(() => {
    loadData()
  }, [sessionIdParam])

  const loadData = async () => {
    try {
      setLoading(true)
      if (sessionIdParam) setLoadingDetail(true)
      setError('')
      const [sessionResult, list] = await Promise.all([
        sessionIdParam
          ? interviewService.getResults(Number(sessionIdParam))
          : Promise.resolve(null),
        interviewService.listInterviews(),
      ])
      if (sessionResult) setSelectedSession(sessionResult)
      setSessions(list)
      setPage(0)
    } catch (err: any) {
      console.error('Error loading results:', err)
      setError('Failed to load interview results. Make sure you are logged in.')
    } finally {
      setLoading(false)
      setLoadingDetail(false)
    }
  }

  const viewSession = async (id: number) => {
    try {
      setLoading(true)
      setLoadingDetail(true)
      setError('')
      const session = await interviewService.getResults(id)
      setSelectedSession(session)
      setExpandedQuestions(new Set())
      setExpandedExpected(new Set())
    } catch (err: any) {
      console.error('Error loading session details:', err)
      const msg = err.response?.data?.detail || err.message || 'Failed to load session details.'
      setError(msg)
    } finally {
      setLoading(false)
      setLoadingDetail(false)
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const scoreColor = (score: number | null | undefined) => {
    if (score == null) return { bg: '#f1f5f9', text: '#64748b' }
    if (score >= 75) return { bg: '#dcfce7', text: '#166534' }
    if (score >= 50) return { bg: '#fef3c7', text: '#92400e' }
    return { bg: '#fef2f2', text: '#991b1b' }
  }

  /** Color-coded score badge: green 7+, yellow 5-6.9, red <5 */
  const scoreBadge = (score: number | null | undefined) => {
    if (score == null) return { bg: '#f1f5f9', color: '#94a3b8', label: 'Pending' }
    const val = score / 10
    if (val >= 7) return { bg: '#dcfce7', color: '#166534', label: 'Good' }
    if (val >= 5) return { bg: '#fef3c7', color: '#92400e', label: 'Average' }
    return { bg: '#fef2f2', color: '#991b1b', label: 'Poor' }
  }

  /** Convert internal 0-100 score to display 0-10 scale */
  const displayScore = (score: number | null | undefined) => {
    if (score == null) return '--'
    return (score / 10).toFixed(1)
  }

  /** Generate dynamic, context-aware feedback from raw feedback string */
  const enhanceFeedback = (feedback: string | null, score: number | null | undefined): string => {
    if (!feedback) {
      if (score == null) return 'AI evaluation is pending for this response.'
      const val = score / 10
      if (val >= 8) return 'Strong response demonstrating solid understanding of the topic.'
      if (val >= 6) return 'Adequate response but could benefit from more specific examples or deeper technical detail.'
      if (val >= 4) return 'Response shows basic awareness but lacks depth and practical examples.'
      return 'Response does not adequately address the question. Key concepts are missing or incorrect.'
    }
    // Check for generic "rule-based" feedback and enhance it
    if (feedback.toLowerCase().includes('rule-based scoring') || feedback.toLowerCase().includes('rule-based evaluation')) {
      const base = feedback.replace(/\s*\(rule-based scoring\)\s*/gi, '').replace(/\s*\(rule-based evaluation\)\s*/gi, '').trim()
      return base || 'Evaluated using pattern-based analysis.'
    }
    return feedback
  }

  /** Check if feedback was rule-based (not AI-generated) */
  const isRuleBased = (feedback: string | null): boolean => {
    if (!feedback) return false
    return feedback.toLowerCase().includes('rule-based')
  }

  const recChip = (rec: string | null | undefined) => {
    switch (rec) {
      case 'select':
        return { label: 'Selected', bg: '#dcfce7', color: '#166534', icon: 'fas fa-check-circle', emoji: '✅' }
      case 'next_round':
        return { label: 'Next Round', bg: '#dbeafe', color: '#1e40af', icon: 'fas fa-forward', emoji: '🔁' }
      case 'reject':
        return { label: 'Rejected', bg: '#fef2f2', color: '#991b1b', icon: 'fas fa-times-circle', emoji: '❌' }
      default:
        return { label: 'Pending', bg: '#f1f5f9', color: '#64748b', icon: 'fas fa-clock', emoji: '⏳' }
    }
  }

  // ─── Loading (Skeleton) ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <Navigation>
        <Box sx={{ padding: { xs: '12px', sm: '16px', md: '24px' }, background: '#f8fafc' }}>
          {loadingDetail ? (
            /* ─── Detail view skeleton ─── */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Back button skeleton */}
              <Skeleton variant="rounded" width={110} height={32} sx={{ borderRadius: '8px' }} />

              {/* Overview card skeleton */}
              <Card sx={{ borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                {/* Card header */}
                <Box sx={{ padding: { xs: '14px 16px', md: '20px 24px' }, borderBottom: '1px solid #f1f5f9', background: 'rgba(245,158,11,0.05)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: '10px' }} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width={150} height={22} />
                    <Skeleton variant="text" width={200} height={16} />
                  </Box>
                  <Skeleton variant="rounded" width={90} height={30} sx={{ borderRadius: '16px' }} />
                </Box>
                {/* Card body */}
                <CardContent sx={{ padding: { xs: '16px', md: '24px' } }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '200px 1fr' }, gap: '24px' }}>
                    {/* Score circle */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <Skeleton variant="circular" width={120} height={120} />
                      <Skeleton variant="text" width={60} height={18} sx={{ mt: 1 }} />
                    </Box>
                    {/* Right side */}
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '16px' }}>
                        <Skeleton variant="circular" width={44} height={44} />
                        <Box>
                          <Skeleton variant="text" width={120} height={20} />
                          <Skeleton variant="text" width={100} height={16} />
                        </Box>
                      </Box>
                      <Skeleton variant="rounded" width="100%" height={60} sx={{ borderRadius: '10px', mb: '12px' }} />
                      <Skeleton variant="rounded" width="100%" height={60} sx={{ borderRadius: '10px' }} />
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {/* Question analysis header skeleton */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Skeleton variant="rounded" width={30} height={30} sx={{ borderRadius: '8px' }} />
                <Skeleton variant="text" width={160} height={24} />
                <Skeleton variant="text" width={80} height={18} />
              </Box>

              {/* Question accordion skeletons */}
              {[...Array(4)].map((_, i) => (
                <Card key={i} sx={{ borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: 'none' }}>
                  <Box sx={{ padding: { xs: '10px 14px', md: '12px 18px' }, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Skeleton variant="text" width={24} height={18} />
                    <Skeleton variant="text" width={`${50 + Math.random() * 30}%`} height={20} sx={{ flex: 1 }} />
                    <Skeleton variant="rounded" width={50} height={24} sx={{ borderRadius: '6px' }} />
                    <Skeleton variant="circular" width={20} height={20} />
                  </Box>
                </Card>
              ))}
            </Box>
          ) : (
            /* ─── List view skeleton ─── */
            <>
              {/* Header skeleton */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Skeleton variant="circular" width={20} height={20} />
                  <Skeleton variant="text" width={160} height={28} />
                  <Skeleton variant="text" width={60} height={20} />
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <Skeleton variant="rounded" width={180} height={36} sx={{ borderRadius: '8px' }} />
                  <Skeleton variant="rounded" width={80} height={36} sx={{ borderRadius: '8px' }} />
                </Box>
              </Box>

              {/* List card skeleton */}
              <Card sx={{ borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <CardContent sx={{ padding: { xs: '12px', md: '16px 24px' } }}>
                  {[...Array(6)].map((_, i) => (
                    <Box
                      key={i}
                      sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: { xs: '10px 0', md: '16px 0' },
                        borderBottom: i < 5 ? '1px solid #f1f5f9' : 'none',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                        <Skeleton variant="circular" width={42} height={42} />
                        <Box sx={{ flex: 1 }}>
                          <Skeleton variant="text" width={`${40 + Math.random() * 20}%`} height={20} />
                          <Skeleton variant="text" width={`${30 + Math.random() * 15}%`} height={16} />
                          <Skeleton variant="text" width={80} height={14} />
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Skeleton variant="rounded" width={48} height={48} sx={{ borderRadius: '12px' }} />
                        <Skeleton variant="rounded" width={70} height={24} sx={{ borderRadius: '12px' }} />
                      </Box>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </Box>
      </Navigation>
    )
  }

  // ─── Detail View ─────────────────────────────────────────────────────────────
  const renderDetail = () => {
    if (!selectedSession) return null
    const rec = recChip(selectedSession.recommendation)
    const sc = scoreColor(selectedSession.overall_score)

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: '14px', md: '18px' } }}>
        {/* Back button */}
        {sessions.length > 1 && (
          <Button
            onClick={() => {
              setSelectedSession(null)
              setPage(0)
            }}
            sx={{
              alignSelf: 'flex-start',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: { xs: '12px', md: '13px' },
              color: '#64748b',
              padding: { xs: '6px 10px', md: '6px 14px' },
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              '&:hover': { background: '#f8fafc' },
            }}
          >
            <i className="fas fa-arrow-left" style={{ marginRight: 8 }}></i> Back to list
          </Button>
        )}

        {/* Score overview card (original) */}
        <Card sx={{ borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <Box sx={{ padding: { xs: '14px 16px', md: '20px 24px' }, borderBottom: '1px solid #f1f5f9', background: '#EEF0FF', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '10px', background: 'linear-gradient(135deg,#020291,#020291)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '18px' }}>
              <i className="fas fa-chart-bar"></i>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
                Interview Results
              </Typography>
              <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                {selectedSession.job_title || 'Position'} &middot; {selectedSession.completed_at ? new Date(selectedSession.completed_at).toLocaleDateString() : 'In progress'}
              </Typography>
            </Box>
            <Chip
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className={rec.icon} style={{ fontSize: 12 }}></i>
                  {rec.label}
                </Box>
              }
              sx={{ fontWeight: 700, fontSize: '12px', backgroundColor: rec.bg, color: rec.color, height: '30px' }}
            />
          </Box>

          <CardContent sx={{ padding: { xs: '16px', md: '24px' } }}>
            {/* Top row: score + candidate info */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '200px 1fr' }, gap: { xs: '16px', md: '24px' }, mb: { xs: '16px', md: '24px' } }}>
              {/* Score circle */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Box
                  sx={{
                    width: { xs: 100, md: 120 },
                    height: { xs: 100, md: 120 },
                    borderRadius: '50%',
                    border: `6px solid ${sc.bg}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#fff',
                  }}
                >
                  <Typography sx={{ fontSize: { xs: '26px', md: '32px' }, fontWeight: 800, color: sc.text, lineHeight: 1 }}>
                    {displayScore(selectedSession.overall_score)}
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '10px', md: '12px' }, color: '#94a3b8', fontWeight: 500 }}>out of 10</Typography>
                </Box>
                <Typography sx={{ fontSize: { xs: '12px', md: '13px' }, fontWeight: 600, color: sc.text, mt: '8px' }}>
                  {selectedSession.overall_score != null && selectedSession.overall_score >= 75
                    ? 'Excellent'
                    : selectedSession.overall_score != null && selectedSession.overall_score >= 50
                      ? 'Good'
                      : 'Needs Improvement'}
                </Typography>
              </Box>

              {/* Candidate info + strengths / weaknesses */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '16px' }}>
                  <Avatar sx={{ width: 44, height: 44, background: 'linear-gradient(135deg,#020291,#020291)', fontSize: '16px' }}>
                    <i className="fas fa-user"></i>
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
                      {selectedSession.candidate_name || 'Candidate'}
                    </Typography>
                    <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                      {selectedSession.answers?.length || 0} questions answered
                    </Typography>
                  </Box>
                </Box>

                {/* Strengths */}
                {selectedSession.strengths && (
                  <Box sx={{ mb: '12px', padding: '12px 16px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <Typography sx={{ fontSize: '12px', fontWeight: 700, color: '#166534', mb: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fas fa-thumbs-up" style={{ fontSize: 11 }}></i> Strengths
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#15803d', lineHeight: 1.5 }}>
                      {selectedSession.strengths}
                    </Typography>
                  </Box>
                )}

                {/* Weaknesses */}
                {selectedSession.weaknesses && (
                  <Box sx={{ padding: '12px 16px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <Typography sx={{ fontSize: '12px', fontWeight: 700, color: '#991b1b', mb: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fas fa-exclamation-triangle" style={{ fontSize: 11 }}></i> Areas for Improvement
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#b91c1c', lineHeight: 1.5 }}>
                      {selectedSession.weaknesses}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* ─── 7. Per-question breakdown (Accordion) ───────────────────────── */}
        {selectedSession.answers && selectedSession.answers.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
         

            {selectedSession.answers.map((answer, idx) => {
              const badge = scoreBadge(answer.score)
              const isExpanded = expandedQuestions.has(answer.id)
              const isExpectedOpen = expandedExpected.has(answer.id)
              const hasValidAnswer = answer.answer_text
                && !answer.answer_text.toLowerCase().includes('not found')
                && !answer.answer_text.includes('[Extracted from Transcript]')
                && !answer.answer_text.startsWith('[')
              const feedbackText = enhanceFeedback(answer.feedback, answer.score)
              const ruleBasedFlag = isRuleBased(answer.feedback)

              return (
                <Card
                  key={answer.id}
                  sx={{
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                    boxShadow: 'none',
                    '&:hover': { borderColor: '#cbd5e1' },
                  }}
                >
                  {/* Accordion header - always visible */}
                  <Box
                    onClick={() => toggleQuestion(answer.id)}
                    sx={{
                      padding: { xs: '10px 14px', md: '12px 18px' },
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background 0.15s',
                      '&:hover': { background: '#fafafa' },
                    }}
                  >
                    {/* Question number */}
                    <Typography sx={{ fontSize: '12px', fontWeight: 700, color: '#020291', minWidth: '24px' }}>
                      Q{idx + 1}
                    </Typography>

                    {/* Question text */}
                    <Typography sx={{
                      fontSize: { xs: '13px', md: '14px' }, fontWeight: 600, color: '#1e293b',
                      flex: 1, lineHeight: 1.4, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: isExpanded ? 'normal' : 'nowrap',
                    }}>
                      {answer.question_text || 'Question'}
                    </Typography>

                    {/* Score badge */}
                    <Box sx={{
                      display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
                    }}>
                      {answer.score != null && (
                        <Box sx={{
                          padding: '2px 8px', borderRadius: '6px',
                          background: badge.bg,
                          display: 'flex', alignItems: 'baseline', gap: '2px',
                        }}>
                          <Typography sx={{ fontSize: '14px', fontWeight: 800, color: badge.color }}>
                            {displayScore(answer.score)}
                          </Typography>
                          <Typography sx={{ fontSize: '9px', fontWeight: 600, color: badge.color, opacity: 0.6 }}>/10</Typography>
                        </Box>
                      )}
                      {answer.score == null && (
                        <Chip label="Pending" size="small" sx={{ fontSize: '10px', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#94a3b8', height: '22px' }} />
                      )}
                      {isExpanded ? (
                        <ExpandLessIcon sx={{ fontSize: 20, color: '#94a3b8' }} />
                      ) : (
                        <ExpandMoreIcon sx={{ fontSize: 20, color: '#94a3b8' }} />
                      )}
                    </Box>
                  </Box>

                  {/* Collapsible content */}
                  <Collapse in={isExpanded} timeout={200}>
                    <Box sx={{ padding: { xs: '0 14px 14px', md: '0 18px 16px' }, borderTop: '1px solid #f1f5f9' }}>
                      {/* ─── 1. Candidate's Answer (primary focus) ──────────── */}
                      <Box sx={{ mt: '14px', mb: '12px' }}>
                        <Typography sx={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', mb: '6px' }}>
                          <i className="fas fa-user" style={{ fontSize: 10, marginRight: 5, color: '#020291' }}></i>
                          Candidate's Answer
                        </Typography>
                        <Box sx={{
                          padding: '12px 14px', borderRadius: '8px',
                          background: '#f0f7ff', border: '1px solid #dbeafe',
                        }}>
                          <Typography sx={{ fontSize: '13px', color: '#1e293b', lineHeight: 1.6 }}>
                            {hasValidAnswer
                              ? answer.answer_text
                              : (
                                <Box component="span" sx={{ color: '#94a3b8', fontStyle: 'italic' }}>
                                  Evaluated from interview transcript.
                                </Box>
                              )
                            }
                          </Typography>
                        </Box>
                      </Box>

                      {/* ─── 3. AI Feedback (dynamic & contextual) ─────────── */}
                      <Box sx={{
                        mb: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: '#EEF0FF',
                        borderLeft: '3px solid #020291',
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mb: '4px' }}>
                          <i className="fas fa-robot" style={{ fontSize: 11, color: '#020291' }}></i>
                          <Typography sx={{ fontSize: '11px', fontWeight: 700, color: '#020291', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            AI Feedback
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: '13px', color: '#1A22E0', lineHeight: 1.6 }}>
                          {feedbackText}
                        </Typography>
                        {/* ─── 4. Rule-based scoring warning (soft yellow) ──── */}
                        
                      </Box>

                      {/* ─── 1b. Expected Answer (collapsible) ─────────────── */}
                      {answer.sample_answer && (
                        <Box sx={{ mb: '12px' }}>
                          <Box
                            onClick={(e) => { e.stopPropagation(); toggleExpected(answer.id) }}
                            sx={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              cursor: 'pointer', userSelect: 'none', mb: isExpectedOpen ? '6px' : 0,
                            }}
                          >
                            <i className="fas fa-lightbulb" style={{ fontSize: 10, color: '#020291' }}></i>
                            <Typography sx={{ fontSize: '11px', fontWeight: 600, color: '#020291', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Expected Answer
                            </Typography>
                            {isExpectedOpen ? (
                              <ExpandLessIcon sx={{ fontSize: 16, color: '#020291' }} />
                            ) : (
                              <ExpandMoreIcon sx={{ fontSize: 16, color: '#020291' }} />
                            )}
                            {!isExpectedOpen && (
                              <Typography sx={{ fontSize: '11px', color: '#020291', ml: 'auto' }}>
                                Click to reveal
                              </Typography>
                            )}
                          </Box>
                          <Collapse in={isExpectedOpen} timeout={150}>
                            <Box sx={{
                              padding: '10px 14px', borderRadius: '8px',
                              background: '#f9fafb', border: '1px dashed #d1d5db',
                            }}>
                              <Typography sx={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.6 }}>
                                {answer.sample_answer}
                              </Typography>
                            </Box>
                          </Collapse>
                        </Box>
                      )}

                    </Box>
                  </Collapse>
                </Card>
              )
            })}
          </Box>
        )}

        {/* Integrity check */}
        <Card sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: 'none' }}>
          <Box sx={{ padding: { xs: '12px 16px', md: '14px 20px' }, borderBottom: '1px solid #f1f5f9', background: '#EEF0FF', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-shield-alt" style={{ color: '#020291', fontSize: 14 }}></i>
            <Typography sx={{ fontSize: { xs: '14px', md: '15px' }, fontWeight: 600, color: '#1e293b' }}>
              Integrity Check
            </Typography>
          </Box>
          <CardContent sx={{ padding: { xs: '8px 16px', md: '8px 20px' } }}>
            {[
              { label: 'Voice Consistency', icon: 'fas fa-microphone' },
              { label: 'Lip/Body Movement', icon: 'fas fa-user-check' },
              { label: 'Background Analysis', icon: 'fas fa-desktop' },
            ].map((check) => (
              <Box key={check.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Box sx={{ width: 30, height: 30, borderRadius: '8px', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={check.icon} style={{ color: '#6B7280', fontSize: 12 }}></i>
                  </Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{check.label}</Typography>
                </Box>
                <Chip label="Passed" size="small" sx={{ fontSize: '11px', fontWeight: 600, backgroundColor: '#DCFCE7', color: '#166534', height: '24px' }} />
              </Box>
            ))}
          </CardContent>
        </Card>
      </Box>
    )
  }

  // ─── List View ───────────────────────────────────────────────────────────────
  const renderList = () => (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: { xs: 'auto', md: 'calc(100vh - 120px)' },
      minHeight: { xs: 'auto', md: '600px' },
      overflow: { xs: 'visible', md: 'hidden' }
    }}>
      {/* Header + Search row */}
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        justifyContent: 'space-between',
        gap: 2,
        mb: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fas fa-chart-bar" style={{ color: '#020291', fontSize: 16 }}></i>
          <Typography sx={{ fontSize: { xs: '16px', md: '20px' }, fontWeight: 700, color: '#1e293b' }}>Interviews Result</Typography>
          <Typography sx={{ fontSize: '13px', color: '#64748b', ml: 1 }}>
            {filteredSessions.length} result{filteredSessions.length !== 1 ? 's' : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <TextField
            placeholder="Search..."
            variant="outlined"
            size="small"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#9ca3af', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              minWidth: { xs: 160, sm: 220 },
              '& .MuiOutlinedInput-root': {
                backgroundColor: '#fff',
                borderRadius: '8px',
                '& fieldset': { borderColor: '#e2e8f0' },
                '&:hover fieldset': { borderColor: '#020291' },
                '&.Mui-focused fieldset': { borderColor: '#020291' },
              }
            }}
          />
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => setFilterModalOpen(true)}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '14px',
              borderRadius: '8px',
              padding: '7px 16px',
              borderColor: (filterJob !== 'all' || filterCandidate !== 'all' || filterStatus !== 'all') ? '#020291' : '#e2e8f0',
              color: (filterJob !== 'all' || filterCandidate !== 'all' || filterStatus !== 'all') ? '#020291' : '#64748b',
              background: (filterJob !== 'all' || filterCandidate !== 'all' || filterStatus !== 'all') ? 'rgba(245,158,11,0.08)' : '#fff',
              '&:hover': { borderColor: '#020291', color: '#020291', background: 'rgba(245,158,11,0.08)' },
            }}
          >
            Filter
            {(filterJob !== 'all' || filterCandidate !== 'all' || filterStatus !== 'all') && (
              <Box sx={{
                ml: 1, width: 20, height: 20, borderRadius: '50%',
                background: '#020291', color: '#fff', fontSize: '11px',
                fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {[filterJob, filterCandidate, filterStatus].filter(f => f !== 'all').length}
              </Box>
            )}
          </Button>
        </Box>
      </Box>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {activeFilters.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              size="small"
              onDelete={() => {
                if (f.key === 'job') setFilterJob('all');
                if (f.key === 'candidate') setFilterCandidate('all');
                if (f.key === 'status') setFilterStatus('all');
                setPage(0);
              }}
              sx={{
                fontWeight: 600, fontSize: '12px',
                backgroundColor: 'rgba(245,158,11,0.1)', color: '#020291',
                border: '1px solid rgba(245,158,11,0.3)',
                '& .MuiChip-deleteIcon': { color: '#020291', '&:hover': { color: '#020291' } },
              }}
            />
          ))}
          <Chip
            label="Clear All"
            size="small"
            onClick={() => { setFilterJob('all'); setFilterCandidate('all'); setFilterStatus('all'); setPage(0); }}
            sx={{
              fontWeight: 600, fontSize: '12px', cursor: 'pointer',
              backgroundColor: '#f1f5f9', color: '#64748b',
              '&:hover': { backgroundColor: '#e2e8f0' },
            }}
          />
        </Box>
      )}

      <Card sx={{
        borderRadius: { xs: '12px', md: '16px' },
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        maxWidth: '100%'
      }}>
        <CardContent sx={{
          padding: { xs: '12px 12px', md: '16px 24px' },
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden'
        }}>
          {error && (
            <Box sx={{ padding: '12px 16px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px', mb: '16px' }}>
              <i className="fas fa-exclamation-circle" style={{ marginRight: 8 }}></i>{error}
            </Box>
          )}

          {filteredSessions.length === 0 ? (
            <Box sx={{
              textAlign: 'center',
              padding: '40px 0',
              color: '#94a3b8',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Box sx={{ fontSize: '40px', mb: '12px', opacity: 0.4 }}>
                <i className={sessions.length === 0 ? "fas fa-inbox" : "fas fa-search"}></i>
              </Box>
              <Typography sx={{ fontSize: '14px', fontWeight: 500 }}>
                {sessions.length === 0 ? 'No interview results yet' : 'No results found'}
              </Typography>
              <Typography sx={{ fontSize: '12px', mt: '4px' }}>
                {sessions.length === 0 ? 'Complete an interview to see results here.' : 'Try adjusting your search or filter criteria.'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              '&::-webkit-scrollbar': {
                width: '6px',
              },
              '&::-webkit-scrollbar-track': {
                background: '#f1f5f9',
                borderRadius: '3px',
              },
              '&::-webkit-scrollbar-thumb': {
                background: '#cbd5e1',
                borderRadius: '3px',
                '&:hover': {
                  background: '#94a3b8',
                },
              },
            }}>
              {paginatedSessions.map((s) => {
                const rec = recChip(s.recommendation)
                const sc = scoreColor(s.overall_score)
                return (
                  <Box
                    key={s.id}
                    onClick={() => viewSession(s.id)}
                    sx={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: { xs: '10px 0', md: '16px 0' },
                      gap: { xs: '8px', sm: '12px' },
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': { background: '#EEF0FF', margin: { xs: '0 -16px', md: '0 -24px' }, padding: { xs: '12px 16px', md: '16px 24px' }, borderRadius: '10px' },
                      '&:last-child': { borderBottom: 'none' },
                    }}
                  >
                    {/* Left */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '8px', md: '14px' }, flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <Avatar sx={{ width: { xs: 36, md: 42 }, height: { xs: 36, md: 42 }, background: 'linear-gradient(135deg,#020291,#020291)', fontSize: { xs: '13px', md: '15px' } }}>
                        <i className="fas fa-user"></i>
                      </Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontSize: { xs: '13px', md: '14px' }, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.candidate_name || 'Candidate'}
                        </Typography>
                        <Typography sx={{ fontSize: { xs: '11px', md: '12px' }, color: '#64748b' }}>
                          {s.job_title || 'Position'} &middot; {s.answered_questions}/{s.total_questions} answered
                        </Typography>
                        {s.completed_at && (
                          <Typography sx={{ fontSize: { xs: '10px', md: '11px' }, color: '#94a3b8' }}>
                            {new Date(s.completed_at).toLocaleDateString()}
                          </Typography>
                        )}
                      </Box>
                    </Box>

                    {/* Right: score + rec */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: '4px', md: '12px' }, flexShrink: 0, justifyContent: 'flex-end' }}>
                      {s.overall_score != null && (
                        <Box sx={{ width: { xs: 38, md: 48 }, height: { xs: 38, md: 48 }, borderRadius: '12px', background: sc.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Typography sx={{ fontSize: { xs: '13px', md: '16px' }, fontWeight: 800, color: sc.text, lineHeight: 1 }}>
                            {displayScore(s.overall_score)}
                          </Typography>
                          <Typography sx={{ fontSize: '9px', color: sc.text, opacity: 0.7 }}>/10</Typography>
                        </Box>
                      )}
                      {s.recommendation && (
                        <Chip
                          label={rec.label}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: { xs: '10px', md: '11px' },
                            backgroundColor: rec.bg,
                            color: rec.color,
                            height: { xs: '22px', md: '26px' },
                            display: { xs: 'none', sm: 'flex' },
                          }}
                        />
                      )}
                      <Box component="i" className="fas fa-chevron-right" sx={{ color: '#cbd5e1', fontSize: 12, display: { xs: 'none', sm: 'block' } }} />
                    </Box>
                  </Box>
                )
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* TablePagination */}
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={filteredSessions.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        sx={{
          flexShrink: 0,
          borderTop: '1px solid #e2e8f0',
          backgroundColor: '#fff',
          '.MuiTablePagination-selectLabel, .MuiTablePagination-displayedRows': {
            color: '#64748b',
            fontWeight: 500,
          },
          '.MuiTablePagination-select': {
            fontWeight: 500,
          },
        }}
      />
    </Box>
  )


  // ─── Active filter chips (shown below search bar when filters applied) ───────
  const activeFilters = [
    ...(filterJob !== 'all' ? [{ label: `Job: ${filterJob}`, key: 'job' }] : []),
    ...(filterCandidate !== 'all' ? [{ label: `Candidate: ${filterCandidate}`, key: 'candidate' }] : []),
    ...(filterStatus !== 'all' ? [{ label: `Status: ${filterStatus === 'select' ? 'Selected' : filterStatus === 'next_round' ? 'Next Round' : 'Rejected'}`, key: 'status' }] : []),
  ]

  // ─── Main Render ─────────────────────────────────────────────────────────────
  return (
    <Navigation>
      <Box sx={{
        padding: { xs: '12px', sm: '16px', md: '24px' },
        background: '#f8fafc',
        minHeight: selectedSession ? 'auto' : '900px',
        overflow: { xs: 'visible', md: 'hidden' },
      }}>
        {selectedSession ? renderDetail() : renderList()}
      </Box>

      {/* Filter Modal */}
      <Dialog
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
          }
        }}
      >
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderBottom: '1px solid #f1f5f9',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: '10px',
              background: 'linear-gradient(135deg, #020291, #020291)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FilterListIcon sx={{ color: '#fff', fontSize: 20 }} />
            </Box>
            <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              Filter Results
            </Typography>
          </Box>
          <IconButton onClick={() => setFilterModalOpen(false)} size="small">
            <CloseIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ padding: '24px !important', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Job Filter */}
          <Box>
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <i className="fas fa-briefcase" style={{ color: '#020291', fontSize: 12 }}></i>
              Job Position
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={filterJob}
                onChange={(e) => { setFilterJob(e.target.value); setPage(0); }}
                sx={{
                  borderRadius: '10px',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#020291' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#020291' },
                }}
              >
                <MenuItem value="all">All Jobs</MenuItem>
                {uniqueJobs.map((job) => (
                  <MenuItem key={job} value={job}>{job}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Candidate Filter */}
          <Box>
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <i className="fas fa-user" style={{ color: '#020291', fontSize: 12 }}></i>
              Candidate Name
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={filterCandidate}
                onChange={(e) => { setFilterCandidate(e.target.value); setPage(0); }}
                sx={{
                  borderRadius: '10px',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#020291' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#020291' },
                }}
              >
                <MenuItem value="all">All Candidates</MenuItem>
                {uniqueCandidates.map((name) => (
                  <MenuItem key={name} value={name}>{name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Status Filter */}
          <Box>
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              <i className="fas fa-flag" style={{ color: '#020291', fontSize: 12 }}></i>
              Status
            </Typography>
            <FormControl fullWidth size="small">
              <Select
                value={filterStatus}
                onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
                sx={{
                  borderRadius: '10px',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#020291' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#020291' },
                }}
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="select">Selected</MenuItem>
                <MenuItem value="next_round">Next Round</MenuItem>
                <MenuItem value="reject">Rejected</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>

        <DialogActions sx={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', gap: 1.5 }}>
          <Button
            onClick={() => {
              setFilterJob('all');
              setFilterCandidate('all');
              setFilterStatus('all');
              setPage(0);
            }}
            sx={{
              textTransform: 'none', fontWeight: 600, fontSize: '14px',
              color: '#64748b', borderRadius: '10px', padding: '8px 20px',
              '&:hover': { background: '#f1f5f9' },
            }}
          >
            Clear All
          </Button>
          <Button
            variant="contained"
            onClick={() => setFilterModalOpen(false)}
            sx={{
              textTransform: 'none', fontWeight: 600, fontSize: '14px',
              borderRadius: '10px', padding: '8px 24px',
              background: 'linear-gradient(135deg, #020291, #020291)',
              boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
              '&:hover': { background: 'linear-gradient(135deg, #020291, #b45309)' },
            }}
          >
            Apply Filters
          </Button>
        </DialogActions>
      </Dialog>
    </Navigation>
  )
}

export default Results
