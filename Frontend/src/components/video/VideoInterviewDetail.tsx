import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, CircularProgress, Alert,
   Button, IconButton, Tooltip, Avatar, Divider,
} from '@mui/material';
import {
  ArrowBack,
  CalendarMonth,
  AccessTime,
  Videocam,
  Person,
  Work,
  Security,
  ContentCopy,
  OpenInNew,
  PlayArrow,
  Cancel,
  CheckCircle,
  Description,
  CloudUpload,
  Assessment,
  FiberManualRecord,
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://ai-interview-platform-2bov.onrender.com';

const statusConfig: Record<string, { color: string; bg: string; icon: React.ReactElement }> = {
  scheduled: { color: '#3b82f6', bg: '#eff6ff', icon: <CalendarMonth sx={{ fontSize: 18 }} /> },
  in_progress: { color: '#f59e0b', bg: '#fffbeb', icon: <PlayArrow sx={{ fontSize: 18 }} /> },
  completed: { color: '#10b981', bg: '#ecfdf5', icon: <CheckCircle sx={{ fontSize: 18 }} /> },
  cancelled: { color: '#ef4444', bg: '#fef2f2', icon: <Cancel sx={{ fontSize: 18 }} /> },
};

const VideoInterviewDetail: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [, setNotes] = useState('');
  const [transcript, setTranscript] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchInterview = async () => {
      try {
        const data = await videoInterviewService.getInterview(Number(videoId));
        if (cancelled) return;
        setInterview(data);
        setNotes(data.notes || '');
        if (data.transcript) {
          setTranscript(data.transcript);
        }
        if (data.overall_score !== null && data.overall_score !== undefined) {
          setScoreResult({
            overall_score: data.overall_score,
            recommendation: data.recommendation || 'next_round',
            strengths: data.strengths || '',
            weaknesses: data.weaknesses || '',
            per_question: data.per_question_scores || [],
            interview_session_id: data.interview_session_id
          });
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err.message || 'Failed to load interview details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (videoId) fetchInterview();
    return () => { cancelled = true; };
  }, [videoId]);

  // const fetchTranscript = async () => {
  //   try {
  //     setTranscriptLoading(true);
  //     const data = await videoInterviewService.getTranscript(Number(videoId));
  //     setTranscript(data.transcript);
  //     toast.success('Transcript loaded successfully');
  //   } catch (err: any) {
  //     toast.error(err.response?.data?.detail || 'Failed to load transcript');
  //   } finally {
  //     setTranscriptLoading(false);
  //   }
  // };




  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return (
      <Navigation>
        <Box sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: 'linear-gradient(180deg, #f8f9fb 0%, #eef2f6 100%)'
        }}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress sx={{ color: '#f59e0b', mb: 2 }} />
            <Typography sx={{ color: '#64748b' }}>Loading interview details...</Typography>
          </Box>
        </Box>
      </Navigation>
    );
  }

  const status = interview?.status || 'scheduled';
  const statusStyle = statusConfig[status] || statusConfig.scheduled;

  return (
    <Navigation>
      <Box sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f8f9fb 0%, #eef2f6 100%)',
        padding: { xs: '12px', sm: '16px', md: '24px' },
        overflow: 'hidden',
        boxSizing: 'border-box',
        maxWidth: '100%'
      }}>
        {/* Header */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: 3, gap: { xs: 2, sm: 0 }, maxWidth: '100%', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton
              onClick={() => navigate('/video-interviews')}
              sx={{
                background: 'white',
                border: '1px solid #e2e8f0',
                '&:hover': { background: '#f8fafc' }
              }}
            >
              <ArrowBack sx={{ color: '#64748b' }} />
            </IconButton>
            <Box>
              <Typography sx={{ fontSize: { xs: '22px', sm: '24px', md: '28px' }, fontWeight: 700, color: '#1e293b' }}>
                Interview Details
              </Typography>
              <Typography sx={{ fontSize: '14px', color: '#64748b' }}>
                Interview ID: #{videoId}
              </Typography>
            </Box>
          </Box>
          <Chip
            icon={statusStyle.icon}
            label={status.replace('_', ' ').toUpperCase()}
            sx={{
              background: statusStyle.bg,
              color: statusStyle.color,
              fontWeight: 600,
              fontSize: '13px',
              padding: '4px 8px',
              border: `1px solid ${statusStyle.color}30`,
              '& .MuiChip-icon': { color: statusStyle.color }
            }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: '12px' }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {interview && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3, maxWidth: '100%', overflow: 'hidden' }}>
            {/* Main Content */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, overflow: 'hidden' }}>
              {/* Schedule & Meeting Card */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                maxWidth: '100%'
              }}>
                <Box sx={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  padding: { xs: '16px', sm: '20px', md: '24px' },
                  color: 'white',
                  overflow: 'hidden'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 2 }, mb: 2 }}>
                    <Box sx={{
                      width: { xs: 40, sm: 48 },
                      height: { xs: 40, sm: 48 },
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Videocam sx={{ fontSize: { xs: 20, sm: 24 } }} />
                    </Box>
                    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                      <Typography sx={{ fontSize: { xs: '16px', sm: '20px' }, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {interview.job_title || 'Video Interview'}
                      </Typography>
                      <Typography sx={{ fontSize: { xs: '12px', sm: '14px' }, opacity: 0.9 }}>
                        {interview.duration_minutes} minutes session
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ padding: { xs: '16px', sm: '20px', md: '24px' }, maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: { xs: 2, sm: 3 }, maxWidth: '100%' }}>
                    {/* Date */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 1.5, sm: 2 }, minWidth: 0 }}>
                      <Box sx={{
                        width: { xs: 36, sm: 44 },
                        height: { xs: 36, sm: 44 },
                        borderRadius: '10px',
                        background: '#eff6ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <CalendarMonth sx={{ color: '#3b82f6', fontSize: { xs: 18, sm: 22 } }} />
                      </Box>
                      <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                        <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', mb: 0.5 }}>
                          Date
                        </Typography>
                        <Typography sx={{ fontSize: { xs: '13px', sm: '15px' }, color: '#1e293b', fontWeight: 600, wordBreak: 'break-word' }}>
                          {formatDate(interview.scheduled_at)}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Time */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 1.5, sm: 2 }, minWidth: 0 }}>
                      <Box sx={{
                        width: { xs: 36, sm: 44 },
                        height: { xs: 36, sm: 44 },
                        borderRadius: '10px',
                        background: '#f0fdf4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <AccessTime sx={{ color: '#10b981', fontSize: { xs: 18, sm: 22 } }} />
                      </Box>
                      <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                        <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', mb: 0.5 }}>
                          Time
                        </Typography>
                        <Typography sx={{ fontSize: { xs: '13px', sm: '15px' }, color: '#1e293b', fontWeight: 600 }}>
                          {formatTime(interview.scheduled_at)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* Meeting Link */}
                  {(interview.zoom_meeting_url || interview.zoom_meeting_link) && (
                    <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid #f1f5f9', maxWidth: '100%', overflow: 'hidden' }}>
                      <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                        Meeting Link
                      </Typography>
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        background: '#f8fafc',
                        padding: { xs: '10px 12px', sm: '12px 16px' },
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        maxWidth: '100%',
                        overflow: 'hidden'
                      }}>
                        <Typography sx={{
                          fontSize: { xs: '12px', sm: '14px' },
                          color: '#3b82f6',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          minWidth: 0
                        }}>
                          {interview.zoom_meeting_url || interview.zoom_meeting_link}
                        </Typography>
                        <Tooltip title="Copy Link">
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(interview.zoom_meeting_url || interview.zoom_meeting_link)}
                            sx={{ color: '#64748b', flexShrink: 0, padding: { xs: '4px', sm: '8px' } }}
                          >
                            <ContentCopy sx={{ fontSize: { xs: 16, sm: 18 } }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Open Meeting">
                          <IconButton
                            size="small"
                            onClick={() => window.open(interview.zoom_meeting_url || interview.zoom_meeting_link, '_blank')}
                            sx={{ color: '#3b82f6', flexShrink: 0, padding: { xs: '4px', sm: '8px' } }}
                          >
                            <OpenInNew sx={{ fontSize: { xs: 16, sm: 18 } }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      {interview.zoom_passcode && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
                          <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                            Passcode: <strong style={{ color: '#1e293b' }}>{interview.zoom_passcode}</strong>
                          </Typography>
                          <Tooltip title="Copy Passcode">
                            <IconButton
                              size="small"
                              onClick={() => copyToClipboard(interview.zoom_passcode)}
                              sx={{ color: '#64748b', padding: '4px' }}
                            >
                              <ContentCopy sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* Join Meeting Button */}
                  {(interview.zoom_meeting_url || interview.zoom_meeting_link) && status === 'scheduled' && (
                    <Button
                      variant="contained"
                      startIcon={<Videocam />}
                      onClick={() => window.open(interview.zoom_meeting_url || interview.zoom_meeting_link, '_blank')}
                      sx={{
                        mt: 3,
                        width: '100%',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        padding: '14px',
                        borderRadius: '10px',
                        fontWeight: 600,
                        fontSize: '15px',
                        textTransform: 'none',
                        boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                          boxShadow: '0 6px 20px rgba(245, 158, 11, 0.4)'
                        }
                      }}
                    >
                      Join Meeting
                    </Button>
                  )}
                </Box>
              </Box>

             

              {/* Transcript Section */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: { xs: '16px', sm: '20px', md: '24px' },
                maxWidth: '100%',
                boxSizing: 'border-box',
                overflow: 'hidden'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                  <Typography sx={{ fontSize: { xs: '16px', sm: '18px' }, fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Description sx={{ color: '#8b5cf6' }} />
                    Interview Transcript
                  </Typography>
                  {transcript && (
                    <Tooltip title="Copy Transcript & Go to Manage Candidates">
                      <IconButton
                        onClick={() => {
                          navigator.clipboard.writeText(transcript);
                          toast.success('Transcript copied! Redirecting to Manage Candidates...');
                          setTimeout(() => {
                            navigate(`/recruiter-candidates?jobId=${interview.job_id}&jobTitle=${encodeURIComponent(interview.job_title || '')}`);
                          }, 1000);
                        }}
                        sx={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          '&:hover': {
                            background: '#f59e0b',
                            color: 'white',
                            borderColor: '#f59e0b'
                          }
                        }}
                      >
                        <ContentCopy sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                {/* Show transcript (read-only) — upload happens from Manage Candidates */}
                {transcript ? (
                  <Box>
                    <Box sx={{
                      background: '#f8fafc',
                      borderRadius: '12px',
                      padding: '20px',
                      maxHeight: '300px',
                      overflow: 'auto',
                      border: '1px solid #e2e8f0',
                      mb: 2
                    }}>
                      <Typography
                        component="pre"
                        sx={{
                          fontFamily: 'inherit',
                          fontSize: '14px',
                          color: '#374151',
                          lineHeight: 1.8,
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                          margin: 0
                        }}
                      >
                        {transcript}
                      </Typography>
                    </Box>
                    {!scoreResult && (
                      <Button
                        variant="contained"
                        fullWidth
                        startIcon={<ContentCopy />}
                        onClick={() => {
                          navigator.clipboard.writeText(transcript);
                          toast.success('Transcript copied! Redirecting to Manage Candidates...');
                          setTimeout(() => {
                            navigate(`/recruiter-candidates?jobId=${interview.job_id}&jobTitle=${encodeURIComponent(interview.job_title || '')}`);
                          }, 1000);
                        }}
                        sx={{
                          padding: '12px',
                          borderRadius: '10px',
                          fontWeight: 600,
                          textTransform: 'none',
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          '&:hover': {
                            background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
                          }
                        }}
                      >
                        Copy Transcript & Go to Manage Candidates
                      </Button>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center', py: 3 }}>
                    <Typography sx={{ color: '#94a3b8', fontSize: '14px' }}>
                      No transcript available yet. Transcript will appear here after the interview.
                    </Typography>
                  </Box>
                )}

                {interview.transcript_generated_at && (
                  <Typography sx={{ fontSize: '12px', color: '#94a3b8', mt: 2, textAlign: 'right' }}>
                    Generated: {new Date(interview.transcript_generated_at).toLocaleString()}
                  </Typography>
                )}
              </Box>

              {/* Recording Playback */}
              {interview.recording_url && (
                <Box sx={{
                  background: 'white',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: { xs: '16px', sm: '20px', md: '24px' },
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  overflow: 'hidden'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                    <Typography sx={{
                      fontSize: { xs: '16px', sm: '18px' }, fontWeight: 700, color: '#1e293b',
                      display: 'flex', alignItems: 'center', gap: 1
                    }}>
                      <FiberManualRecord sx={{ color: '#ef4444', fontSize: 20 }} />
                      Interview Recording
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CloudUpload sx={{ transform: 'rotate(180deg)' }} />}
                      href={`${API_BASE_URL}${interview.recording_url}`}
                      target="_blank"
                      download
                      sx={{
                        textTransform: 'none', fontWeight: 600, fontSize: '12px',
                        borderColor: '#e2e8f0', color: '#64748b', borderRadius: '8px',
                        '&:hover': { borderColor: '#f59e0b', color: '#f59e0b' }
                      }}
                    >
                      Download
                    </Button>
                  </Box>
                  <Box sx={{
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                    border: '1px solid #e2e8f0',
                    padding: { xs: '16px', sm: '24px' },
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2
                  }}>
                    <Box sx={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Videocam sx={{ color: 'white', fontSize: 28 }} />
                    </Box>
                    <Typography sx={{ color: '#94a3b8', fontSize: '13px' }}>
                      Video recording of the interview
                    </Typography>
                    <video
                      controls
                      style={{ width: '100%', maxWidth: '640px', borderRadius: '8px' }}
                      src={`${API_BASE_URL}${interview.recording_url}`}
                    >
                      Your browser does not support video playback.
                    </video>
                  </Box>
                  <Typography sx={{ fontSize: '12px', color: '#94a3b8', mt: 1.5 }}>
                    Recording is stored securely and only accessible to authorized recruiters.
                  </Typography>
                </Box>
              )}

              {/* Score Generated - View Result Button */}
              {scoreResult && (
                <Box sx={{
                  background: 'white',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                  maxWidth: '100%'
                }}>
                  <Box sx={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    padding: { xs: '20px', sm: '32px' },
                    color: 'white',
                    textAlign: 'center'
                  }}>
                    <Box sx={{
                      width: { xs: 60, sm: 80 },
                      height: { xs: 60, sm: 80 },
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                      border: '3px solid rgba(255,255,255,0.3)'
                    }}>
                      <CheckCircle sx={{ fontSize: { xs: 30, sm: 40 } }} />
                    </Box>
                    <Typography sx={{ fontSize: { xs: '18px', sm: '22px' }, fontWeight: 700, mb: 1 }}>
                      Score Generated Successfully!
                    </Typography>
                    <Typography sx={{ fontSize: { xs: '13px', sm: '14px' }, opacity: 0.9, mb: 3 }}>
                      Interview has been scored and results are available
                    </Typography>
                    <Button
                      variant="contained"
                      startIcon={<Assessment />}
                      onClick={() => navigate(scoreResult.interview_session_id ? `/results?session=${scoreResult.interview_session_id}` : '/results')}
                      sx={{
                        background: 'white',
                        color: '#059669',
                        padding: { xs: '12px 24px', sm: '14px 32px' },
                        borderRadius: '12px',
                        fontWeight: 700,
                        fontSize: { xs: '14px', sm: '16px' },
                        textTransform: 'none',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                        '&:hover': {
                          background: '#f0fdf4',
                          boxShadow: '0 6px 20px rgba(0,0,0,0.2)'
                        }
                      }}
                    >
                      View Result
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>

            {/* Sidebar */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, overflow: 'hidden' }}>
              {/* Candidate Card */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: { xs: '16px', sm: '24px' },
                maxWidth: '100%',
                boxSizing: 'border-box'
              }}>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Person sx={{ fontSize: 18 }} />
                  Candidate
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                  <Avatar sx={{
                    width: 56,
                    height: 56,
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    fontSize: '20px',
                    fontWeight: 600
                  }}>
                    {interview.candidate_name?.charAt(0).toUpperCase() || 'C'}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
                      {interview.candidate_name || 'N/A'}
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#64748b' }}>
                      ID: {interview.candidate_id}
                    </Typography>
                  </Box>
                </Box>
                <Divider sx={{ my: 2 }} />
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Work sx={{ fontSize: 18 }} />
                  Interviewer
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar sx={{
                    width: 48,
                    height: 48,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    fontSize: '18px',
                    fontWeight: 600
                  }}>
                    {interview.interviewer_name?.charAt(0).toUpperCase() || 'I'}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                      {interview.interviewer_name || 'N/A'}
                    </Typography>
                    <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                      {interview.interviewer_id ? `ID: ${interview.interviewer_id}` : 'Not assigned'}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Quick Actions */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: { xs: '16px', sm: '24px' },
                maxWidth: '100%',
                boxSizing: 'border-box'
              }}>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', mb: 3 }}>
                  Quick Actions
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<Security />}
                    onClick={() => navigate(`/fraud-analysis/${videoId}`)}
                    sx={{
                      justifyContent: 'flex-start',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      borderColor: '#e2e8f0',
                      color: '#475569',
                      fontWeight: 600,
                      textTransform: 'none',
                      '&:hover': {
                        borderColor: '#f59e0b',
                        background: 'rgba(245, 158, 11, 0.05)',
                        color: '#f59e0b'
                      }
                    }}
                  >
                    View Fraud Analysis
                  </Button>
                  <Tooltip title={scoreResult || transcript ? 'Interview completed - Video room not available' : 'Open video room for interview'}>
                    <span style={{ width: '100%' }}>
                      <Button
                        variant="outlined"
                        startIcon={<PlayArrow />}
                        onClick={() => navigate(`/video-room/${videoId}`)}
                        disabled={!!scoreResult || !!transcript || status === 'completed'}
                        sx={{
                          justifyContent: 'flex-start',
                          padding: '12px 16px',
                          borderRadius: '10px',
                          borderColor: '#e2e8f0',
                          color: '#475569',
                          fontWeight: 600,
                          textTransform: 'none',
                          width: '100%',
                          '&:hover': {
                            borderColor: '#3b82f6',
                            background: 'rgba(59, 130, 246, 0.05)',
                            color: '#3b82f6'
                          },
                          '&:disabled': {
                            borderColor: '#e2e8f0',
                            color: '#94a3b8',
                            background: '#f8fafc'
                          }
                        }}
                      >
                        {scoreResult || transcript ? 'Interview Completed' : 'Open Video Room'}
                      </Button>
                    </span>
                  </Tooltip>
                </Box>
              </Box>

              {/* Interview Info */}
              <Box sx={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                borderRadius: '16px',
                padding: { xs: '16px', sm: '24px' },
                border: '1px solid #fbbf24',
                maxWidth: '100%',
                boxSizing: 'border-box'
              }}>
                <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#92400e', mb: 2 }}>
                  ℹ️ Interview Tips
                </Typography>
                <Box component="ul" sx={{
                  margin: 0,
                  paddingLeft: '20px',
                  color: '#78350f',
                  fontSize: '13px',
                  lineHeight: 1.8
                }}>
                  <li>Review candidate resume before the interview</li>
                  <li>Prepare structured questions</li>
                  <li>Take notes during the interview</li>
                  <li>Check fraud analysis after completion</li>
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Navigation>
  );
};

export default VideoInterviewDetail;
