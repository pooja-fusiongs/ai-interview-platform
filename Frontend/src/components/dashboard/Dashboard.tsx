import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Avatar,
  Chip,
  Skeleton
} from '@mui/material'
import {
  PieChart, Pie, Cell, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer
} from 'recharts'
import Navigation from '../layout/Sidebar'
import { jobService } from '../../services/jobService'
import { videoInterviewService } from '../../services/videoInterviewService'
import { questionGenerationService } from '../../services/questionGenerationService'


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

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    activeJobs: 0,
    totalCandidates: 0,
    scheduledInterviews: 0,
    aiQuestions: 0,
    closedJobs: 0
  })
  const [allJobs, setAllJobs] = useState<Job[]>([])
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
        jobService.getJobs(),
        videoInterviewService.getInterviews(),
        questionGenerationService.getQuestionSets()
      ])

      // Process jobs data
      if (jobsData.status === 'fulfilled') {
        const jobs = Array.isArray(jobsData.value) ? jobsData.value : []
        setAllJobs(jobs)
        setRecentJobs(jobs.slice(0, 3))

        const activeJobsCount = jobs.filter((j: Job) => ['active', 'open'].includes(j.status?.toLowerCase())).length
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

  const PIE_COLORS = ['#2E38F7', '#9ca3af', '#BBC3FF']

  const pieData = useMemo(() => {
    const active = allJobs.filter(j => ['active', 'open'].includes(j.status?.toLowerCase())).length
    const closed = allJobs.filter(j => j.status?.toLowerCase() === 'closed').length
    const other = allJobs.length - active - closed
    return [
      { name: 'Active', value: active },
      { name: 'Closed', value: closed },
      { name: 'Other', value: other },
    ].filter(d => d.value > 0)
  }, [allJobs])

  const barData = useMemo(() => {
    return [...allJobs]
      .sort((a, b) => (b.application_count || 0) - (a.application_count || 0))
      .slice(0, 10)
      .map(j => ({
        name: j.title.length > 15 ? j.title.slice(0, 13) + '...' : j.title,
        candidates: j.application_count || 0,
      }))
  }, [allJobs])

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
                backgroundColor:
                  stat.color === "blue"
                    ? "primary.main"
                    : stat.color === "green"
                      ? "success.main"
                      : stat.color === "orange"
                        ? "primary.main"
                        : stat.color === "red"
                          ? "error.main"
                          : "primary.main",
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

      {/* Charts Row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: { xs: '12px', md: '16px' }, mb: { xs: '12px', md: '16px' } }}>
        {/* Pie Chart - Position Status */}
        <Card sx={{
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <Box sx={{
            padding: '14px 16px',
            borderBottom: '1px solid #f1f5f9',
            background: 'rgba(2, 2, 145, 0.08)'
          }}>
            <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-chart-pie" style={{ fontSize: '14px' }}></i>
              Position Status
            </Typography>
          </Box>
          <CardContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 260 }}>
            {loading ? (
              <Skeleton variant="circular" width={180} height={180} />
            ) : pieData.length === 0 ? (
              <Typography sx={{ fontSize: '13px', color: '#64748b' }}>No job data</Typography>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                    {pieData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart - Candidates per Position */}
        <Card sx={{
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <Box sx={{
            padding: '14px 16px',
            borderBottom: '1px solid #f1f5f9',
            background: 'rgba(2, 2, 145, 0.08)'
          }}>
            <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fas fa-chart-bar" style={{ fontSize: '14px' }}></i>
              Candidates per Position
            </Typography>
          </Box>
          <CardContent sx={{ minHeight: 260, p: '16px !important' }}>
            {loading ? (
              <Skeleton variant="rectangular" width="100%" height={200} />
            ) : barData.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                <Typography sx={{ fontSize: '13px', color: '#64748b' }}>No job data</Typography>
              </Box>
            ) : (
              <Box sx={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
                <Box sx={{ minWidth: Math.max(barData.length * 70, 300), height: 250 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="candidates" fill="#020291" radius={[4, 4, 0, 0]} maxBarSize={45} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
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
            background: 'rgba(2, 2, 145, 0.08)'
          }}>
            <Typography sx={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <i className="fas fa-briefcase" style={{ color: 'primary.main', fontSize: '14px' }}></i>
              Recent Jobs
            </Typography>
            <Button
              onClick={() => navigate('/jobs')}
              sx={{
                color: 'primary.main',
                fontSize: '12px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '6px',
                textTransform: 'none',
                minWidth: 'auto'
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
                      backgroundColor: (job.status?.toLowerCase() === 'active' || !job.status) ? '#dcfce7' : 'rgba(2, 2, 145, 0.1)',
                      color: (job.status?.toLowerCase() === 'active' || !job.status) ? '#166534' : 'primary.main',
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
            background: 'rgba(2, 2, 145, 0.08)'
          }}>
            <Typography sx={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <i className="fas fa-calendar" style={{ color: 'primary.main', fontSize: '14px' }}></i>
              Upcoming Interviews
            </Typography>
            <Button
              onClick={() => navigate('/video-interviews')}
              sx={{
                color: 'primary.main',
                fontSize: '12px',
                fontWeight: 500,
                padding: '4px 8px',
                borderRadius: '6px',
                textTransform: 'none',
                minWidth: 'auto'
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
                      color: 'primary.main',
                      fontWeight: 600,
                      background: 'rgba(2, 2, 145, 0.1)',
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
                        interview.status?.toLowerCase() === 'scheduled' ? '#dbeafe' : 'rgba(2, 2, 145, 0.1)',
                      color: interview.status?.toLowerCase() === 'confirmed' ? '#166534' :
                        interview.status?.toLowerCase() === 'scheduled' ? '#1e40af' : 'primary.main',
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
                        qs.status?.toLowerCase() === 'pending' ? 'rgba(2, 2, 145, 0.1)' : '#ede9fe',
                      color: qs.status?.toLowerCase() === 'approved' ? '#166534' :
                        qs.status?.toLowerCase() === 'pending' ? 'primary.main' : '#6d28d9',
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
