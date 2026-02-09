import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Select,
  MenuItem,
  LinearProgress,
  Chip,
} from '@mui/material'
import Navigation from '../layout/sidebar'
import { apiClient } from '../../services/api'
import { interviewService, ApprovedQuestion } from '../../services/interviewService'

const Interview = () => {
  const navigate = useNavigate()
  const [selectedJob, setSelectedJob] = useState('')
  const [jobs, setJobs] = useState<any[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [questions, setQuestions] = useState<ApprovedQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    loadJobs()
  }, [])

  // Start camera when interview session begins, stop on unmount
  useEffect(() => {
    if (sessionId && questions.length > 0) {
      startCamera()
    }
    return () => {
      stopCamera()
    }
  }, [sessionId, questions.length])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraActive(true)
    } catch (err) {
      console.error('Camera access error:', err)
      setCameraActive(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  const loadJobs = async () => {
    try {
      const response = await apiClient.get('/api/jobs')
      setJobs(response.data)
    } catch (error) {
      console.error('Error loading jobs:', error)
    }
  }

  const startInterview = async () => {
    if (!selectedJob) {
      setMessage('Please select a job first.')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const data = await interviewService.getApprovedQuestions(Number(selectedJob))
      if (!data.questions || data.questions.length === 0) {
        setMessage('No approved questions found for this job. Please generate and approve questions first.')
        setLoading(false)
        return
      }
      const session = await interviewService.createSession(Number(selectedJob))
      setSessionId(session.id)
      setQuestions(data.questions)
      setCurrentQuestionIndex(0)
      setAnswers(new Array(data.questions.length).fill(''))
      setCurrentAnswer('')
      setMessage('')
    } catch (error: any) {
      console.error('Error starting interview:', error)
      setMessage(
        error?.response?.data?.detail ||
          'Failed to start interview. Make sure you are logged in and questions have been approved.'
      )
    } finally {
      setLoading(false)
    }
  }

  const saveCurrentAnswer = () => {
    const newAnswers = [...answers]
    newAnswers[currentQuestionIndex] = currentAnswer
    setAnswers(newAnswers)
  }

  const submitCurrentAnswer = async () => {
    if (!sessionId || !currentAnswer.trim()) return
    try {
      await interviewService.submitAnswer(sessionId, questions[currentQuestionIndex].id, currentAnswer)
    } catch (error) {
      console.error('Error submitting answer:', error)
    }
  }

  const previousQuestion = () => {
    if (currentQuestionIndex > 0) {
      saveCurrentAnswer()
      setCurrentQuestionIndex(currentQuestionIndex - 1)
      setCurrentAnswer(answers[currentQuestionIndex - 1] || '')
    }
  }

  const nextQuestion = async () => {
    saveCurrentAnswer()
    await submitCurrentAnswer()
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setCurrentAnswer(answers[currentQuestionIndex + 1] || '')
    } else {
      await finishInterview()
    }
  }

  const finishInterview = async () => {
    saveCurrentAnswer()
    setLoading(true)
    try {
      if (sessionId && currentAnswer.trim()) {
        await interviewService.submitAnswer(sessionId, questions[currentQuestionIndex].id, currentAnswer)
      }
      if (sessionId) {
        await interviewService.completeSession(sessionId)
      }
      stopCamera()
      setMessage('Interview completed! Redirecting to results...')
      setTimeout(() => navigate(`/results?session=${sessionId}`), 1500)
    } catch (error: any) {
      console.error('Error finishing interview:', error)
      setMessage('Error completing interview. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0

  const difficultyColor = (d: string) => {
    switch (d) {
      case 'basic':
        return { bg: '#dcfce7', text: '#166534' }
      case 'intermediate':
        return { bg: '#fef3c7', text: '#92400e' }
      case 'advanced':
        return { bg: '#fef2f2', text: '#991b1b' }
      default:
        return { bg: '#f1f5f9', text: '#475569' }
    }
  }

  // ─── Setup Screen ──────────────────────────────────────────────────────────
  const renderSetup = () => (
    <Box sx={{ maxWidth: 600, margin: '0 auto' }}>
      <Card
        sx={{
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            padding: '20px 24px',
            borderBottom: '1px solid #f1f5f9',
            background: 'rgba(245,158,11,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '10px',
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '18px',
            }}
          >
            <i className="fas fa-play-circle"></i>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
              Start Interview
            </Typography>
            <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
              Select a job to begin your AI-powered interview
            </Typography>
          </Box>
        </Box>

        <CardContent sx={{ padding: '28px 24px' }}>
          {/* Illustration */}
          <Box
            sx={{
              textAlign: 'center',
              padding: '24px 0 32px',
            }}
          >
            <Box
              sx={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'linear-gradient(135deg,#fef3c7,#fde68a)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '36px',
              }}
            >
              <i className="fas fa-video" style={{ color: '#d97706' }}></i>
            </Box>
            <Typography sx={{ fontSize: '14px', color: '#64748b', maxWidth: 360, margin: '0 auto' }}>
              You will be presented with expert-approved questions. Answer each one to the best of your ability.
            </Typography>
          </Box>

          {/* Job select */}
          <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: '8px' }}>
            Select Job Position
          </Typography>
          <Select
            fullWidth
            displayEmpty
            value={selectedJob}
            onChange={(e) => setSelectedJob(e.target.value as string)}
            sx={{
              borderRadius: '10px',
              mb: '20px',
              fontSize: '14px',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#f59e0b' },
            }}
          >
            <MenuItem value="" disabled>
              <Typography sx={{ color: '#94a3b8', fontSize: '14px' }}>Choose a job...</Typography>
            </MenuItem>
            {jobs.map((job: any) => (
              <MenuItem key={job.id} value={job.id}>
                {job.title}
              </MenuItem>
            ))}
          </Select>

          <Button
            fullWidth
            onClick={startInterview}
            disabled={loading || !selectedJob}
            sx={{
              padding: '14px',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '15px',
              textTransform: 'none',
              color: '#fff',
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              boxShadow: '0 4px 12px rgba(245,158,11,0.35)',
              '&:hover': {
                background: 'linear-gradient(135deg,#d97706,#b45309)',
                boxShadow: '0 6px 16px rgba(245,158,11,0.45)',
              },
              '&.Mui-disabled': {
                background: '#e2e8f0',
                color: '#94a3b8',
                boxShadow: 'none',
              },
            }}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i> Starting...
              </>
            ) : (
              <>
                <i className="fas fa-play" style={{ marginRight: 8 }}></i> Start Interview
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </Box>
  )

  // ─── Interview Session ─────────────────────────────────────────────────────
  const renderSession = () => {
    const q = questions[currentQuestionIndex]
    const dc = difficultyColor(q.difficulty)
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '340px 1fr' }, gap: '20px' }}>
        {/* Left: Video / Info panel */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Camera Preview */}
          <Card
            sx={{
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <Box
              sx={{
                height: 220,
                background: 'linear-gradient(135deg,#1e293b 0%,#334155 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                position: 'relative',
              }}
            >
              {cameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: 'scaleX(-1)',
                  }}
                />
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <Box sx={{ fontSize: '48px', opacity: 0.6 }}>
                    <i className="fas fa-video"></i>
                  </Box>
                  <Typography sx={{ fontSize: '13px', fontWeight: 500 }}>Camera Preview</Typography>
                  <Typography sx={{ fontSize: '11px', opacity: 0.6 }}>Starting camera...</Typography>
                </Box>
              )}
              {cameraActive && (
                <Box sx={{
                  position: 'absolute', top: 8, left: 8,
                  background: 'rgba(239,68,68,0.9)', borderRadius: '6px',
                  px: 1, py: 0.3, display: 'flex', alignItems: 'center', gap: 0.5,
                }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: 'white', animation: 'blink 1s infinite', '@keyframes blink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
                  <Typography sx={{ color: 'white', fontSize: '10px', fontWeight: 700 }}>LIVE</Typography>
                </Box>
              )}
            </Box>
          </Card>

          {/* Progress card */}
          <Card
            sx={{
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              padding: '20px',
            }}
          >
            <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569', mb: '12px' }}>
              Progress
            </Typography>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: '#f1f5f9',
                mb: '8px',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  background: 'linear-gradient(90deg,#f59e0b,#d97706)',
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                Question {currentQuestionIndex + 1} of {questions.length}
              </Typography>
              <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b' }}>
                {Math.round(progress)}%
              </Typography>
            </Box>

            {/* Mini question dots */}
            <Box sx={{ display: 'flex', gap: '6px', mt: '16px', flexWrap: 'wrap' }}>
              {questions.map((_, idx) => (
                <Box
                  key={idx}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background:
                      idx === currentQuestionIndex
                        ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                        : answers[idx]
                          ? '#dcfce7'
                          : '#f1f5f9',
                    color:
                      idx === currentQuestionIndex
                        ? '#fff'
                        : answers[idx]
                          ? '#166534'
                          : '#94a3b8',
                    border: idx === currentQuestionIndex ? 'none' : '1px solid #e2e8f0',
                  }}
                >
                  {idx + 1}
                </Box>
              ))}
            </Box>
          </Card>
        </Box>

        {/* Right: Question + Answer */}
        <Card
          sx={{
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Question header */}
          <Box
            sx={{
              padding: '18px 24px',
              borderBottom: '1px solid #f1f5f9',
              background: 'rgba(245,158,11,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>
              <i className="fas fa-question-circle" style={{ color: '#f59e0b', marginRight: 8 }}></i>
              Question {currentQuestionIndex + 1}
            </Typography>
            <Box sx={{ display: 'flex', gap: '8px' }}>
              <Chip
                label={q.difficulty}
                size="small"
                sx={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  backgroundColor: dc.bg,
                  color: dc.text,
                  height: '24px',
                }}
              />
              {q.skill_focus && (
                <Chip
                  label={q.skill_focus}
                  size="small"
                  sx={{
                    fontSize: '10px',
                    fontWeight: 600,
                    backgroundColor: '#ede9fe',
                    color: '#6d28d9',
                    height: '24px',
                  }}
                />
              )}
            </Box>
          </Box>

          {/* Question body */}
          <CardContent sx={{ padding: '28px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Typography
              sx={{
                fontSize: '17px',
                fontWeight: 600,
                color: '#1e293b',
                lineHeight: 1.6,
                mb: '24px',
              }}
            >
              {q.question}
            </Typography>

            {/* Answer textarea */}
            <Box
              component="textarea"
              value={currentAnswer}
              onChange={(e: any) => setCurrentAnswer(e.target.value)}
              placeholder="Type your answer here..."
              rows={6}
              sx={{
                width: '100%',
                flex: 1,
                minHeight: 160,
                padding: '16px',
                fontSize: '14px',
                lineHeight: 1.7,
                fontFamily: 'inherit',
                color: '#1e293b',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                resize: 'vertical',
                outline: 'none',
                transition: 'border-color 0.2s',
                '&:focus': { borderColor: '#f59e0b', boxShadow: '0 0 0 3px rgba(245,158,11,0.12)' },
                '&::placeholder': { color: '#cbd5e1' },
              }}
            />

            {/* Controls */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mt: '20px',
                pt: '16px',
                borderTop: '1px solid #f1f5f9',
              }}
            >
              <Button
                onClick={previousQuestion}
                disabled={currentQuestionIndex === 0}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '10px 20px',
                  '&:hover': { background: '#f8fafc', borderColor: '#cbd5e1' },
                  '&.Mui-disabled': { opacity: 0.4 },
                }}
              >
                <i className="fas fa-arrow-left" style={{ marginRight: 8 }}></i> Previous
              </Button>

              <Button
                onClick={nextQuestion}
                disabled={loading}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  color: '#fff',
                  borderRadius: '10px',
                  padding: '10px 24px',
                  background:
                    currentQuestionIndex === questions.length - 1
                      ? 'linear-gradient(135deg,#10b981,#059669)'
                      : 'linear-gradient(135deg,#f59e0b,#d97706)',
                  boxShadow:
                    currentQuestionIndex === questions.length - 1
                      ? '0 4px 12px rgba(16,185,129,0.35)'
                      : '0 4px 12px rgba(245,158,11,0.35)',
                  '&:hover': {
                    background:
                      currentQuestionIndex === questions.length - 1
                        ? 'linear-gradient(135deg,#059669,#047857)'
                        : 'linear-gradient(135deg,#d97706,#b45309)',
                  },
                }}
              >
                {currentQuestionIndex === questions.length - 1 ? (
                  <>
                    <i className="fas fa-check-circle" style={{ marginRight: 8 }}></i> Finish Interview
                  </>
                ) : (
                  <>
                    Next <i className="fas fa-arrow-right" style={{ marginLeft: 8 }}></i>
                  </>
                )}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    )
  }

  // ─── Main Render ───────────────────────────────────────────────────────────
  return (
    <Navigation>
      <Box sx={{ padding: '24px', background: '#f8fafc', minHeight: '100%' }}>
        {/* Page title */}
        <Box sx={{ mb: '24px' }}>
          <Typography sx={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>
            <i className="fas fa-video" style={{ color: '#f59e0b', marginRight: 10 }}></i>
            Interview
          </Typography>
          <Typography sx={{ fontSize: '13px', color: '#64748b', mt: '4px' }}>
            {questions.length > 0
              ? `Answering question ${currentQuestionIndex + 1} of ${questions.length}`
              : 'Select a job to begin your interview session'}
          </Typography>
        </Box>

        {/* Message banner */}
        {message && (
          <Box
            sx={{
              mb: '20px',
              padding: '14px 18px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '14px',
              fontWeight: 500,
              background: message.includes('completed') ? '#f0fdf4' : '#fef2f2',
              border: message.includes('completed') ? '1px solid #bbf7d0' : '1px solid #fecaca',
              color: message.includes('completed') ? '#166534' : '#991b1b',
            }}
          >
            <i
              className={message.includes('completed') ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'}
              style={{ fontSize: 16 }}
            ></i>
            {message}
          </Box>
        )}

        {questions.length === 0 ? renderSetup() : renderSession()}
      </Box>
    </Navigation>
  )
}

export default Interview
