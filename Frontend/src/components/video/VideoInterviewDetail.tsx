import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Chip, CircularProgress, Alert,
  TextField, Button, IconButton, Tooltip, Avatar, Divider
} from '@mui/material';
import {
  ArrowBack,
  CalendarMonth,
  AccessTime,
  Videocam,
  Person,
  Work,
  Security,
  Save,
  ContentCopy,
  OpenInNew,
  PlayArrow,
  Cancel,
  CheckCircle,
  Description,
  Refresh
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';

const statusConfig: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
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
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const data = await videoInterviewService.getInterview(Number(videoId));
        setInterview(data);
        setNotes(data.notes || '');
        // Set transcript if it exists in the response
        if (data.transcript) {
          setTranscript(data.transcript);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load interview details.');
      } finally {
        setLoading(false);
      }
    };
    if (videoId) fetchInterview();
  }, [videoId]);

  const fetchTranscript = async () => {
    try {
      setTranscriptLoading(true);
      const data = await videoInterviewService.getTranscript(Number(videoId));
      setTranscript(data.transcript);
      toast.success('Transcript loaded successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to load transcript');
    } finally {
      setTranscriptLoading(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      setSaving(true);
      await videoInterviewService.updateNotes(Number(videoId), notes);
      toast.success('Notes saved successfully');
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

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
        padding: { xs: '12px', sm: '16px', md: '24px' }
      }}>
        {/* Header */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: 3, gap: { xs: 2, sm: 0 } }}>
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
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>
            {/* Main Content */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Schedule & Meeting Card */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden'
              }}>
                <Box sx={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  padding: '24px',
                  color: 'white'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Box sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Videocam sx={{ fontSize: 24 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '20px', fontWeight: 700 }}>
                        {interview.job_title || 'Video Interview'}
                      </Typography>
                      <Typography sx={{ fontSize: '14px', opacity: 0.9 }}>
                        {interview.duration_minutes} minutes session
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ padding: '24px' }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
                    {/* Date */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Box sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '10px',
                        background: '#eff6ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <CalendarMonth sx={{ color: '#3b82f6', fontSize: 22 }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', mb: 0.5 }}>
                          Date
                        </Typography>
                        <Typography sx={{ fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>
                          {formatDate(interview.scheduled_at)}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Time */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      <Box sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '10px',
                        background: '#f0fdf4',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <AccessTime sx={{ color: '#10b981', fontSize: 22 }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', mb: 0.5 }}>
                          Time
                        </Typography>
                        <Typography sx={{ fontSize: '15px', color: '#1e293b', fontWeight: 600 }}>
                          {formatTime(interview.scheduled_at)}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  {/* Meeting Link */}
                  {(interview.zoom_meeting_url || interview.zoom_meeting_link) && (
                    <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid #f1f5f9' }}>
                      <Typography sx={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                        Meeting Link
                      </Typography>
                      <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        background: '#f8fafc',
                        padding: '12px 16px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0'
                      }}>
                        <Typography sx={{
                          fontSize: '14px',
                          color: '#3b82f6',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {interview.zoom_meeting_url || interview.zoom_meeting_link}
                        </Typography>
                        <Tooltip title="Copy Link">
                          <IconButton
                            size="small"
                            onClick={() => copyToClipboard(interview.zoom_meeting_url || interview.zoom_meeting_link)}
                            sx={{ color: '#64748b' }}
                          >
                            <ContentCopy sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Open Meeting">
                          <IconButton
                            size="small"
                            onClick={() => window.open(interview.zoom_meeting_url || interview.zoom_meeting_link, '_blank')}
                            sx={{ color: '#3b82f6' }}
                          >
                            <OpenInNew sx={{ fontSize: 18 }} />
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

              {/* Notes Section */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '24px'
              }}>
                <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <i className="fas fa-sticky-note" style={{ color: '#f59e0b' }}></i>
                  Interview Notes
                </Typography>
                <TextField
                  multiline
                  rows={5}
                  fullWidth
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about the interview, candidate performance, observations..."
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '12px',
                      background: '#f8fafc',
                      '&:hover': { background: '#f1f5f9' },
                      '&.Mui-focused': { background: 'white' }
                    }
                  }}
                />
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={18} sx={{ color: 'white' }} /> : <Save />}
                  onClick={handleSaveNotes}
                  disabled={saving}
                  sx={{
                    mt: 2,
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    padding: '10px 24px',
                    borderRadius: '10px',
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
                    }
                  }}
                >
                  {saving ? 'Saving...' : 'Save Notes'}
                </Button>
              </Box>

              {/* Transcript Section */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '24px'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography sx={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Description sx={{ color: '#8b5cf6' }} />
                    Interview Transcript
                  </Typography>
                  {!transcript && status === 'completed' && (
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={transcriptLoading ? <CircularProgress size={16} /> : <Refresh />}
                      onClick={fetchTranscript}
                      disabled={transcriptLoading}
                      sx={{
                        borderRadius: '8px',
                        textTransform: 'none',
                        fontWeight: 600,
                        borderColor: '#8b5cf6',
                        color: '#8b5cf6',
                        '&:hover': {
                          borderColor: '#7c3aed',
                          background: 'rgba(139, 92, 246, 0.05)'
                        }
                      }}
                    >
                      {transcriptLoading ? 'Loading...' : 'Generate Transcript'}
                    </Button>
                  )}
                </Box>

                {transcript ? (
                  <Box sx={{
                    background: '#f8fafc',
                    borderRadius: '12px',
                    padding: '20px',
                    maxHeight: '400px',
                    overflow: 'auto',
                    border: '1px solid #e2e8f0',
                    position: 'relative'
                  }}>
                    {/* Copy Button */}
                    <Tooltip title="Copy Transcript">
                      <IconButton
                        onClick={() => copyToClipboard(transcript)}
                        sx={{
                          position: 'absolute',
                          top: 12,
                          right: 12,
                          background: 'white',
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
                    <Typography
                      component="pre"
                      sx={{
                        fontFamily: 'inherit',
                        fontSize: '14px',
                        color: '#374151',
                        lineHeight: 1.8,
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word',
                        margin: 0,
                        paddingRight: '40px' // Space for copy button
                      }}
                    >
                      {transcript}
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{
                    background: '#f8fafc',
                    borderRadius: '12px',
                    padding: '40px',
                    textAlign: 'center',
                    border: '1px dashed #e2e8f0'
                  }}>
                    <Description sx={{ fontSize: 48, color: '#cbd5e1', mb: 2 }} />
                    <Typography sx={{ fontSize: '15px', color: '#64748b', mb: 1 }}>
                      No transcript available
                    </Typography>
                    <Typography sx={{ fontSize: '13px', color: '#94a3b8' }}>
                      {status === 'completed'
                        ? 'Click "Generate Transcript" to create the interview transcript'
                        : 'Transcript will be generated when the interview is completed'}
                    </Typography>
                  </Box>
                )}

                {interview.transcript_generated_at && (
                  <Typography sx={{ fontSize: '12px', color: '#94a3b8', mt: 2, textAlign: 'right' }}>
                    Generated: {new Date(interview.transcript_generated_at).toLocaleString()}
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Sidebar */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Candidate Card */}
              <Box sx={{
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '24px'
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
                padding: '24px'
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
                  <Button
                    variant="outlined"
                    startIcon={<PlayArrow />}
                    onClick={() => navigate(`/video-room/${videoId}`)}
                    sx={{
                      justifyContent: 'flex-start',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      borderColor: '#e2e8f0',
                      color: '#475569',
                      fontWeight: 600,
                      textTransform: 'none',
                      '&:hover': {
                        borderColor: '#3b82f6',
                        background: 'rgba(59, 130, 246, 0.05)',
                        color: '#3b82f6'
                      }
                    }}
                  >
                    Open Video Room
                  </Button>
                </Box>
              </Box>

              {/* Interview Info */}
              <Box sx={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #fbbf24'
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
