import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Button,
  LinearProgress,
  Avatar,
} from '@mui/material'
import Navigation from '../layout/sidebar'
import { interviewService, InterviewSession, InterviewListItem } from '../../services/interviewService'

const Results = () => {
  const [searchParams] = useSearchParams()
  const sessionIdParam = searchParams.get('session')

  const [sessions, setSessions] = useState<InterviewListItem[]>([])
  const [selectedSession, setSelectedSession] = useState<InterviewSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      if (sessionIdParam) {
        const session = await interviewService.getResults(Number(sessionIdParam))
        setSelectedSession(session)
      }
      const list = await interviewService.listInterviews()
      setSessions(list)
    } catch (err: any) {
      console.error('Error loading results:', err)
      setError('Failed to load interview results. Make sure you are logged in.')
    } finally {
      setLoading(false)
    }
  }

  const viewSession = async (id: number) => {
    try {
      setLoading(true)
      const session = await interviewService.getResults(id)
      setSelectedSession(session)
    } catch {
      setError('Failed to load session details.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const scoreColor = (score: number | null | undefined) => {
    if (score == null) return { bg: '#f1f5f9', text: '#64748b' }
    if (score >= 7.5) return { bg: '#dcfce7', text: '#166534' }
    if (score >= 5) return { bg: '#fef3c7', text: '#92400e' }
    return { bg: '#fef2f2', text: '#991b1b' }
  }

  const recChip = (rec: string | null | undefined) => {
    switch (rec) {
      case 'select':
        return { label: 'Selected', bg: '#dcfce7', color: '#166534', icon: 'fas fa-check-circle' }
      case 'next_round':
        return { label: 'Next Round', bg: '#dbeafe', color: '#1e40af', icon: 'fas fa-forward' }
      case 'reject':
        return { label: 'Rejected', bg: '#fef2f2', color: '#991b1b', icon: 'fas fa-times-circle' }
      default:
        return { label: 'Pending', bg: '#f1f5f9', color: '#64748b', icon: 'fas fa-clock' }
    }
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Navigation>
        <Box sx={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
          <Box sx={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#fef3c7,#fde68a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fas fa-spinner fa-spin" style={{ color: '#d97706', fontSize: 20 }}></i>
          </Box>
          <Typography sx={{ fontSize: '14px', color: '#64748b' }}>Loading results...</Typography>
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
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Back button */}
        {sessions.length > 1 && (
          <Button
            onClick={() => setSelectedSession(null)}
            sx={{
              alignSelf: 'flex-start',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '13px',
              color: '#64748b',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              '&:hover': { background: '#f8fafc' },
            }}
          >
            <i className="fas fa-arrow-left" style={{ marginRight: 8 }}></i> Back to list
          </Button>
        )}

        {/* Score overview card */}
        <Card sx={{ borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <Box sx={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '10px', background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '18px' }}>
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
              icon={<i className={rec.icon} style={{ fontSize: 12, color: rec.color }}></i>}
              label={rec.label}
              sx={{ fontWeight: 700, fontSize: '12px', backgroundColor: rec.bg, color: rec.color, height: '30px', '& .MuiChip-icon': { marginLeft: '8px' } }}
            />
          </Box>

          <CardContent sx={{ padding: '24px' }}>
            {/* Top row: score + candidate info */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '200px 1fr' }, gap: '24px', mb: '24px' }}>
              {/* Score circle */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Box
                  sx={{
                    width: 120,
                    height: 120,
                    borderRadius: '50%',
                    border: `6px solid ${sc.bg}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#fff',
                  }}
                >
                  <Typography sx={{ fontSize: '32px', fontWeight: 800, color: sc.text, lineHeight: 1 }}>
                    {selectedSession.overall_score != null ? selectedSession.overall_score.toFixed(1) : '--'}
                  </Typography>
                  <Typography sx={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>out of 10</Typography>
                </Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: sc.text, mt: '8px' }}>
                  {selectedSession.overall_score != null && selectedSession.overall_score >= 7.5
                    ? 'Excellent'
                    : selectedSession.overall_score != null && selectedSession.overall_score >= 5
                      ? 'Good'
                      : 'Needs Improvement'}
                </Typography>
              </Box>

              {/* Candidate info + strengths / weaknesses */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '16px' }}>
                  <Avatar sx={{ width: 44, height: 44, background: 'linear-gradient(135deg,#f59e0b,#d97706)', fontSize: '16px' }}>
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

        {/* Per-question breakdown */}
        {selectedSession.answers && selectedSession.answers.length > 0 && (
          <Card sx={{ borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <Box sx={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: 'rgba(245,158,11,0.06)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-list-ol" style={{ color: '#f59e0b', fontSize: 14 }}></i>
              <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                Answer Breakdown
              </Typography>
            </Box>
            <CardContent sx={{ padding: '16px 24px' }}>
              {selectedSession.answers.map((answer, idx) => {
                const asc = scoreColor(answer.score)
                return (
                  <Box
                    key={answer.id}
                    sx={{
                      padding: '16px 0',
                      borderBottom: idx < selectedSession.answers.length - 1 ? '1px solid #f1f5f9' : 'none',
                    }}
                  >
                    {/* Question header */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: '10px' }}>
                      <Box sx={{ flex: 1, pr: '16px' }}>
                        <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', mb: '2px' }}>
                          <Box component="span" sx={{ color: '#f59e0b', fontWeight: 700, mr: '6px' }}>Q{idx + 1}.</Box>
                          {answer.question_text || 'Question'}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          minWidth: 52,
                          height: 52,
                          borderRadius: '12px',
                          background: asc.bg,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Typography sx={{ fontSize: '18px', fontWeight: 800, color: asc.text, lineHeight: 1 }}>
                          {answer.score != null ? answer.score.toFixed(1) : '--'}
                        </Typography>
                        <Typography sx={{ fontSize: '9px', color: asc.text, opacity: 0.7 }}>/10</Typography>
                      </Box>
                    </Box>

                    {/* Answer text */}
                    <Box sx={{ padding: '10px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #f1f5f9', mb: '10px' }}>
                      <Typography sx={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                        {answer.answer_text}
                      </Typography>
                    </Box>

                    {/* Feedback */}
                    {answer.feedback && (
                      <Typography sx={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', mb: '10px', pl: '2px' }}>
                        <i className="fas fa-comment-dots" style={{ marginRight: 6, color: '#f59e0b', fontSize: 11 }}></i>
                        {answer.feedback}
                      </Typography>
                    )}

                    {/* Dimension bars */}
                    {answer.relevance_score != null && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px' }}>
                        {[
                          { label: 'Relevance', value: answer.relevance_score },
                          { label: 'Completeness', value: answer.completeness_score },
                          { label: 'Accuracy', value: answer.accuracy_score },
                          { label: 'Clarity', value: answer.clarity_score },
                        ].map((dim) => (
                          <Box key={dim.label}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: '4px' }}>
                              <Typography sx={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                {dim.label}
                              </Typography>
                              <Typography sx={{ fontSize: '10px', fontWeight: 700, color: scoreColor(dim.value).text }}>
                                {dim.value ?? '--'}
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={(dim.value ?? 0) * 10}
                              sx={{
                                height: 5,
                                borderRadius: 3,
                                backgroundColor: '#f1f5f9',
                                '& .MuiLinearProgress-bar': {
                                  borderRadius: 3,
                                  background:
                                    (dim.value ?? 0) >= 7.5
                                      ? 'linear-gradient(90deg,#10b981,#059669)'
                                      : (dim.value ?? 0) >= 5
                                        ? 'linear-gradient(90deg,#f59e0b,#d97706)'
                                        : 'linear-gradient(90deg,#ef4444,#dc2626)',
                                },
                              }}
                            />
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Integrity check */}
        <Card sx={{ borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <Box sx={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: 'rgba(245,158,11,0.06)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-shield-alt" style={{ color: '#f59e0b', fontSize: 14 }}></i>
            <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
              Integrity Check
            </Typography>
          </Box>
          <CardContent sx={{ padding: '16px 24px' }}>
            {[
              { label: 'Voice Consistency', icon: 'fas fa-microphone' },
              { label: 'Lip/Body Movement', icon: 'fas fa-user-check' },
              { label: 'Background Analysis', icon: 'fas fa-desktop' },
            ].map((check) => (
              <Box key={check.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: '8px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className={check.icon} style={{ color: '#16a34a', fontSize: 13 }}></i>
                  </Box>
                  <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>{check.label}</Typography>
                </Box>
                <Chip label="Passed" size="small" sx={{ fontSize: '11px', fontWeight: 600, backgroundColor: '#dcfce7', color: '#166534', height: '24px' }} />
              </Box>
            ))}
          </CardContent>
        </Card>
      </Box>
    )
  }

  // ─── List View ───────────────────────────────────────────────────────────────
  const renderList = () => (
    <Card sx={{ borderRadius: '16px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <Box sx={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <i className="fas fa-list" style={{ color: '#f59e0b', fontSize: 14 }}></i>
        <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>All Interviews</Typography>
      </Box>
      <CardContent sx={{ padding: '16px 24px' }}>
        {error && (
          <Box sx={{ padding: '12px 16px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '13px', mb: '16px' }}>
            <i className="fas fa-exclamation-circle" style={{ marginRight: 8 }}></i>{error}
          </Box>
        )}

        {sessions.length === 0 ? (
          <Box sx={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
            <Box sx={{ fontSize: '40px', mb: '12px', opacity: 0.4 }}>
              <i className="fas fa-inbox"></i>
            </Box>
            <Typography sx={{ fontSize: '14px', fontWeight: 500 }}>No interview results yet</Typography>
            <Typography sx={{ fontSize: '12px', mt: '4px' }}>Complete an interview to see results here.</Typography>
          </Box>
        ) : (
          sessions.map((s) => {
            const rec = recChip(s.recommendation)
            const sc = scoreColor(s.overall_score)
            return (
              <Box
                key={s.id}
                onClick={() => viewSession(s.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 0',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  '&:hover': { background: '#fefce8', margin: '0 -24px', padding: '16px 24px', borderRadius: '10px' },
                  '&:last-child': { borderBottom: 'none' },
                }}
              >
                {/* Left */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                  <Avatar sx={{ width: 42, height: 42, background: 'linear-gradient(135deg,#f59e0b,#d97706)', fontSize: '15px' }}>
                    <i className="fas fa-user"></i>
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.candidate_name || 'Candidate'}
                    </Typography>
                    <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                      {s.job_title || 'Position'} &middot; {s.answered_questions}/{s.total_questions} answered
                    </Typography>
                    {s.completed_at && (
                      <Typography sx={{ fontSize: '11px', color: '#94a3b8' }}>
                        {new Date(s.completed_at).toLocaleDateString()}
                      </Typography>
                    )}
                  </Box>
                </Box>

                {/* Right: score + rec */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  {s.overall_score != null && (
                    <Box sx={{ width: 48, height: 48, borderRadius: '12px', background: sc.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <Typography sx={{ fontSize: '16px', fontWeight: 800, color: sc.text, lineHeight: 1 }}>
                        {s.overall_score.toFixed(1)}
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
                        fontSize: '11px',
                        backgroundColor: rec.bg,
                        color: rec.color,
                        height: '26px',
                      }}
                    />
                  )}
                  <i className="fas fa-chevron-right" style={{ color: '#cbd5e1', fontSize: 12 }}></i>
                </Box>
              </Box>
            )
          })
        )}
      </CardContent>
    </Card>
  )

  // ─── Main Render ─────────────────────────────────────────────────────────────
  return (
    <Navigation>
      <Box sx={{ padding: '24px', background: '#f8fafc', minHeight: '100%' }}>
        <Box sx={{ mb: '24px' }}>
          <Typography sx={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>
            <i className="fas fa-chart-bar" style={{ color: '#f59e0b', marginRight: 10 }}></i>
            Interview Results
          </Typography>
          <Typography sx={{ fontSize: '13px', color: '#64748b', mt: '4px' }}>
            {selectedSession
              ? `Viewing results for ${selectedSession.candidate_name || 'candidate'}`
              : `${sessions.length} interview${sessions.length !== 1 ? 's' : ''} completed`}
          </Typography>
        </Box>

        {selectedSession ? renderDetail() : renderList()}
      </Box>
    </Navigation>
  )
}

export default Results
