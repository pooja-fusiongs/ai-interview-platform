import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Navigation from '../layout/sidebar'
import axios from 'axios'

const Interview = () => {
  const navigate = useNavigate()
  const [selectedJob, setSelectedJob] = useState('')
  const [jobs, setJobs] = useState([])
  const [currentInterview, setCurrentInterview] = useState(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadJobs()
  }, [])

  const loadJobs = async () => {
    try {
      const response = await axios.get('/api/jobs')
      setJobs(response.data)
    } catch (error) {
      console.error('Error loading jobs:', error)
      // Demo data fallback
      setJobs([
        { id: 1, title: 'Software Engineer' },
        { id: 2, title: 'Data Scientist' }
      ])
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
      const response = await axios.get(`/api/questions/approved/${selectedJob}`)
      
      if (!response.data.questions || response.data.questions.length === 0) {
        setMessage('No approved questions found for this job. Please generate and approve questions first.')
        setLoading(false)
        return
      }

      setCurrentInterview({
        jobId: selectedJob,
        questions: response.data.questions,
        startedAt: new Date().toISOString()
      })
      setCurrentQuestionIndex(0)
      setAnswers(new Array(response.data.questions.length).fill(''))
      setCurrentAnswer('')
      setMessage('')
    } catch (error) {
      console.error('Error starting interview:', error)
      // Demo questions fallback
      const demoQuestions = [
        { question: 'What is a primary key in SQL?', goldStandard: 'A primary key uniquely identifies a record in a table.' },
        { question: 'Explain the differences between Python 2 and Python 3.', goldStandard: 'Python 3 has better Unicode support and print is a function.' },
        { question: 'How do you handle asynchronous operations?', goldStandard: 'Using promises, async/await, or callbacks.' }
      ]
      
      setCurrentInterview({
        jobId: selectedJob,
        questions: demoQuestions,
        startedAt: new Date().toISOString()
      })
      setCurrentQuestionIndex(0)
      setAnswers(new Array(demoQuestions.length).fill(''))
      setCurrentAnswer('')
      setMessage('Demo interview started!')
    } finally {
      setLoading(false)
    }
  }

  const saveCurrentAnswer = () => {
    const newAnswers = [...answers]
    newAnswers[currentQuestionIndex] = currentAnswer
    setAnswers(newAnswers)
  }

  const previousQuestion = () => {
    if (currentQuestionIndex > 0) {
      saveCurrentAnswer()
      setCurrentQuestionIndex(currentQuestionIndex - 1)
      setCurrentAnswer(answers[currentQuestionIndex - 1] || '')
    }
  }

  const nextQuestion = () => {
    saveCurrentAnswer()
    
    if (currentQuestionIndex < currentInterview.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setCurrentAnswer(answers[currentQuestionIndex + 1] || '')
    } else {
      finishInterview()
    }
  }

  const finishInterview = async () => {
    saveCurrentAnswer()
    setLoading(true)

    try {
      const interviewData = {
        jobId: selectedJob,
        questions: currentInterview.questions,
        answers: answers.map((answer, index) => ({
          questionIndex: index,
          question: currentInterview.questions[index].question,
          answer: answer,
          goldStandard: currentInterview.questions[index].goldStandard
        })),
        completedAt: new Date().toISOString()
      }

      await axios.post('/api/interviews', interviewData)
      setMessage('Interview completed! Redirecting to results...')
      
      setTimeout(() => {
        navigate('/results')
      }, 2000)
    } catch (error) {
      console.error('Error finishing interview:', error)
      setMessage('Interview completed locally! (Demo mode)')
      setTimeout(() => {
        navigate('/results')
      }, 2000)
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
            {!currentInterview ? (
              <div className="interview-setup">
                <div className="form-group">
                  <label htmlFor="selectInterviewJob">Select Job</label>
                  <select
                    id="selectInterviewJob"
                    value={selectedJob}
                    onChange={(e) => setSelectedJob(e.target.value)}
                  >
                    <option value="">Select Job</option>
                    {jobs.map(job => (
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
                    Question {currentQuestionIndex + 1} of {currentInterview.questions.length}
                  </div>
                  <div className="current-question">
                    <h3>{currentInterview.questions[currentQuestionIndex].question}</h3>
                  </div>
                  <div className="answer-section">
                    <textarea
                      value={currentAnswer}
                      onChange={(e) => setCurrentAnswer(e.target.value)}
                      placeholder="Type your answer here..."
                      rows="4"
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
                        {currentQuestionIndex === currentInterview.questions.length - 1 ? 'Finish Interview' : 'Next Question'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {message && (
              <div className={`message ${message.includes('success') || message.includes('completed') ? 'success' : 'error'}`}>
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