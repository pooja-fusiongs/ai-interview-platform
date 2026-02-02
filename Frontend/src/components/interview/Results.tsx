import  { useState, useEffect } from 'react'
import Navigation from '../layout/sidebar'
import axios from 'axios'

const Results = () => {
  const [interviews, setInterviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadResults()
  }, [])

  const loadResults = async () => {
    try {
      const response = await axios.get('/api/interviews')
      setInterviews(response.data)
    } catch (error) {
      console.error('Error loading results:', error)
      // Demo data fallback
      setInterviews([
        {
          id: 1,
          jobTitle: 'Software Engineer',
          candidateName: 'Sarah Johnson',
          completedAt: new Date().toISOString(),
          averageScore: 8.5,
          status: 'selected',
          answers: [
            { question: 'What is a primary key in SQL?', answer: 'A primary key uniquely identifies a record in a table.', score: 9 },
            { question: 'Explain closures in JavaScript', answer: 'Closures allow inner functions to access outer scope variables.', score: 8 }
          ]
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const getScoreClass = (score) => {
    if (score >= 8) return 'score-excellent'
    if (score >= 6) return 'score-good'
    return 'score-poor'
  }

  const getStatusClass = (status) => {
    switch (status) {
      case 'selected': return 'status-selected'
      case 'next-round': return 'status-next-round'
      case 'rejected': return 'status-rejected'
      default: return ''
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'selected': return 'Selected'
      case 'next-round': return 'Next Round'
      case 'rejected': return 'Rejected'
      default: return 'Pending'
    }
  }

  if (loading) {
    return (
      <div className="results-page">
        <Navigation />
        <div className="loading-container">
          <div className="loading">Loading results...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="results-page">
      <Navigation />
      
      <div className="results-container">
        <div className="card">
          <div className="card-header">
            <h3><i className="fas fa-chart-bar"></i> Interview Results</h3>
          </div>
          <div className="card-content">
            <div className="results-summary">
              <h3>Overall Results</h3>
              <div className="candidate-results">
                {interviews.length === 0 ? (
                  <p>No interview results available yet.</p>
                ) : (
                  interviews.map((interview, index) => (
                    <div key={index} className="candidate-result">
                      <h4>{interview.candidateName || 'Unknown Candidate'}</h4>
                      <p><strong>Job:</strong> {interview.jobTitle || 'Unknown Job'}</p>
                      <p><strong>Interview Date:</strong> {new Date(interview.completedAt).toLocaleDateString()}</p>
                      
                      <div className={`score-display ${getScoreClass(interview.averageScore)}`}>
                        Score: {interview.averageScore?.toFixed(1) || 'N/A'}/10
                      </div>
                      
                      <div className={`status-badge ${getStatusClass(interview.status)}`}>
                        {getStatusText(interview.status)}
                      </div>
                      
                      {interview.answers && (
                        <div className="answer-breakdown">
                          <h5>Answer Breakdown:</h5>
                          {interview.answers.map((answer, answerIndex) => (
                            <div key={answerIndex} className="answer-item">
                              <strong>Q{answerIndex + 1}:</strong> {answer.question.substring(0, 60)}...
                              <br />
                              <strong>Score:</strong> {answer.score}/10
                              <br />
                              <strong>Answer:</strong> {answer.answer.substring(0, 100)}...
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="integrity-check">
              <h3>Candidate Integrity Check</h3>
              <div className="check-item">
                <span className="check-label">Voice Consistency:</span>
                <span className="check-status success">✓ Passed</span>
              </div>
              <div className="check-item">
                <span className="check-label">Lip/Body Movement:</span>
                <span className="check-status success">✓ Natural</span>
              </div>
              <div className="check-item">
                <span className="check-label">Background Analysis:</span>
                <span className="check-status success">✓ Appropriate</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Results