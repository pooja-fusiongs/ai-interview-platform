import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Divider, CircularProgress, Alert,
  Avatar, Chip, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions
} from '@mui/material';
import {
  Videocam, ArrowBack, AccessTime,
  Description, Security, CallEnd,
  Check, SmartToy, Person, Link as LinkIcon, ContentCopy,
  FiberManualRecord
} from '@mui/icons-material';
import Navigation from '../layout/Sidebar';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';

const VideoInterviewRoom: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [callJoined, setCallJoined] = useState(false);
  const [ending, setEnding] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadingRecording, setUploadingRecording] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);
  const jitsiApiRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const data = await videoInterviewService.getInterview(Number(videoId));
        setInterview(data);
        if (data.status === 'in_progress') {
          if (user?.role === 'candidate') {
            // Candidate joining an in-progress interview: show consent dialog first
            setShowConsentDialog(true);
          } else {
            // Recruiter/Admin: auto-join directly
            setIsActive(true);
          }
          if (data.started_at) {
            // Ensure timestamp is parsed as UTC (append 'Z' if no timezone info)
            const ts = data.started_at;
            const utcTimestamp = ts.endsWith('Z') || ts.includes('+') || ts.includes('-', ts.indexOf('T'))
              ? ts
              : ts + 'Z';
            const startTime = new Date(utcTimestamp).getTime();
            const now = Date.now();
            const diff = Math.floor((now - startTime) / 1000);
            // If elapsed time is unreasonably large (>24 hours), reset to 0
            setElapsed(diff > 86400 ? 0 : Math.max(0, diff));
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
      cleanupVideoCall();
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
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]);

  // Initialize video call when interview becomes active
  useEffect(() => {
    if (isActive && videoContainerRef.current && interview?.zoom_meeting_url) {
      initializeVideo();
    }
  }, [isActive, interview]);

  const loadJitsiScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).JitsiMeetExternalAPI) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Jitsi API'));
      document.head.appendChild(script);
    });
  };

  const initializeVideo = async () => {
    if (!videoContainerRef.current) {
      console.error('Video container not available');
      return;
    }

    const meetingUrl = interview?.zoom_meeting_url;
    if (!meetingUrl) {
      console.error('No meeting URL available');
      toast.error('Meeting URL not available');
      return;
    }

    // Use Jitsi IFrame API for proper embedding (bypasses lobby/moderator screen)
    if (meetingUrl.includes('meet.jit.si')) {
      try {
        await loadJitsiScript();

        // Extract room name from URL (remove config hash params)
        const roomName = meetingUrl.split('meet.jit.si/')[1]?.split('#')[0]?.split('?')[0];
        if (!roomName) {
          toast.error('Invalid meeting URL');
          return;
        }

        videoContainerRef.current.innerHTML = '';

        const api = new (window as any).JitsiMeetExternalAPI('meet.jit.si', {
          roomName: roomName,
          parentNode: videoContainerRef.current,
          width: '100%',
          height: '100%',
          configOverwrite: {
            prejoinPageEnabled: false,
            disableDeepLinking: true,
            enableLobby: false,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            enableWelcomePage: false,
            enableClosePage: false,
            disableModeratedRooms: true,
            // Additional security bypass settings
            requireDisplayName: false,
            enableInsecureRoomNameWarning: false,
            enableNoisyMicDetection: false,
            // Disable lobby completely
            lobby: {
              autoKnock: false,
              enableChat: false,
            },
            // Allow everyone to join without approval
            disableLobbyPassword: true,
            enableLobbyChat: false,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            HIDE_INVITE_MORE_HEADER: true,
            DISABLE_PRESENCE_STATUS: true,
          },
          userInfo: {
            displayName: user?.name || 'Participant'
          }
        });

        api.addEventListener('videoConferenceJoined', () => {
          setCallJoined(true);
          toast.success('Connected to video call!');
        });

        api.addEventListener('readyToClose', () => {
          console.log('📴 Jitsi call ended by user');
          handleEnd();
        });

        jitsiApiRef.current = api;
        console.log('🎥 Jitsi IFrame API initialized for room:', roomName);
        return;
      } catch (err) {
        console.error('Failed to load Jitsi API, falling back to iframe:', err);
      }
    }

    // Fallback: plain iframe (for non-Jitsi URLs or if API fails)
    console.log('🎥 Initializing video via iframe:', meetingUrl);
    const iframe = document.createElement('iframe');
    iframe.src = meetingUrl;
    iframe.allow = 'camera; microphone; fullscreen; display-capture; autoplay';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.style.borderRadius = '20px';
    iframe.onload = () => {
      setCallJoined(true);
      toast.success('Connected to video call!');
    };
    videoContainerRef.current.innerHTML = '';
    videoContainerRef.current.appendChild(iframe);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const handleStart = () => {
    console.log('🎬 handleStart called, user role:', user?.role);
    if (user?.role === 'candidate') {
      console.log('🎬 Showing consent dialog for candidate');
      setShowConsentDialog(true);
    } else {
      console.log('🎬 Starting directly for role:', user?.role);
      // Recruiter/Admin — start directly without consent popup
      startInterviewDirectly();
    }
  };

  const startInterviewDirectly = async () => {
    try {
      await videoInterviewService.startInterview(Number(videoId));
      const data = await videoInterviewService.getInterview(Number(videoId));
      setInterview(data);
      setIsActive(true);
      setElapsed(0);
      toast.success('Interview started! Connecting to video call...');

      // Start audio recording (uses mic only, no camera conflict with Jitsi)
      startRecording();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to start interview');
    }
  };

  const handleConsentAccept = async () => {
    setShowConsentDialog(false);
    try {
      // Save consent to backend
      await videoInterviewService.updateRecordingConsent(Number(videoId), true);

      // If interview is already in_progress (started by recruiter), just join
      if (interview?.status !== 'in_progress') {
        await videoInterviewService.startInterview(Number(videoId));
        // Refresh interview data to get the meeting URL
        const data = await videoInterviewService.getInterview(Number(videoId));
        setInterview(data);
        setElapsed(0);
      }

      setIsActive(true);
      toast.success('Joining interview...');

      // Start audio recording (mic only, no camera conflict with Jitsi)
      startRecording();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to join interview');
    }
  };

  const handleConsentDecline = () => {
    setShowConsentDialog(false);
    toast.error('Recording consent is required to start the interview.');
  };

  const startRecording = async () => {
    try {
      let stream: MediaStream;

      // Try video + audio first (best for anti-cheating evidence)
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log('🎥🎤 Camera + microphone detected, recording video+audio');
      } catch (videoErr: any) {
        // Video failed — try audio only
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          console.log('🎤 Microphone only detected, recording audio');
          toast('No camera — recording audio only.', { icon: '🎤', duration: 4000 });
        } catch (micErr: any) {
          // No mic/camera — create silent audio stream for testing
          console.warn('No mic/camera found, using silent audio stream for recording test');
          const audioCtx = new AudioContext();
          const oscillator = audioCtx.createOscillator();
          oscillator.frequency.value = 0;
          const dest = audioCtx.createMediaStreamDestination();
          oscillator.connect(dest);
          oscillator.start();
          stream = dest.stream;
          toast('No mic/camera — using silent recording for testing.', { icon: '🔇', duration: 4000 });
        }
      }

      recordingStreamRef.current = stream;
      recordedChunksRef.current = [];

      // Pick best format based on stream tracks
      const hasVideo = stream.getVideoTracks().length > 0;
      let mimeType: string;

      if (hasVideo) {
        // Video+audio: prefer VP8/VP9 codecs
        mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : 'video/webm';
      } else {
        // Audio only
        mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'video/webm';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('🎥 Recording stopped, chunks:', recordedChunksRef.current.length);
      };

      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      toast.success(hasVideo ? 'Video + Audio recording started!' : 'Audio recording started!');
      console.log(`🎥 Recording started (${hasVideo ? 'video+audio' : 'audio-only'}) with mimeType:`, mimeType);
    } catch (err: any) {
      console.error('Failed to start recording:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        toast.error('Camera/microphone permission denied. Please allow access and try again.');
      } else {
        toast.error('Recording could not start. Please check browser permissions.');
      }
    }
  };

  const stopAndUploadRecording = async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return;
    }

    return new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current!;

      recorder.onstop = async () => {
        // Stop all tracks
        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach(track => track.stop());
          recordingStreamRef.current = null;
        }

        setIsRecording(false);

        if (recordedChunksRef.current.length === 0) {
          console.warn('No recording data collected');
          resolve();
          return;
        }

        const blob = new Blob(recordedChunksRef.current, { type: recordedChunksRef.current[0]?.type || 'video/webm' });
        console.log(`🎥 Recording blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

        // Upload to backend (silently for candidates)
        const isCandidate = user?.role === 'candidate';
        try {
          if (!isCandidate) {
            setUploadingRecording(true);
            toast('Uploading recording...', { icon: '📤' });
          }
          await videoInterviewService.uploadRecording(Number(videoId), blob);
          if (!isCandidate) {
            toast.success('Recording uploaded successfully!');
          }
        } catch (err) {
          console.error('Failed to upload recording:', err);
          if (!isCandidate) {
            toast.error('Failed to upload recording.');
          }
        } finally {
          setUploadingRecording(false);
          recordedChunksRef.current = [];
        }

        resolve();
      };

      recorder.stop();
    });
  };

  const cleanupVideoCall = () => {
    if (jitsiApiRef.current) {
      try { jitsiApiRef.current.dispose(); } catch (e) { /* ignore */ }
      jitsiApiRef.current = null;
    }
    if (videoContainerRef.current) {
      videoContainerRef.current.innerHTML = '';
    }
    document.querySelectorAll('iframe[allow*="camera"], iframe[src*="jit.si"]').forEach(el => {
      el.remove();
    });
  };

  const handleEnd = async () => {
    // Use ref to prevent double execution (React state isn't immediate)
    if (endingRef.current) return;
    endingRef.current = true;
    try {
      setEnding(true);

      // Stop and upload recording first
      await stopAndUploadRecording();

      // Clean up all video call elements
      cleanupVideoCall();

      // Stop timer
      setIsActive(false);
      setCallJoined(false);

      // Tell backend the interview is completed
      const result = await videoInterviewService.endInterview(Number(videoId));
      setInterview(result);
      toast.success('Interview completed!');

      // Redirect recruiter to detail page to view recording
      if (user?.role !== 'candidate') {
        setTimeout(() => {
          navigate(`/video-detail/${videoId}`);
        }, 1500);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to end interview');
    } finally {
      setEnding(false);
      endingRef.current = false;
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
                {isRecording && (
                  <Chip
                    icon={<FiberManualRecord sx={{ fontSize: 14, color: '#ef4444', animation: 'blink 1s infinite', '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />}
                    label="REC"
                    sx={{
                      background: '#fef2f2',
                      color: '#ef4444',
                      fontWeight: 700,
                      fontSize: '12px',
                      border: '1px solid #fecaca',
                    }}
                  />
                )}
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
                // Jitsi Video Call
                <Box
                  ref={videoContainerRef}
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
                  {user?.role === 'candidate' ? (
                    <>
                      <Typography sx={{ color: '#94a3b8', fontSize: '14px', mb: 1 }}>
                        Thank you for attending the interview!
                      </Typography>
                      <Typography sx={{ color: '#64748b', fontSize: '13px' }}>
                        The recruiter will review your interview and get back to you soon.
                      </Typography>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
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

            {/* Control Bar */}
            {!isCompleted && (
              <Paper sx={{
                background: 'white', borderRadius: { xs: '12px', sm: '16px' }, padding: { xs: '12px 16px', sm: '16px 24px' },
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: { xs: 1, sm: 2 },
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)', flexWrap: 'wrap'
              }}>
                {!isActive ? (
                  <Button
                    variant="contained"
                    startIcon={<Videocam />}
                    onClick={handleStart}
                    sx={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      padding: { xs: '10px 20px', sm: '14px 36px' }, borderRadius: '28px',
                      fontWeight: 600, fontSize: { xs: '13px', sm: '15px' }, textTransform: 'none',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                      '&:hover': { background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' },
                    }}
                  >
                    Start Meeting
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<CallEnd />}
                    onClick={handleEnd}
                    disabled={ending}
                    sx={{
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      padding: { xs: '10px 20px', sm: '14px 36px' }, borderRadius: '28px',
                      fontWeight: 600, fontSize: { xs: '13px', sm: '15px' }, textTransform: 'none',
                      boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                      '&:hover': { background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' },
                      '&:disabled': { background: '#94a3b8' }
                    }}
                  >
                    {ending ? 'Ending...' : 'End Meeting'}
                  </Button>
                )}
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

        {/* Uploading Recording Overlay */}
        {uploadingRecording && (
          <Box sx={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Paper sx={{ p: 4, borderRadius: '16px', textAlign: 'center' }}>
              <CircularProgress sx={{ color: '#f59e0b', mb: 2 }} />
              <Typography sx={{ fontWeight: 600, color: '#1e293b' }}>Uploading Recording...</Typography>
              <Typography sx={{ color: '#64748b', fontSize: '13px', mt: 1 }}>Please wait, do not close this page.</Typography>
            </Paper>
          </Box>
        )}

        {/* Recording Consent Dialog */}
        <Dialog
          open={showConsentDialog}
          onClose={() => setShowConsentDialog(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{
            sx: { borderRadius: '16px', p: 1 }
          }}
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, color: '#1e293b' }}>
            <FiberManualRecord sx={{ color: '#ef4444', fontSize: 20 }} />
            Recording Consent
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ color: '#475569', fontSize: '15px', lineHeight: 1.8, mb: 2 }}>
              This interview session will be <strong>recorded</strong> for review purposes. The recording will include your video and audio.
            </Typography>
            <Box sx={{
              background: '#f8fafc', borderRadius: '12px', p: 2.5,
              border: '1px solid #e2e8f0'
            }}>
              <Typography sx={{ color: '#64748b', fontSize: '13px', lineHeight: 1.8 }}>
                By clicking <strong>"I Agree"</strong>, you consent to being recorded during this interview. The recording will be stored securely and only accessible to authorized recruiters.
              </Typography>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
            <Button
              onClick={handleConsentDecline}
              sx={{
                color: '#64748b', textTransform: 'none', fontWeight: 600,
                borderRadius: '10px', px: 3,
                '&:hover': { background: '#f1f5f9' }
              }}
            >
              Decline
            </Button>
            <Button
              variant="contained"
              onClick={handleConsentAccept}
              sx={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                textTransform: 'none', fontWeight: 600,
                borderRadius: '10px', px: 3,
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                '&:hover': { background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }
              }}
            >
              I Agree — Start Interview
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Navigation>
  );
};

export default VideoInterviewRoom;
