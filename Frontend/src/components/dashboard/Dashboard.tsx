
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Avatar,
  Chip
} from '@mui/material'
import Navigation from '../layout/sidebar'

const Dashboard = () => {
  const navigate = useNavigate()

  const stats = [
    { title: 'Active Jobs', value: '12', icon: 'fas fa-briefcase', color: 'blue', change: '+2 this week' },
    { title: 'Total Candidates', value: '145', icon: 'fas fa-users', color: 'green', change: '+15 this week' },
    { title: 'Interviews Scheduled', value: '8', icon: 'fas fa-calendar', color: 'orange', change: '3 today' },
    { title: 'AI Questions Generated', value: '1,250', icon: 'fas fa-robot', color: 'purple', change: '+50 today' }
  ]

  const recentJobs = [
    { id: 1, title: 'Senior Software Engineer', applicants: 25, status: 'Active', created: '2 days ago' },
    { id: 2, title: 'Frontend Developer', applicants: 18, status: 'Active', created: '5 days ago' },
    { id: 3, title: 'Data Scientist', applicants: 12, status: 'Draft', created: '1 week ago' }
  ]

  const upcomingInterviews = [
    { id: 1, candidate: 'John Smith', position: 'Senior Software Engineer', time: '2:00 PM Today', status: 'Scheduled' },
    { id: 2, candidate: 'Sarah Johnson', position: 'Frontend Developer', time: '10:00 AM Tomorrow', status: 'Confirmed' },
    { id: 3, candidate: 'Mike Chen', position: 'Data Scientist', time: '3:30 PM Tomorrow', status: 'Pending' }
  ]

  const recentQuestionGenerations = [
    { id: 1, candidate: 'John Smith', job: 'Senior Software Engineer', questions: 10, status: 'Generated', time: '2 hours ago', mode: 'Preview' },
    { id: 2, candidate: 'Sarah Johnson', job: 'Frontend Developer', questions: 10, status: 'Pending Review', time: '4 hours ago', mode: 'Preview' },
    { id: 3, candidate: 'Mike Chen', job: 'Data Scientist', questions: 10, status: 'Approved', time: '1 day ago', mode: 'Preview' }
  ]

 

  const renderOverview = () => (
    <Box sx={{ padding: '20px', background: '#f8fafc', height: '100%' }}>


      {/* Stats Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",                // mobile
            sm: "repeat(2, 1fr)",     // tablet
            md: "repeat(4, 1fr)",     // desktop
          },
          gap: "20px",
          marginBottom: "24px",
        }}
      >
        {stats.map((stat, index) => (
          <Card
            key={index}
            sx={{
              padding: "20px",
              borderRadius: "16px",
              border: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              height: "100px",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              transition: "all 0.3s ease",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
              },
            }}
          >
            {/* Icon */}
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
                color: "#fff",
                background:
                  stat.color === "blue"
                    ? "linear-gradient(135deg,#f59e0b,#d97706)"
                    : stat.color === "green"
                      ? "linear-gradient(135deg,#10b981,#059669)"
                      : stat.color === "orange"
                        ? "linear-gradient(135deg,#f59e0b,#d97706)"
                        : "linear-gradient(135deg,#8b5cf6,#7c3aed)",
              }}
            >
              <i className={stat.icon}></i>
            </Box>

            {/* Text */}
            <Box sx={{ flex: 1 }}>
              <Typography
                sx={{
                  fontSize: "26px",
                  fontWeight: 700,
                  color: "#1e293b",
                  lineHeight: 1,
                }}
              >
                {stat.value}
              </Typography>

              <Typography
                sx={{
                  fontSize: "14px",
                  color: "#64748b",
                  fontWeight: 500,
                  margin: "6px 0",
                }}
              >
                {stat.title}
              </Typography>

              <Chip
                label={stat.change}
                size="small"
                sx={{
                  fontSize: "11px",
                  fontWeight: 600,
                  height: "22px",
                  background: "#dcfce7",
                  color: "#166534",
                }}
              />
            </Box>
          </Card>
        ))}
      </Box>


      {/* Recent Activity - Two Column Layout */}
      <Box sx={{display:"grid",gridTemplateColumns:{sm:"1fr",lg:"1fr 1fr"},gap:"20px "}} >
        <Box>
          <Card sx={{
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            height: 'fit-content'
          }}>
            <Box sx={{
              padding: '16px 20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(245, 158, 11, 0.1)'
            }}>
              <Typography variant="h6" sx={{
                fontSize: '16px',
                fontWeight: 600,
                color: '#1e293b',
                margin: 0,
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
                background: 'none',
                border: 'none',
                color: '#f59e0b',
                fontSize: '12px',
                fontWeight: 500,
                textDecoration: 'none',
                padding: '4px 8px',
                borderRadius: '6px',
                textTransform: 'none',
                minWidth: 'auto',
                '&:hover': {
                  background: '#fef3c7'
                }
              }}>
                View All
              </Button>
            </Box>
            <CardContent sx={{ padding: '20px' }}>
              {recentJobs.map(job => (
                <Box key={job.id} sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: job.id === recentJobs.length ? 'none' : '1px solid #f1f5f9',
                  '&:first-of-type': {
                    paddingTop: 0
                  },
                  '&:last-child': {
                    paddingBottom: 0
                  }
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" sx={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1e293b',
                      margin: '0 0 4px 0'
                    }}>
                      {job.title}
                    </Typography>
                    <Typography sx={{
                      fontSize: '12px',
                      color: '#64748b',
                      margin: 0
                    }}>
                      {job.applicants} applicants • {job.created}
                    </Typography>
                  </Box>
                  <Chip
                    label={job.status}
                    size="small"
                    sx={{
                      padding: '4px 8px',
                      borderRadius: '16px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      backgroundColor: job.status === 'Active' ? '#dcfce7' : '#fef3c7',
                      color: job.status === 'Active' ? '#166534' : '#92400e',
                      marginLeft: '8px',
                      flexShrink: 0
                    }}
                  />
                </Box>
              ))}
            </CardContent>
          </Card>
        </Box>

        <Box>
          <Card sx={{
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            height: 'fit-content'
          }}>
            <Box sx={{
              padding: '16px 20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(245, 158, 11, 0.1)'
            }}>
              <Typography variant="h6" sx={{
                fontSize: '16px',
                fontWeight: 600,
                color: '#1e293b',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <i className="fas fa-calendar" style={{ color: '#f59e0b', fontSize: '14px' }}></i>
                Upcoming Interviews
              </Typography>
              <Button sx={{
                background: 'none',
                border: 'none',
                color: '#f59e0b',
                fontSize: '12px',
                fontWeight: 500,
                textDecoration: 'none',
                padding: '4px 8px',
                borderRadius: '6px',
                textTransform: 'none',
                minWidth: 'auto',
                '&:hover': {
                  background: '#fef3c7'
                }
              }}>
                View Schedule
              </Button>
            </Box>
            <CardContent sx={{ padding: '20px' }}>
              {upcomingInterviews.map(interview => (
                <Box key={interview.id} sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: interview.id === upcomingInterviews.length ? 'none' : '1px solid #f1f5f9',
                  '&:first-of-type': {
                    paddingTop: 0
                  },
                  '&:last-child': {
                    paddingBottom: 0
                  }
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" sx={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#1e293b',
                      margin: '0 0 2px 0'
                    }}>
                      {interview.candidate}
                    </Typography>
                    <Typography sx={{
                      fontSize: '12px',
                      color: '#64748b',
                      margin: '0 0 4px 0'
                    }}>
                      {interview.position}
                    </Typography>
                    <Box sx={{
                      fontSize: '11px',
                      color: '#f59e0b',
                      fontWeight: 600,
                      background: '#fef3c7',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      display: 'inline-block'
                    }}>
                      {interview.time}
                    </Box>
                  </Box>
                  <Chip
                    label={interview.status}
                    size="small"
                    sx={{
                      padding: '4px 8px',
                      borderRadius: '16px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      backgroundColor: interview.status === 'Scheduled' ? '#dbeafe' :
                        interview.status === 'Confirmed' ? '#dcfce7' : '#fef3c7',
                      color: interview.status === 'Scheduled' ? '#1e40af' :
                        interview.status === 'Confirmed' ? '#166534' : '#92400e',
                      marginLeft: '8px',
                      flexShrink: 0
                    }}
                  />
                </Box>
              ))}
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Recent AI Question Generations */}
      <Card sx={{
        marginBottom: '20px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}>
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 20px 0 20px'
        }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1e293b' }}>
            Recent AI Question Generations
          </Typography>
          <Button
            onClick={() => navigate('/ai-questions')}
            sx={{
              color: '#f59e0b',
              textTransform: 'none',
              fontSize: '14px',
              fontWeight: 500,
              '&:hover': { backgroundColor: 'rgba(245, 158, 11, 0.1)' }
            }}
          >
            View All
          </Button>
        </Box>
        <CardContent sx={{ padding: '20px' }}>
          {recentQuestionGenerations.map(generation => (
            <Box key={generation.id} sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: generation.id === recentQuestionGenerations.length ? 'none' : '1px solid #f1f5f9',
              '&:first-of-type': {
                paddingTop: 0
              }
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar sx={{ 
                  width: 40, 
                  height: 40, 
                  backgroundColor: '#f59e0b',
                  fontSize: '14px',
                  fontWeight: 600
                }}>
                  <i className="fas fa-robot"></i>
                </Avatar>
                <Box>
                  <Typography sx={{ fontWeight: 500, fontSize: '14px', color: '#1e293b' }}>
                    {generation.candidate}
                  </Typography>
                  <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                    {generation.job} • {generation.questions} questions • {generation.mode} Mode
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Chip
                  label={generation.status}
                  size="small"
                  sx={{
                    backgroundColor: generation.status === 'Generated' ? '#fef3c7' : 
                                   generation.status === 'Approved' ? '#d1fae5' : '#fef2f2',
                    color: generation.status === 'Generated' ? '#d97706' : 
                           generation.status === 'Approved' ? '#059669' : '#dc2626',
                    fontSize: '11px',
                    fontWeight: 500,
                    marginBottom: '4px'
                  }}
                />
                <Typography sx={{ fontSize: '11px', color: '#64748b' }}>
                  {generation.time}
                </Typography>
              </Box>
            </Box>
          ))}
        </CardContent>
      </Card>
    </Box>
  )

 
  const renderContent = () => {
    return renderOverview()
  }

  return (
    <Navigation>
      {renderContent()}
    </Navigation>
  )
}

export default Dashboard