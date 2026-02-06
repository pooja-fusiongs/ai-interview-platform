import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Divider, CircularProgress, Alert,
  Avatar, Chip, IconButton, Tooltip
} from '@mui/material';
import {
  Videocam, ArrowBack, AccessTime,
  Description, Security, 
  Check, SmartToy, Person, Link as LinkIcon, ContentCopy
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

// Declare Daily.co types
declare global {
  interface Window {
    DailyIframe: any;
  }
}

const VideoInterviewRoom: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [dailyLoaded, setDailyLoaded] = useState(false);
  const [callJoined, setCallJoined] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dailyContainerRef = useRef<HTMLDivElement>(null);
  const dailyCallRef = useRef<any>(null);

  // Load Daily.co script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@daily-co/daily-js';
    script.async = true;
    script.onload = () => {
      setDailyLoaded(true);
      console.log('✅ Daily.co SDK loaded');
    };
    script.onerror = () => {
      console.error('❌ Failed to load Daily.co SDK');
      toast.error('Failed to load video call. Please refresh the page.');
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const data = await videoInterviewService.getInterview(Number(videoId));
        setInterview(data);
        if (data.status === 'in_progress') {
          setIsActive(true);
          if (data.started_at) {
            const startTime = new Date(data.started_at).getTime();
            const now = Date.now();
            setElapsed(Math.floor((now - startTime) / 1000));
          }
        }
      } catch (err: any) {
        setError(err.response?.data?.detail || err.message || 'Failed to load interview.');
      } finally {
        setLoading(false);
      }
    };
    if (videoId) fetchInterview();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Leave Daily call when component unmounts
      if (dailyCallRef.current) {
        dailyCallRef.current.leave();
        dailyCallRef.current.destroy();
        dailyCallRef.current = null;
      }
    };
  }, [videoId]);

  // Timer effect
  useEffect(() => {
    if (isActive) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setElapsed((prev) => prev + 1);
        }, 1000);
      }
    }
    return () => {
      if (!isActive && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);

  // Initialize Daily.co when interview becomes active
  useEffect(() => {
    if (isActive && dailyLoaded && dailyContainerRef.current && !dailyCallRef.current && interview?.zoom_meeting_url) {
      initializeDaily();
    }
  }, [isActive, dailyLoaded, interview]);

  const initializeDaily = async () => {
    if (!dailyContainerRef.current || !window.DailyIframe) {
      console.error('Daily container or SDK not available');
      return;
    }

    const meetingUrl = interview?.zoom_meeting_url;
    if (!meetingUrl) {
      console.error('No meeting URL available');
      toast.error('Meeting URL not available');
      return;
    }

    console.log('🎥 Initializing Daily.co with URL:', meetingUrl);

    try {
      // Create Daily.co call frame
      dailyCallRef.current = window.DailyIframe.createFrame(dailyContainerRef.current, {
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: '0',
          borderRadius: '20px',
        },
        showLeaveButton: false, // We have our own end button
        showFullscreenButton: true,
      });

      // Event listeners
      dailyCallRef.current.on('joined-meeting', () => {
        console.log('✅ Joined Daily.co meeting');
        setCallJoined(true);
        toast.success('Connected to video call!');
      });

      dailyCallRef.current.on('participant-joined', (event: any) => {
        console.log('👤 Participant joined:', event.participant);
        if (!event.participant.local) {
          toast.success(`${event.participant.user_name || 'Someone'} joined the call`);
        }
      });

      dailyCallRef.current.on('participant-left', (event: any) => {
        console.log('👤 Participant left:', event.participant);
      });

      dailyCallRef.current.on('error', (error: any) => {
        console.error('Daily.co error:', error);
        toast.error('Video call error. Please try again.');
      });

      // Determine username based on current user's role
      let displayName = 'Participant';
      if (user?.role === 'candidate') {
        // Candidate joining - show candidate name
        displayName = interview?.candidate_name || user?.name || 'Candidate';
      } else {
        // Recruiter/Admin joining - show interviewer name
        displayName = interview?.interviewer_name || user?.name || 'Interviewer';
      }

      // Join the meeting
      await dailyCallRef.current.join({
        url: meetingUrl,
        userName: displayName,
      });

      console.log('✅ Daily.co call initialized');
    } catch (err) {
      console.error('Failed to initialize Daily.co:', err);
      toast.error('Failed to start video call. Please try again.');
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const handleStart = async () => {
    try {
      // Try to request permissions, but don't block if no camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => track.stop());
        console.log('✅ Media permissions granted');
      } catch (err: any) {
        console.warn('⚠️ Media device warning:', err.name);
        // Don't block - just warn and continue
        if (err.name === 'NotFoundError') {
          toast('No camera/mic found. Video call will open anyway.', { icon: '⚠️' });
        } else {
          toast('Camera access issue. Video call will open anyway.', { icon: '⚠️' });
        }
      }

      await videoInterviewService.startInterview(Number(videoId));

      // Refresh interview data to get the meeting URL
      const data = await videoInterviewService.getInterview(Number(videoId));
      setInterview(data);

      setIsActive(true);
      setElapsed(0);
      toast.success('Interview started! Connecting to video call...');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to start interview');
    }
  };

  

  const handleCopyMeetingLink = async () => {
    const meetingUrl = interview?.zoom_meeting_url;
    if (meetingUrl) {
      try {
        await navigator.clipboard.writeText(meetingUrl);
        toast.success('Meeting link copied! Share with candidate.');
      } catch (err) {
        toast.error('Failed to copy link');
      }
    } else {
      toast.error('Meeting link not available yet. Start the interview first.');
    }
  };

  if (loading) {
    return (
      <Navigation>
        <Box sx={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          minHeight: '100vh', background: 'linear-gradient(180deg, #f8f9fb 0%, #eef2f6 100%)'
        }}>
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress sx={{ color: '#f59e0b', mb: 2 }} />
            <Typography sx={{ color: '#64748b' }}>Loading interview room...</Typography>
          </Box>
        </Box>
      </Navigation>
    );
  }

  const isCompleted = interview?.status === 'completed';

  return (
    <Navigation>
      <Box sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f8f9fb 0%, #eef2f6 100%)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Top Bar */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: { xs: '12px 16px', sm: '16px 24px' },
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          flexWrap: 'wrap',
          gap: { xs: 2, sm: 0 }
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
            <IconButton
              onClick={() => navigate('/video-interviews')}
              sx={{
                color: '#64748b',
                background: '#f1f5f9',
                '&:hover': { background: '#e2e8f0' }
              }}
            >
              <ArrowBack />
            </IconButton>
            <Box>
              <Typography sx={{ color: '#1e293b', fontWeight: 700, fontSize: { xs: '14px', sm: '18px' } }}>
                {interview?.job_title || 'Video Interview'}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: { xs: '11px', sm: '13px' } }}>
                {interview?.candidate_name || 'Candidate'} • Interview #{videoId}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 } }}>
            {isActive && (
              <>
                <Chip
                  icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'blink 1s infinite', '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />}
                  label={callJoined ? "LIVE" : "CONNECTING..."}
                  sx={{
                    background: '#fef2f2',
                    color: '#ef4444',
                    fontWeight: 700,
                    fontSize: '12px',
                    border: '1px solid #fecaca',
                  }}
                />
                <Tooltip title="Copy meeting link for candidate">
                  <IconButton onClick={handleCopyMeetingLink} sx={{ color: '#64748b' }}>
                    <LinkIcon />
                  </IconButton>
                </Tooltip>
              </>
            )}
            <Box sx={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              borderRadius: '10px',
              padding: { xs: '8px 12px', sm: '10px 20px' },
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
            }}>
              <AccessTime sx={{ color: 'white', fontSize: { xs: 16, sm: 20 } }} />
              <Typography sx={{ color: 'white', fontFamily: 'monospace', fontWeight: 700, fontSize: { xs: '16px', sm: '20px' } }}>
                {formatTime(elapsed)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', padding: { xs: '12px', sm: '20px' }, gap: { xs: 2, sm: 3 }, flexDirection: { xs: 'column', lg: 'row' } }}>
          {/* Video Area */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Main Video */}
            <Paper sx={{
              flex: 1,
              background: '#1e293b',
              borderRadius: { xs: '12px', sm: '20px' },
              position: 'relative',
              overflow: 'hidden',
              minHeight: { xs: '300px', sm: '400px', md: '500px' },
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
            }}>
              {isActive ? (
                // Daily.co Video Call
                <Box
                  ref={dailyContainerRef}
                  sx={{
                    width: '100%',
                    height: '100%',
                    minHeight: '500px',
                  }}
                />
              ) : isCompleted ? (
                <Box sx={{ textAlign: 'center', width: '100%', maxWidth: 500, mx: 'auto', p: 3 }}>
                  <Box sx={{
                    width: 80, height: 80, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px',
                    boxShadow: '0 0 40px rgba(16, 185, 129, 0.4)'
                  }}>
                    <Check sx={{ color: 'white', fontSize: 40 }} />
                  </Box>
                  <Typography sx={{ color: 'white', fontSize: '24px', fontWeight: 700, mb: 1 }}>
                    Interview Completed
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: '14px', mb: 3 }}>
                    Go to Interview Details to upload transcript and generate score
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<Description />}
                    onClick={() => navigate(`/video-detail/${videoId}`)}
                    sx={{
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      fontWeight: 600, textTransform: 'none', borderRadius: '10px', padding: '14px 32px',
                      fontSize: '15px',
                      boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
                      }
                    }}
                  >
                    View Details & Upload Transcript
                  </Button>
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', p: { xs: 2, sm: 4 } }}>
                  <Typography sx={{ color: 'white', fontSize: { xs: '18px', sm: '24px' }, fontWeight: 700, mb: 1 }}>
                    Select Interview Mode
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: { xs: '12px', sm: '14px' }, mb: { xs: 2, sm: 4 } }}>
                    Choose how you want to conduct this interview
                  </Typography>

                  <Box sx={{ display: 'flex', gap: { xs: 2, sm: 3 }, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {/* Video Interview Card */}
                    <Box sx={{
                      width: { xs: 160, sm: 200 }, p: { xs: 2, sm: 3 },
                      background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
                      borderRadius: '16px', border: '2px solid #334155',
                      cursor: 'pointer', transition: 'all 0.3s',
                      '&:hover': { border: '2px solid #f59e0b', transform: 'translateY(-4px)' }
                    }}>
                      <Box sx={{
                        width: 64, height: 64, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px'
                      }}>
                        <Person sx={{ color: 'white', fontSize: 32 }} />
                      </Box>
                      <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '16px', mb: 1 }}>
                        Video Interview
                      </Typography>
                      <Typography sx={{ color: '#94a3b8', fontSize: '12px', mb: 2 }}>
                        Live HD video call with candidate
                      </Typography>
                      <Chip label="Zoom-like Quality" size="small" sx={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', fontSize: '10px' }} />
                    </Box>

                    {/* AI Interview Card */}
                    <Box
                      onClick={() => navigate(`/ai-interview/${videoId}`)}
                      sx={{
                        width: { xs: 160, sm: 200 }, p: { xs: 2, sm: 3 },
                        background: 'linear-gradient(135deg, #2d1b4e 0%, #0f172a 100%)',
                        borderRadius: '16px', border: '2px solid #334155',
                        cursor: 'pointer', transition: 'all 0.3s',
                        '&:hover': { border: '2px solid #8b5cf6', transform: 'translateY(-4px)' }
                      }}
                    >
                      <Box sx={{
                        width: 64, height: 64, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px'
                      }}>
                        <SmartToy sx={{ color: 'white', fontSize: 32 }} />
                      </Box>
                      <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '16px', mb: 1 }}>
                        AI Interview
                      </Typography>
                      <Typography sx={{ color: '#94a3b8', fontSize: '12px', mb: 2 }}>
                        AI asks questions, auto-scoring
                      </Typography>
                      <Chip label="Click to Start" size="small" sx={{ background: 'rgba(139, 92, 246, 0.2)', color: '#a78bfa', fontSize: '10px' }} />
                    </Box>
                  </Box>
                </Box>
              )}
            </Paper>

            {/* Control Bar - Only show Start button before meeting, hide controls after (Jitsi has its own) */}
            {!isActive && !isCompleted && (
              <Paper sx={{
                background: 'white', borderRadius: { xs: '12px', sm: '16px' }, padding: { xs: '12px 16px', sm: '16px 24px' },
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: { xs: 1, sm: 2 },
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)', flexWrap: 'wrap'
              }}>
                <Button
                  variant="contained"
                  startIcon={<Videocam />}
                  onClick={handleStart}
                  disabled={!dailyLoaded}
                  sx={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    padding: { xs: '10px 20px', sm: '14px 36px' }, borderRadius: '28px',
                    fontWeight: 600, fontSize: { xs: '13px', sm: '15px' }, textTransform: 'none',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                    '&:hover': { background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' },
                    '&:disabled': { background: '#94a3b8' }
                  }}
                >
                  {dailyLoaded ? 'Start Meeting' : 'Loading...'}
                </Button>
              </Paper>
            )}
          </Box>

          {/* Sidebar */}
          <Box sx={{ width: { xs: '100%', lg: 340 }, display: 'flex', flexDirection: 'column', gap: { xs: 2, sm: 3 } }}>
            {/* Participants */}
            <Paper sx={{ background: 'white', borderRadius: { xs: '12px', sm: '16px' }, padding: { xs: '16px', sm: '20px' }, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <Typography sx={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                Participants
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 2, background: '#f8fafc', borderRadius: '12px' }}>
                <Avatar sx={{ width: 44, height: 44, background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}>
                  {interview?.candidate_name?.charAt(0).toUpperCase() || 'C'}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#1e293b', fontWeight: 600, fontSize: '14px' }}>
                    {interview?.candidate_name || 'Candidate'}
                  </Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '12px' }}>
                    Candidate{(user?.role === 'candidate' || user?.name?.toLowerCase() === interview?.candidate_name?.toLowerCase()) ? ' (You)' : ''}
                  </Typography>
                </Box>
                {callJoined && <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }} />}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, background: '#f8fafc', borderRadius: '12px' }}>
                <Avatar sx={{ width: 44, height: 44, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                  {interview?.interviewer_name?.charAt(0).toUpperCase() || 'I'}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#1e293b', fontWeight: 600, fontSize: '14px' }}>
                    {interview?.interviewer_name || 'Interviewer'}
                  </Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '12px' }}>
                    Interviewer{(user?.role !== 'candidate' && user?.name?.toLowerCase() === interview?.interviewer_name?.toLowerCase()) ? ' (You)' : ''}
                  </Typography>
                </Box>
                {callJoined && <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />}
              </Box>
            </Paper>

            {/* Meeting Link */}
            {isActive && interview?.zoom_meeting_url && (
              <Paper sx={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                borderRadius: '16px', padding: '20px', border: '1px solid #bfdbfe'
              }}>
                <Typography sx={{ color: '#1e40af', fontWeight: 700, fontSize: '14px', mb: 1 }}>
                  📎 Share Meeting Link
                </Typography>
                <Typography sx={{ color: '#3b82f6', fontSize: '12px', mb: 1 }}>
                  Send this link to the candidate:
                </Typography>
                <Box sx={{
                  background: 'white', borderRadius: '8px', p: 1.5, mb: 2,
                  border: '1px solid #93c5fd', wordBreak: 'break-all'
                }}>
                  <Typography sx={{ color: '#1e40af', fontSize: '10px', fontFamily: 'monospace', fontWeight: 600 }}>
                    {interview.zoom_meeting_url}
                  </Typography>
                </Box>
                <Button
                  fullWidth variant="outlined"
                  startIcon={<ContentCopy />}
                  onClick={handleCopyMeetingLink}
                  sx={{
                    borderColor: '#3b82f6', color: '#3b82f6',
                    textTransform: 'none', fontWeight: 600,
                    '&:hover': { background: '#3b82f6', color: 'white' }
                  }}
                >
                  Copy Meeting Link
                </Button>
              </Paper>
            )}

            {/* Interview Info */}
            <Paper sx={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <Typography sx={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                Interview Details
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>Position</Typography>
                  <Typography sx={{ color: '#1e293b', fontSize: '14px', fontWeight: 600 }}>{interview?.job_title || 'N/A'}</Typography>
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>Duration</Typography>
                  <Typography sx={{ color: '#1e293b', fontSize: '14px', fontWeight: 600 }}>{interview?.duration_minutes || 30} min</Typography>
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>Status</Typography>
                  <Chip
                    label={interview?.status?.replace('_', ' ').toUpperCase()}
                    size="small"
                    sx={{
                      fontWeight: 700, fontSize: '11px',
                      background: interview?.status === 'completed' ? '#ecfdf5' : interview?.status === 'in_progress' ? '#fffbeb' : '#eff6ff',
                      color: interview?.status === 'completed' ? '#10b981' : interview?.status === 'in_progress' ? '#f59e0b' : '#3b82f6',
                    }}
                  />
                </Box>
              </Box>
            </Paper>

            {/* Quick Actions */}
            <Paper sx={{ background: 'white', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <Typography sx={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                Quick Actions
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  fullWidth startIcon={<Description />}
                  onClick={() => navigate(`/video-detail/${videoId}`)}
                  sx={{
                    justifyContent: 'flex-start', color: '#475569', textTransform: 'none',
                    borderRadius: '10px', padding: '12px 16px', border: '1px solid #e2e8f0',
                    '&:hover': { background: '#f8fafc', borderColor: '#f59e0b', color: '#f59e0b' }
                  }}
                >
                  View Details & Transcript
                </Button>
                <Button
                  fullWidth startIcon={<Security />}
                  onClick={() => navigate(`/fraud-analysis/${videoId}`)}
                  sx={{
                    justifyContent: 'flex-start', color: '#475569', textTransform: 'none',
                    borderRadius: '10px', padding: '12px 16px', border: '1px solid #e2e8f0',
                    '&:hover': { background: '#f8fafc', borderColor: '#f59e0b', color: '#f59e0b' }
                  }}
                >
                  Fraud Analysis
                </Button>
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>
    </Navigation>
  );
};

export default VideoInterviewRoom;
