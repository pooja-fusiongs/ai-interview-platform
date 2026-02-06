import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Divider, CircularProgress, Alert,
  Avatar, Chip, IconButton, Tooltip, TextField
} from '@mui/material';
import {
  Videocam, ArrowBack, AccessTime,
  Description, Security, Mic, MicOff, VideocamOff, CallEnd,
  ScreenShare, Chat, MoreVert, FiberManualRecord, VolumeUp,
  ContentCopy, Check, SmartToy, Person, Link as LinkIcon
} from '@mui/icons-material';
import Navigation from '../layout/sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';

// Declare Jitsi types
declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

const VideoInterviewRoom: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ending, setEnding] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [transcriptText, setTranscriptText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [scoreResult, setScoreResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [jitsiLoaded, setJitsiLoaded] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<any>(null);

  // Load Jitsi Meet External API script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = () => {
      setJitsiLoaded(true);
      console.log('✅ Jitsi Meet API loaded');
    };
    script.onerror = () => {
      console.error('❌ Failed to load Jitsi Meet API');
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
        if (data.transcript) {
          setTranscriptText(data.transcript);
        }
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
      // Dispose Jitsi when component unmounts
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
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

  // Initialize Jitsi when interview becomes active
  useEffect(() => {
    if (isActive && jitsiLoaded && jitsiContainerRef.current && !jitsiApiRef.current) {
      initializeJitsi();
    }
  }, [isActive, jitsiLoaded]);

  const initializeJitsi = () => {
    if (!jitsiContainerRef.current || !window.JitsiMeetExternalAPI) {
      console.error('Jitsi container or API not available');
      return;
    }

    // Generate room name from interview data
    const roomName = `Interview-${interview?.job_title?.replace(/\s+/g, '-') || 'Room'}-${videoId}`;

    const domain = 'meet.jit.si';
    const options = {
      roomName: roomName,
      width: '100%',
      height: '100%',
      parentNode: jitsiContainerRef.current,
      userInfo: {
        displayName: interview?.interviewer_name || 'Interviewer'
      },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
        disableDeepLinking: true,
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'closedcaptions', 'desktop',
          'fullscreen', 'fodeviceselection', 'hangup', 'chat',
          'recording', 'settings', 'raisehand', 'videoquality',
          'tileview', 'select-background', 'mute-everyone'
        ],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        BRAND_WATERMARK_LINK: '',
        SHOW_POWERED_BY: false,
        DEFAULT_BACKGROUND: '#1e293b',
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
        MOBILE_APP_PROMO: false,
      }
    };

    try {
      jitsiApiRef.current = new window.JitsiMeetExternalAPI(domain, options);

      // Event listeners
      jitsiApiRef.current.addListener('videoConferenceJoined', () => {
        console.log('✅ Joined video conference');
        toast.success('Connected to video call!');
      });

      jitsiApiRef.current.addListener('participantJoined', (participant: any) => {
        console.log('👤 Participant joined:', participant);
        toast.success(`${participant.displayName || 'Someone'} joined the call`);
      });

      jitsiApiRef.current.addListener('participantLeft', (participant: any) => {
        console.log('👤 Participant left:', participant);
      });

      jitsiApiRef.current.addListener('readyToClose', () => {
        console.log('Jitsi ready to close');
      });

      console.log('✅ Jitsi Meet initialized with room:', roomName);
    } catch (err) {
      console.error('Failed to initialize Jitsi:', err);
      toast.error('Failed to start video call');
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
      await videoInterviewService.startInterview(Number(videoId));
      setIsActive(true);
      setElapsed(0);
      setInterview((prev: any) => ({ ...prev, status: 'in_progress' }));
      toast.success('Interview started! Video call connecting...');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to start interview');
    }
  };

  const handleEnd = async () => {
    try {
      setEnding(true);

      // Dispose Jitsi first
      if (jitsiApiRef.current) {
        jitsiApiRef.current.dispose();
        jitsiApiRef.current = null;
      }

      const result = await videoInterviewService.endInterview(Number(videoId));
      setIsActive(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setInterview(result);
      if (result.transcript) {
        setTranscriptText(result.transcript);
        toast.success('Interview completed! Transcript generated. Review and upload to generate score.');
      } else {
        toast.success('Interview completed! Paste the transcript to generate score.');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to end interview');
    } finally {
      setEnding(false);
    }
  };

  const handleCopyTranscript = async () => {
    if (transcriptText) {
      try {
        await navigator.clipboard.writeText(transcriptText);
        setCopied(true);
        toast.success('Transcript copied to clipboard!');
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        toast.error('Failed to copy transcript');
      }
    }
  };

  const handleCopyMeetingLink = async () => {
    const roomName = `Interview-${interview?.job_title?.replace(/\s+/g, '-') || 'Room'}-${videoId}`;
    const meetingUrl = `https://meet.jit.si/${roomName}`;
    try {
      await navigator.clipboard.writeText(meetingUrl);
      toast.success('Meeting link copied! Share with candidate.');
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  const handleUploadTranscript = async () => {
    if (!transcriptText.trim()) {
      toast.error('Please paste the transcript text');
      return;
    }
    try {
      setUploading(true);
      const result = await videoInterviewService.uploadTranscriptAndScore(Number(videoId), transcriptText);
      setScoreResult(result.score_result);
      toast.success(result.message);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload transcript');
    } finally {
      setUploading(false);
    }
  };

  const toggleMic = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand('toggleAudio');
      setMicOn(!micOn);
    }
  };

  const toggleCam = () => {
    if (jitsiApiRef.current) {
      jitsiApiRef.current.executeCommand('toggleVideo');
      setCamOn(!camOn);
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
          padding: '16px 24px',
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
              <Typography sx={{ color: '#1e293b', fontWeight: 700, fontSize: '18px' }}>
                {interview?.job_title || 'Video Interview'}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: '13px' }}>
                {interview?.candidate_name || 'Candidate'} • Interview #{videoId}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {isActive && (
              <>
                <Chip
                  icon={<FiberManualRecord sx={{ fontSize: 12, color: '#ef4444 !important', animation: 'blink 1s infinite' }} />}
                  label="LIVE"
                  sx={{
                    background: '#fef2f2',
                    color: '#ef4444',
                    fontWeight: 700,
                    fontSize: '12px',
                    border: '1px solid #fecaca',
                    '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } }
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
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
            }}>
              <AccessTime sx={{ color: 'white', fontSize: 20 }} />
              <Typography sx={{ color: 'white', fontFamily: 'monospace', fontWeight: 700, fontSize: '20px' }}>
                {formatTime(elapsed)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', padding: '20px', gap: 3 }}>
          {/* Video Area */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Main Video */}
            <Paper sx={{
              flex: 1,
              background: '#1e293b',
              borderRadius: '20px',
              position: 'relative',
              overflow: 'hidden',
              minHeight: '500px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)'
            }}>
              {isActive ? (
                // Embedded Jitsi Meet Video Call
                <Box
                  ref={jitsiContainerRef}
                  sx={{
                    width: '100%',
                    height: '100%',
                    minHeight: '500px',
                    '& iframe': {
                      borderRadius: '20px',
                    }
                  }}
                />
              ) : isCompleted ? (
                <Box sx={{ textAlign: 'center', width: '100%', maxWidth: 500, mx: 'auto', p: 3 }}>
                  {scoreResult ? (
                    <Box>
                      <Box sx={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        boxShadow: '0 0 40px rgba(16, 185, 129, 0.4)'
                      }}>
                        <Typography sx={{ color: 'white', fontSize: '24px', fontWeight: 700 }}>
                          {Math.round(scoreResult.overall_score)}%
                        </Typography>
                      </Box>
                      <Typography sx={{ color: 'white', fontSize: '20px', fontWeight: 700, mb: 1 }}>
                        Score Generated!
                      </Typography>
                      <Chip
                        label={scoreResult.recommendation?.toUpperCase() || 'N/A'}
                        sx={{
                          mb: 2,
                          fontWeight: 700,
                          background: scoreResult.recommendation === 'select' ? '#10b981' :
                                     scoreResult.recommendation === 'next_round' ? '#f59e0b' : '#ef4444',
                          color: 'white'
                        }}
                      />
                      {scoreResult.strengths && (
                        <Box sx={{ textAlign: 'left', mb: 2 }}>
                          <Typography sx={{ color: '#10b981', fontSize: '14px', fontWeight: 600, mb: 0.5 }}>
                            Strengths:
                          </Typography>
                          <Typography sx={{ color: '#94a3b8', fontSize: '13px' }}>
                            {scoreResult.strengths}
                          </Typography>
                        </Box>
                      )}
                      {scoreResult.weaknesses && (
                        <Box sx={{ textAlign: 'left', mb: 2 }}>
                          <Typography sx={{ color: '#f59e0b', fontSize: '14px', fontWeight: 600, mb: 0.5 }}>
                            Areas to Improve:
                          </Typography>
                          <Typography sx={{ color: '#94a3b8', fontSize: '13px' }}>
                            {scoreResult.weaknesses}
                          </Typography>
                        </Box>
                      )}
                      <Button
                        variant="contained"
                        startIcon={<Description />}
                        onClick={() => navigate(`/video-detail/${videoId}`)}
                        sx={{
                          mt: 2,
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          fontWeight: 600,
                          textTransform: 'none',
                          borderRadius: '10px',
                          padding: '12px 24px'
                        }}
                      >
                        View Full Details
                      </Button>
                    </Box>
                  ) : (
                    <Box>
                      <Typography sx={{ color: 'white', fontSize: '20px', fontWeight: 700, mb: 1 }}>
                        Interview Completed
                      </Typography>
                      <Typography sx={{ color: '#94a3b8', fontSize: '14px', mb: 2 }}>
                        {transcriptText ? 'Review the transcript below, then upload to generate score' : 'Paste the interview transcript below to generate score'}
                      </Typography>

                      {transcriptText && (
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                          <Button
                            size="small"
                            startIcon={copied ? <Check sx={{ fontSize: 16 }} /> : <ContentCopy sx={{ fontSize: 16 }} />}
                            onClick={handleCopyTranscript}
                            sx={{
                              color: copied ? '#10b981' : '#94a3b8',
                              textTransform: 'none',
                              fontSize: '12px',
                              '&:hover': { color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' }
                            }}
                          >
                            {copied ? 'Copied!' : 'Copy Transcript'}
                          </Button>
                        </Box>
                      )}

                      <TextField
                        multiline
                        rows={8}
                        fullWidth
                        placeholder="Paste the interview transcript here..."
                        value={transcriptText}
                        onChange={(e) => setTranscriptText(e.target.value)}
                        sx={{
                          mb: 2,
                          '& .MuiOutlinedInput-root': {
                            background: '#1e293b',
                            color: 'white',
                            borderRadius: '12px',
                            '& fieldset': { borderColor: transcriptText ? '#475569' : '#334155' },
                            '&:hover fieldset': { borderColor: '#475569' },
                            '&.Mui-focused fieldset': { borderColor: '#f59e0b' },
                          },
                          '& .MuiInputBase-input::placeholder': {
                            color: '#64748b',
                            opacity: 1,
                          },
                        }}
                      />
                      <Button
                        variant="contained"
                        fullWidth
                        onClick={handleUploadTranscript}
                        disabled={uploading || !transcriptText.trim()}
                        startIcon={uploading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <Description />}
                        sx={{
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          fontWeight: 600,
                          textTransform: 'none',
                          borderRadius: '10px',
                          padding: '14px 24px',
                          fontSize: '15px',
                          '&:disabled': {
                            background: '#334155',
                            color: '#64748b'
                          }
                        }}
                      >
                        {uploading ? 'Generating Score...' : 'Upload & Generate Score'}
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => navigate(`/video-detail/${videoId}`)}
                        sx={{
                          mt: 2,
                          color: '#64748b',
                          textTransform: 'none',
                          '&:hover': { color: '#94a3b8' }
                        }}
                      >
                        Skip for now
                      </Button>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', p: 4 }}>
                  <Typography sx={{ color: 'white', fontSize: '24px', fontWeight: 700, mb: 1 }}>
                    {interview?.interview_type === 'Both' ? 'Select Interview Mode' :
                     interview?.interview_type === 'AI' ? 'AI Interview' : 'Video Interview'}
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: '14px', mb: 4 }}>
                    {interview?.interview_type === 'Both' ? 'Choose how you want to conduct this interview' :
                     interview?.interview_type === 'AI' ? 'This job is configured for AI-powered interviews' :
                     'This job is configured for manual video interviews'}
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {/* Manual Interview Card - Show if interview_type is "Manual" or "Both" */}
                    {(interview?.interview_type === 'Manual' || interview?.interview_type === 'Both' || !interview?.interview_type) && (
                      <Box
                        sx={{
                          width: 200,
                          p: 3,
                          background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
                          borderRadius: '16px',
                          border: '2px solid #334155',
                          cursor: 'pointer',
                          transition: 'all 0.3s',
                          '&:hover': {
                            border: '2px solid #f59e0b',
                            transform: 'translateY(-4px)',
                            boxShadow: '0 10px 30px rgba(245, 158, 11, 0.2)'
                          }
                        }}
                      >
                        <Box sx={{
                          width: 64,
                          height: 64,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 16px'
                        }}>
                          <Person sx={{ color: 'white', fontSize: 32 }} />
                        </Box>
                        <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '16px', mb: 1 }}>
                          Video Interview
                        </Typography>
                        <Typography sx={{ color: '#94a3b8', fontSize: '12px', mb: 2 }}>
                          Live video call with candidate (FREE Jitsi Meet)
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: '11px', fontStyle: 'italic' }}>
                          Click "Start Interview" below
                        </Typography>
                      </Box>
                    )}

                    {/* AI Interview Card - Show if interview_type is "AI" or "Both" */}
                    {(interview?.interview_type === 'AI' || interview?.interview_type === 'Both' || !interview?.interview_type) && (
                      <Box
                        onClick={() => navigate(`/ai-interview/${videoId}`)}
                        sx={{
                          width: 200,
                          p: 3,
                          background: 'linear-gradient(135deg, #2d1b4e 0%, #0f172a 100%)',
                          borderRadius: '16px',
                          border: '2px solid #334155',
                          cursor: 'pointer',
                          transition: 'all 0.3s',
                          '&:hover': {
                            border: '2px solid #8b5cf6',
                            transform: 'translateY(-4px)',
                            boxShadow: '0 10px 30px rgba(139, 92, 246, 0.2)'
                          }
                        }}
                      >
                        <Box sx={{
                          width: 64,
                          height: 64,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          margin: '0 auto 16px'
                        }}>
                          <SmartToy sx={{ color: 'white', fontSize: 32 }} />
                        </Box>
                        <Typography sx={{ color: 'white', fontWeight: 700, fontSize: '16px', mb: 1 }}>
                          AI Interview
                        </Typography>
                        <Typography sx={{ color: '#94a3b8', fontSize: '12px', mb: 2 }}>
                          AI asks questions one-by-one, candidate types answers
                        </Typography>
                        <Chip
                          label="Click to Start"
                          size="small"
                          sx={{
                            background: 'rgba(139, 92, 246, 0.2)',
                            color: '#a78bfa',
                            fontWeight: 600,
                            fontSize: '10px'
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
            </Paper>

            {/* Control Bar */}
            <Paper sx={{
              background: 'white',
              borderRadius: '16px',
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              {!isCompleted && (
                <>
                  <Tooltip title={micOn ? 'Mute' : 'Unmute'}>
                    <IconButton
                      onClick={toggleMic}
                      disabled={!isActive}
                      sx={{
                        width: 56,
                        height: 56,
                        background: micOn ? '#f1f5f9' : '#fef2f2',
                        border: micOn ? '1px solid #e2e8f0' : '1px solid #fecaca',
                        '&:hover': { background: micOn ? '#e2e8f0' : '#fee2e2' },
                        '&:disabled': { opacity: 0.5 }
                      }}
                    >
                      {micOn ? <Mic sx={{ color: '#1e293b' }} /> : <MicOff sx={{ color: '#ef4444' }} />}
                    </IconButton>
                  </Tooltip>

                  <Tooltip title={camOn ? 'Turn off camera' : 'Turn on camera'}>
                    <IconButton
                      onClick={toggleCam}
                      disabled={!isActive}
                      sx={{
                        width: 56,
                        height: 56,
                        background: camOn ? '#f1f5f9' : '#fef2f2',
                        border: camOn ? '1px solid #e2e8f0' : '1px solid #fecaca',
                        '&:hover': { background: camOn ? '#e2e8f0' : '#fee2e2' },
                        '&:disabled': { opacity: 0.5 }
                      }}
                    >
                      {camOn ? <Videocam sx={{ color: '#1e293b' }} /> : <VideocamOff sx={{ color: '#ef4444' }} />}
                    </IconButton>
                  </Tooltip>

                  <Divider orientation="vertical" sx={{ height: 40, mx: 1 }} />

                  {!isActive ? (
                    <Button
                      variant="contained"
                      startIcon={<Videocam />}
                      onClick={handleStart}
                      disabled={!jitsiLoaded}
                      sx={{
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        padding: '14px 36px',
                        borderRadius: '28px',
                        fontWeight: 600,
                        fontSize: '15px',
                        textTransform: 'none',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                          boxShadow: '0 6px 20px rgba(16, 185, 129, 0.5)'
                        },
                        '&:disabled': {
                          background: '#94a3b8'
                        }
                      }}
                    >
                      {jitsiLoaded ? 'Start Interview' : 'Loading...'}
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      startIcon={ending ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <CallEnd />}
                      onClick={handleEnd}
                      disabled={ending}
                      sx={{
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        padding: '14px 36px',
                        borderRadius: '28px',
                        fontWeight: 600,
                        fontSize: '15px',
                        textTransform: 'none',
                        boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                          boxShadow: '0 6px 20px rgba(239, 68, 68, 0.5)'
                        }
                      }}
                    >
                      {ending ? 'Ending...' : 'End Interview'}
                    </Button>
                  )}
                </>
              )}
            </Paper>
          </Box>

          {/* Sidebar */}
          <Box sx={{ width: 340, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Participants */}
            <Paper sx={{
              background: 'white',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <Typography sx={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                Participants
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 2, background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <Avatar sx={{ width: 44, height: 44, background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}>
                  {interview?.candidate_name?.charAt(0).toUpperCase() || 'C'}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#1e293b', fontWeight: 600, fontSize: '14px' }}>
                    {interview?.candidate_name || 'Candidate'}
                  </Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '12px' }}>Candidate</Typography>
                </Box>
                {isActive && <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }} />}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <Avatar sx={{ width: 44, height: 44, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                  {interview?.interviewer_name?.charAt(0).toUpperCase() || 'I'}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#1e293b', fontWeight: 600, fontSize: '14px' }}>
                    {interview?.interviewer_name || 'Interviewer'}
                  </Typography>
                  <Typography sx={{ color: '#64748b', fontSize: '12px' }}>Interviewer (You)</Typography>
                </Box>
                {isActive && <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />}
              </Box>
            </Paper>

            {/* Meeting Link */}
            {isActive && (
              <Paper sx={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid #bfdbfe'
              }}>
                <Typography sx={{ color: '#1e40af', fontWeight: 700, fontSize: '14px', mb: 1 }}>
                  📎 Share Meeting Link
                </Typography>
                <Typography sx={{ color: '#3b82f6', fontSize: '12px', mb: 2 }}>
                  Send this link to the candidate to join:
                </Typography>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<ContentCopy />}
                  onClick={handleCopyMeetingLink}
                  sx={{
                    borderColor: '#3b82f6',
                    color: '#3b82f6',
                    textTransform: 'none',
                    fontWeight: 600,
                    '&:hover': {
                      background: '#3b82f6',
                      color: 'white'
                    }
                  }}
                >
                  Copy Meeting Link
                </Button>
              </Paper>
            )}

            {/* Interview Info */}
            <Paper sx={{
              background: 'white',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <Typography sx={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                Interview Details
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>Position</Typography>
                  <Typography sx={{ color: '#1e293b', fontSize: '14px', fontWeight: 600 }}>{interview?.job_title || 'N/A'}</Typography>
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>Duration</Typography>
                  <Typography sx={{ color: '#1e293b', fontSize: '14px', fontWeight: 600 }}>{interview?.duration_minutes || 30} min</Typography>
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>Status</Typography>
                  <Chip
                    label={interview?.status?.replace('_', ' ').toUpperCase()}
                    size="small"
                    sx={{
                      fontWeight: 700,
                      fontSize: '11px',
                      background: interview?.status === 'completed' ? '#ecfdf5' : interview?.status === 'in_progress' ? '#fffbeb' : '#eff6ff',
                      color: interview?.status === 'completed' ? '#10b981' : interview?.status === 'in_progress' ? '#f59e0b' : '#3b82f6',
                      border: `1px solid ${interview?.status === 'completed' ? '#a7f3d0' : interview?.status === 'in_progress' ? '#fde68a' : '#bfdbfe'}`
                    }}
                  />
                </Box>
              </Box>
            </Paper>

            {/* Quick Actions */}
            <Paper sx={{
              background: 'white',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
              <Typography sx={{ color: '#64748b', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', mb: 2 }}>
                Quick Actions
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Button
                  fullWidth
                  startIcon={<Description />}
                  onClick={() => navigate(`/video-detail/${videoId}`)}
                  sx={{
                    justifyContent: 'flex-start',
                    color: '#475569',
                    textTransform: 'none',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
                    '&:hover': { background: '#f8fafc', borderColor: '#f59e0b', color: '#f59e0b' }
                  }}
                >
                  View Details & Transcript
                </Button>
                <Button
                  fullWidth
                  startIcon={<Security />}
                  onClick={() => navigate(`/fraud-analysis/${videoId}`)}
                  sx={{
                    justifyContent: 'flex-start',
                    color: '#475569',
                    textTransform: 'none',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    border: '1px solid #e2e8f0',
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
