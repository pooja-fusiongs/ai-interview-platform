import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
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
      // If a specific session was requested, load it directly
      if (sessionIdParam) {
        const session = await interviewService.getResults(Number(sessionIdParam))
        setSelectedSession(session)
      }
      // Also load the list
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
    } catch (err) {
      console.error('Error loading session:', err)
      setError('Failed to load session details.')
    } finally {
      setLoading(false)
    }
  }

  const getScoreClass = (score: number | null | undefined) => {
    if (score == null) return ''
    if (score >= 7.5) return 'score-excellent'
    if (score >= 5) return 'score-good'
    return 'score-poor'
  }

  const getStatusClass = (rec: string | null | undefined) => {
    switch (rec) {
      case 'select': return 'status-selected'
      case 'next_round': return 'status-next-round'
      case 'reject': return 'status-rejected'
      default: return ''
    }
  }

  const getStatusText = (rec: string | null | undefined) => {
    switch (rec) {
      case 'select': return 'Selected'
      case 'next_round': return 'Next Round'
      case 'reject': return 'Rejected'
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
        {/* Session detail view */}
        {selectedSession && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3><i className="fas fa-chart-bar"></i> Interview Results</h3>
              {sessions.length > 1 && (
                <button className="btn btn-secondary" onClick={() => setSelectedSession(null)} style={{ fontSize: '0.85rem', padding: '4px 12px' }}>
                  Back to list
                </button>
              )}
            </div>
            <div className="card-content">
              <div className="results-summary">
                <h4>{selectedSession.candidate_name || 'Candidate'}</h4>
                <p><strong>Job:</strong> {selectedSession.job_title || 'N/A'}</p>
                {selectedSession.completed_at && (
                  <p><strong>Completed:</strong> {new Date(selectedSession.completed_at).toLocaleDateString()}</p>
                )}

                <div className={`score-display ${getScoreClass(selectedSession.overall_score)}`}>
                  Score: {selectedSession.overall_score != null ? selectedSession.overall_score.toFixed(1) : 'N/A'}/10
                </div>

                <div className={`status-badge ${getStatusClass(selectedSession.recommendation)}`}>
                  {getStatusText(selectedSession.recommendation)}
                </div>

                {selectedSession.strengths && (
                  <div style={{ marginTop: '1rem' }}>
                    <strong>Strengths:</strong>
                    <p>{selectedSession.strengths}</p>
                  </div>
                )}
                {selectedSession.weaknesses && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <strong>Areas for improvement:</strong>
                    <p>{selectedSession.weaknesses}</p>
                  </div>
                )}

                {selectedSession.answers && selectedSession.answers.length > 0 && (
                  <div className="answer-breakdown" style={{ marginTop: '1.5rem' }}>
                    <h5>Answer Breakdown:</h5>
                    {selectedSession.answers.map((answer, idx) => (
                      <div key={answer.id} className="answer-item" style={{ marginBottom: '1rem', padding: '0.75rem', border: '1px solid #eee', borderRadius: '6px' }}>
                        <strong>Q{idx + 1}:</strong> {answer.question_text || 'Question'}
                        <br />
                        <strong>Score:</strong>{' '}
                        <span className={getScoreClass(answer.score)}>
                          {answer.score != null ? answer.score.toFixed(1) : 'N/A'}/10
                        </span>
                        <br />
                        <strong>Answer:</strong> {answer.answer_text}
                        {answer.feedback && (
                          <>
                            <br />
                            <em style={{ color: '#666' }}>{answer.feedback}</em>
                          </>
                        )}
                        {(answer.relevance_score != null) && (
                          <div style={{ marginTop: '0.4rem', fontSize: '0.85em', color: '#888' }}>
                            Relevance: {answer.relevance_score}
                            {' | '}Completeness: {answer.completeness_score}
                            {' | '}Accuracy: {answer.accuracy_score}
                            {' | '}Clarity: {answer.clarity_score}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Session list (shown when no detail selected, or always for recruiters) */}
        {!selectedSession && (
          <div className="card">
            <div className="card-header">
              <h3><i className="fas fa-list"></i> All Interviews</h3>
            </div>
            <div className="card-content">
              {error && <p style={{ color: 'red' }}>{error}</p>}
              {sessions.length === 0 ? (
                <p>No interview results available yet.</p>
              ) : (
                <div className="candidate-results">
                  {sessions.map((s) => (
                    <div key={s.id} className="candidate-result" style={{ cursor: 'pointer', marginBottom: '1rem', padding: '1rem', border: '1px solid #eee', borderRadius: '8px' }} onClick={() => viewSession(s.id)}>
                      <h4>{s.candidate_name || 'Candidate'}</h4>
                      <p><strong>Job:</strong> {s.job_title || 'N/A'}</p>
                      <p><strong>Status:</strong> {s.status}</p>
                      <p><strong>Questions:</strong> {s.answered_questions}/{s.total_questions} answered</p>
                      {s.overall_score != null && (
                        <div className={`score-display ${getScoreClass(s.overall_score)}`}>
                          Score: {s.overall_score.toFixed(1)}/10
                        </div>
                      )}
                      {s.recommendation && (
                        <div className={`status-badge ${getStatusClass(s.recommendation)}`}>
                          {getStatusText(s.recommendation)}
                        </div>
                      )}
                      {s.completed_at && (
                        <p style={{ fontSize: '0.85em', color: '#888' }}>
                          Completed: {new Date(s.completed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Integrity Check (static placeholder) */}
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-content">
            <div className="integrity-check">
              <h3>Candidate Integrity Check</h3>
              <div className="check-item">
                <span className="check-label">Voice Consistency:</span>
                <span className="check-status success">&#10003; Passed</span>
              </div>
              <div className="check-item">
                <span className="check-label">Lip/Body Movement:</span>
                <span className="check-status success">&#10003; Natural</span>
              </div>
              <div className="check-item">
                <span className="check-label">Background Analysis:</span>
                <span className="check-status success">&#10003; Appropriate</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Results
