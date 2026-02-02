import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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

  useEffect(() => {
    loadJobs()
  }, [])

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
      // 1. Fetch approved questions
      const data = await interviewService.getApprovedQuestions(Number(selectedJob))

      if (!data.questions || data.questions.length === 0) {
        setMessage('No approved questions found for this job. Please generate and approve questions first.')
        setLoading(false)
        return
      }

      // 2. Create interview session
      const session = await interviewService.createSession(Number(selectedJob))
      setSessionId(session.id)

      setQuestions(data.questions)
      setCurrentQuestionIndex(0)
      setAnswers(new Array(data.questions.length).fill(''))
      setCurrentAnswer('')
      setMessage('')
    } catch (error: any) {
      console.error('Error starting interview:', error)
      const detail = error?.response?.data?.detail || 'Failed to start interview. Make sure you are logged in and questions have been approved.'
      setMessage(detail)
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
      await interviewService.submitAnswer(
        sessionId,
        questions[currentQuestionIndex].id,
        currentAnswer
      )
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
      // Submit the last answer
      if (sessionId && currentAnswer.trim()) {
        await interviewService.submitAnswer(
          sessionId,
          questions[currentQuestionIndex].id,
          currentAnswer
        )
      }

      // Complete the session (triggers scoring + recommendation)
      if (sessionId) {
        await interviewService.completeSession(sessionId)
      }

      setMessage('Interview completed! Redirecting to results...')
      setTimeout(() => {
        navigate(`/results?session=${sessionId}`)
      }, 1500)
    } catch (error: any) {
      console.error('Error finishing interview:', error)
      setMessage('Error completing interview. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="interview-page">
      <Navigation />

      <div className="interview-container">
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-video"></i> Video Interview</h3>
          </div>
          <div className="card-content">
            {questions.length === 0 ? (
              <div className="interview-setup">
                <div className="form-group">
                  <label htmlFor="selectInterviewJob">Select Job</label>
                  <select
                    id="selectInterviewJob"
                    value={selectedJob}
                    onChange={(e) => setSelectedJob(e.target.value)}
                  >
                    <option value="">Select Job</option>
                    {jobs.map((job: any) => (
                      <option key={job.id} value={job.id}>
                        {job.title}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={startInterview}
                  disabled={loading}
                >
                  <i className="fas fa-play"></i>
                  {loading ? 'Starting...' : 'Start Interview'}
                </button>
              </div>
            ) : (
              <div className="interview-session">
                <div className="video-section">
                  <div className="video-placeholder">
                    <div className="camera-icon">📹</div>
                    <p>Video Interview Simulation</p>
                    <small>Camera placeholder for prototype</small>
                  </div>
                </div>

                <div className="question-section">
                  <div className="question-counter">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </div>
                  <div className="current-question">
                    <h3>{questions[currentQuestionIndex].question}</h3>
                    {questions[currentQuestionIndex].difficulty && (
                      <span className={`difficulty-badge ${questions[currentQuestionIndex].difficulty}`}>
                        {questions[currentQuestionIndex].difficulty}
                      </span>
                    )}
                  </div>
                  <div className="answer-section">
                    <textarea
                      value={currentAnswer}
                      onChange={(e) => setCurrentAnswer(e.target.value)}
                      placeholder="Type your answer here..."
                      rows={4}
                    />
                    <div className="interview-controls">
                      <button
                        className="btn btn-secondary"
                        onClick={previousQuestion}
                        disabled={currentQuestionIndex === 0}
                      >
                        <i className="fas fa-arrow-left"></i>
                        Previous
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={nextQuestion}
                        disabled={loading}
                      >
                        <i className="fas fa-arrow-right"></i>
                        {currentQuestionIndex === questions.length - 1 ? 'Finish Interview' : 'Next Question'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {message && (
              <div className={`message ${message.includes('completed') ? 'success' : 'error'}`}>
                {message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Interview
