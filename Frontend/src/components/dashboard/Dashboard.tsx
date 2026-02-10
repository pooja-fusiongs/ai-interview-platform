import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Avatar,
  Chip,
  CircularProgress,
  Skeleton
} from '@mui/material'
import Navigation from '../layout/sidebar'
import { jobService } from '../../services/jobService'
import { videoInterviewService } from '../../services/videoInterviewService'
import { questionGenerationService } from '../../services/questionGenerationService'
import { useAuth } from '../../contexts/AuthContext'

interface Job {
  id: number
  title: string
  status: string
  created_at: string
  application_count?: number
}

interface Interview {
  id: number
  candidate_name: string
  job_title: string
  scheduled_at: string
  status: string
}

interface QuestionSet {
  id: number
  job_title: string
  candidate_name: string
  total_questions: number
  approved_questions: number
  status: string
  created_at: string
  generation_mode: string
}

const Dashboard = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    activeJobs: 0,
    totalCandidates: 0,
    scheduledInterviews: 0,
    aiQuestions: 0,
    closedJobs: 0
  })
  const [recentJobs, setRecentJobs] = useState<Job[]>([])
  const [upcomingInterviews, setUpcomingInterviews] = useState<Interview[]>([])
  const [recentQuestionSets, setRecentQuestionSets] = useState<QuestionSet[]>([])

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      // Fetch all data in parallel
      const [jobsData, interviewsData, questionSetsData] = await Promise.allSettled([
        jobService.getJobs({ limit: 5 }),
        videoInterviewService.getInterviews(),
        questionGenerationService.getQuestionSets()
      ])

      // Process jobs data
      if (jobsData.status === 'fulfilled') {
        const jobs = Array.isArray(jobsData.value) ? jobsData.value : []
        setRecentJobs(jobs.slice(0, 3))

        const activeJobsCount = jobs.filter((j: Job) => j.status === 'active' || j.status === 'Active').length
        const closedJobsCount = jobs.filter((j: Job) => j.status === 'Closed' || j.status === 'closed').length
        const totalApplicants = jobs.reduce((sum: number, j: Job) => sum + (j.application_count || 0), 0)

        setStats(prev => ({
          ...prev,
          activeJobs: activeJobsCount || jobs.length,
          totalCandidates: totalApplicants,
          closedJobs: closedJobsCount
        }))
      }

      // Process interviews data
      if (interviewsData.status === 'fulfilled') {
        const interviews = Array.isArray(interviewsData.value) ? interviewsData.value : []
        // Filter upcoming interviews (scheduled or confirmed)
        const upcoming = interviews
          .filter((i: Interview) => ['scheduled', 'confirmed', 'pending'].includes(i.status?.toLowerCase()))
          .slice(0, 3)
        setUpcomingInterviews(upcoming)

        setStats(prev => ({
          ...prev,
          scheduledInterviews: interviews.length
        }))
      }

      // Process question sets data
      if (questionSetsData.status === 'fulfilled') {
        const questionSets = questionSetsData.value?.data || []
        setRecentQuestionSets(Array.isArray(questionSets) ? questionSets.slice(0, 3) : [])

        const totalQuestions = Array.isArray(questionSets)
          ? questionSets.reduce((sum: number, qs: QuestionSet) => sum + (qs.total_questions || 0), 0)
          : 0

        setStats(prev => ({
          ...prev,
          aiQuestions: totalQuestions
        }))
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
    return date.toLocaleDateString()
  }

  const formatInterviewTime = (dateStr: string) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow = date.toDateString() === tomorrow.toDateString()

    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

    if (isToday) return `${time} Today`
    if (isTomorrow) return `${time} Tomorrow`
    return `${time} ${date.toLocaleDateString()}`
  }

  const statsConfig = [
    { title: 'Active Jobs', value: stats.activeJobs, icon: 'fas fa-briefcase', color: 'blue', change: 'Total active' },
    { title: 'Total Candidates', value: stats.totalCandidates, icon: 'fas fa-users', color: 'green', change: 'Applicants' },
    { title: 'Interviews Scheduled', value: stats.scheduledInterviews, icon: 'fas fa-calendar', color: 'orange', change: 'Upcoming' },
    { title: 'AI Questions Generated', value: stats.aiQuestions, icon: 'fas fa-robot', color: 'purple', change: 'Total generated' },
    { title: 'Closed Positions', value: stats.closedJobs, icon: 'fas fa-archive', color: 'red', change: 'Archived' }
  ]

  const renderOverview = () => (
    <Box sx={{ padding: { xs: '12px', sm: '16px', md: '20px' }, background: '#f8fafc', minHeight: '100%' }}>
      {/* Stats Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(5, 1fr)",
          },
          gap: { xs: "12px", md: "16px" },
          marginBottom: { xs: "16px", md: "20px" },
        }}
      >
        {statsConfig.map((stat, index) => (
          <Card
            key={index}
            sx={{
              padding: { xs: "12px", md: "16px" },
              borderRadius: { xs: "10px", md: "12px" },
              border: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              transition: "all 0.2s ease",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              },
            }}
          >
            <Box
              sx={{
                width: { xs: 40, md: 48 },
                height: { xs: 40, md: 48 },
                borderRadius: { xs: "8px", md: "10px" },
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px",
                color: "#fff",
                flexShrink: 0,
                background:
                  stat.color === "blue"
                    ? "linear-gradient(135deg,#3b82f6,#2563eb)"
                    : stat.color === "green"
                      ? "linear-gradient(135deg,#10b981,#059669)"
                      : stat.color === "orange"
                        ? "linear-gradient(135deg,#f59e0b,#d97706)"
                        : stat.color === "red"
                          ? "linear-gradient(135deg,#ef4444,#dc2626)"
                          : "linear-gradient(135deg,#8b5cf6,#7c3aed)",
              }}
            >
              <i className={stat.icon}></i>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              {loading ? (
                <Skeleton width={60} height={32} />
              ) : (
                <Typography
                  sx={{
                    fontSize: { xs: "20px", md: "24px" },
                    fontWeight: 700,
                    color: "#1e293b",
                    lineHeight: 1.2,
                  }}
                >
                  {stat.value.toLocaleString()}
                </Typography>
              )}
              <Typography
                sx={{
                  fontSize: "13px",
                  color: "#64748b",
                  fontWeight: 500,
                }}
              >
                {stat.title}
              </Typography>
            </Box>
          </Card>
        ))}
      </Box>

      {/* Two Column Layout */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: { xs: "12px", md: "16px" }, mb: { xs: "12px", md: "16px" } }}>
        {/* Recent Jobs */}
        <Card sx={{
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        }}>
          <Box sx={{
            padding: '14px 16px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(245, 158, 11, 0.08)'
          }}>
            <Typography sx={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <i className="fas fa-briefcase" style={{ color: '#f59e0b', fontSize: '14px' }}></i>
              Recent Jobs
            </Typography>
            <Button
              onClick={() => navigate('/jobs')}
              sx={{
                color: '#f59e0b',
                fontSize: '12px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '6px',
                textTransform: 'none',
                minWidth: 'auto',
                '&:hover': { background: '#fef3c7' }
              }}>
              View All
            </Button>
          </Box>
          <CardContent sx={{ padding: '0 !important' }}>
            {loading ? (
              <Box sx={{ p: 2 }}>
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} height={50} sx={{ mb: 1 }} />
                ))}
              </Box>
            ) : recentJobs.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center', color: '#64748b' }}>
                <i className="fas fa-briefcase" style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}></i>
                <Typography sx={{ fontSize: '13px' }}>No jobs found</Typography>
              </Box>
            ) : (
              recentJobs.map((job, idx) => (
                <Box key={job.id} sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: idx < recentJobs.length - 1 ? '1px solid #f1f5f9' : 'none',
                  '&:hover': { background: '#fafafa' }
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#1e293b',
                      mb: '2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {job.title}
                    </Typography>
                    <Typography sx={{ fontSize: '11px', color: '#64748b' }}>
                      {job.application_count || 0} applicants • {formatDate(job.created_at)}
                    </Typography>
                  </Box>
                  <Chip
                    label={job.status || 'Active'}
                    size="small"
                    sx={{
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      height: '22px',
                      backgroundColor: (job.status?.toLowerCase() === 'active' || !job.status) ? '#dcfce7' : '#fef3c7',
                      color: (job.status?.toLowerCase() === 'active' || !job.status) ? '#166534' : '#92400e',
                      ml: 1
                    }}
                  />
                </Box>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Interviews */}
        <Card sx={{
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        }}>
          <Box sx={{
            padding: '14px 16px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(245, 158, 11, 0.08)'
          }}>
            <Typography sx={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <i className="fas fa-calendar" style={{ color: '#f59e0b', fontSize: '14px' }}></i>
              Upcoming Interviews
            </Typography>
            <Button
              onClick={() => navigate('/video-interviews')}
              sx={{
                color: '#f59e0b',
                fontSize: '12px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '6px',
                textTransform: 'none',
                minWidth: 'auto',
                '&:hover': { background: '#fef3c7' }
              }}>
              View Schedule
            </Button>
          </Box>
          <CardContent sx={{ padding: '0 !important' }}>
            {loading ? (
              <Box sx={{ p: 2 }}>
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} height={50} sx={{ mb: 1 }} />
                ))}
              </Box>
            ) : upcomingInterviews.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center', color: '#64748b' }}>
                <i className="fas fa-calendar-check" style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }}></i>
                <Typography sx={{ fontSize: '13px' }}>No upcoming interviews</Typography>
              </Box>
            ) : (
              upcomingInterviews.map((interview, idx) => (
                <Box key={interview.id} sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: idx < upcomingInterviews.length - 1 ? '1px solid #f1f5f9' : 'none',
                  '&:hover': { background: '#fafafa' }
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#1e293b',
                      mb: '2px'
                    }}>
                      {interview.candidate_name || 'Candidate'}
                    </Typography>
                    <Typography sx={{ fontSize: '11px', color: '#64748b', mb: '4px' }}>
                      {interview.job_title || 'Position'}
                    </Typography>
                    <Box sx={{
                      fontSize: '10px',
                      color: '#f59e0b',
                      fontWeight: 600,
                      background: '#fef3c7',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      display: 'inline-block'
                    }}>
                      {formatInterviewTime(interview.scheduled_at)}
                    </Box>
                  </Box>
                  <Chip
                    label={interview.status || 'Scheduled'}
                    size="small"
                    sx={{
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      height: '22px',
                      backgroundColor: interview.status?.toLowerCase() === 'confirmed' ? '#dcfce7' :
                        interview.status?.toLowerCase() === 'scheduled' ? '#dbeafe' : '#fef3c7',
                      color: interview.status?.toLowerCase() === 'confirmed' ? '#166534' :
                        interview.status?.toLowerCase() === 'scheduled' ? '#1e40af' : '#92400e',
                      ml: 1
                    }}
                  />
                </Box>
              ))
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Recent AI Question Generations */}
      <Card sx={{
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)'
      }}>
        <Box sx={{
          padding: '14px 16px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(139, 92, 246, 0.08)'
        }}>
          <Typography sx={{
            fontSize: '15px',
            fontWeight: 600,
            color: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <i className="fas fa-robot" style={{ color: '#8b5cf6', fontSize: '14px' }}></i>
            Recent AI Question Generations
          </Typography>
          <Button
            onClick={() => navigate('/ai-questions')}
            sx={{
              color: '#8b5cf6',
              fontSize: '12px',
              fontWeight: 500,
              padding: '4px 8px',
              borderRadius: '6px',
              textTransform: 'none',
              minWidth: 'auto',
              '&:hover': { background: '#ede9fe' }
            }}>
            View All
          </Button>
        </Box>
        <CardContent sx={{ padding: '0 !important' }}>
          {loading ? (
            <Box sx={{ p: 2 }}>
              {[1, 2, 3].map(i => (
                <Skeleton key={i} height={60} sx={{ mb: 1 }} />
              ))}
            </Box>
          ) : recentQuestionSets.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: '#64748b' }}>
              <i className="fas fa-robot" style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}></i>
              <Typography sx={{ fontSize: '13px' }}>No question generations yet</Typography>
            </Box>
          ) : (
            recentQuestionSets.map((qs, idx) => (
              <Box key={qs.id} sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: idx < recentQuestionSets.length - 1 ? '1px solid #f1f5f9' : 'none',
                '&:hover': { background: '#fafafa' }
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <Avatar sx={{
                    width: 36,
                    height: 36,
                    backgroundColor: '#8b5cf6',
                    fontSize: '14px'
                  }}>
                    <i className="fas fa-robot"></i>
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{
                      fontWeight: 600,
                      fontSize: '13px',
                      color: '#1e293b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {qs.candidate_name || 'Candidate'}
                    </Typography>
                    <Typography sx={{ fontSize: '11px', color: '#64748b' }}>
                      {qs.job_title || 'Job'} • {qs.total_questions || 0} questions • {qs.generation_mode || 'Preview'}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ textAlign: 'right', flexShrink: 0, ml: 2 }}>
                  <Chip
                    label={qs.status || 'Generated'}
                    size="small"
                    sx={{
                      backgroundColor: qs.status?.toLowerCase() === 'approved' ? '#dcfce7' :
                        qs.status?.toLowerCase() === 'pending' ? '#fef3c7' : '#ede9fe',
                      color: qs.status?.toLowerCase() === 'approved' ? '#166534' :
                        qs.status?.toLowerCase() === 'pending' ? '#92400e' : '#6d28d9',
                      fontSize: '10px',
                      fontWeight: 600,
                      height: '20px',
                      mb: '4px'
                    }}
                  />
                  <Typography sx={{ fontSize: '10px', color: '#94a3b8' }}>
                    {formatDate(qs.created_at)}
                  </Typography>
                </Box>
              </Box>
            ))
          )}
        </CardContent>
      </Card>
    </Box>
  )

  return (
    <Navigation>
      {renderOverview()}
    </Navigation>
  )
}

export default Dashboard
