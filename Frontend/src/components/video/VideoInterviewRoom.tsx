import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, CircularProgress,
  Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions
} from '@mui/material';
import {
  ArrowBack, AccessTime,
  CallEnd,
  Check, SmartToy,
  FiberManualRecord
} from '@mui/icons-material';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { LiveKitRoom, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import { VideoTilesGrid } from './VideoTilesGrid';
import { getMediaDevices, requestMediaPermissions, getDeviceErrorMessage, createAudioOnlyConstraints } from '../../utils/mediaDeviceUtils';

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
  const [, setParticipantCount] = useState(0);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);
  // const jitsiApiRef = useRef<any>(null); // Removed Jitsi ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const maxParticipantsRef = useRef(0);

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const data = await videoInterviewService.getInterview(Number(videoId));
        setInterview(data);
        
        // Fetch questions for this interview
        fetchQuestions();
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

  const fetchQuestions = async () => {
    try {
      setLoadingQuestions(true);
      const response = await videoInterviewService.getAIInterviewQuestions(Number(videoId));
      setQuestions(response.questions || []);
    } catch (err: any) {
      console.warn('Failed to fetch questions:', err);
      // Don't show error toast, questions might not be generated yet
    } finally {
      setLoadingQuestions(false);
    }
  };

  // Pre-request camera/mic permissions on mount to trigger browser prompt
  useEffect(() => {
    const requestPermissions = async () => {
      try {
        console.log('🎥 Pre-requesting camera/mic permissions...');
        
        const deviceInfo = await getMediaDevices();
        
        console.log('📱 Available devices:', {
          videoInputs: deviceInfo.videoDevices.length,
          audioInputs: deviceInfo.audioDevices.length
        });
        
        if (!deviceInfo.hasVideo && !deviceInfo.hasAudio) {
          toast.error('No camera or microphone found. Please connect devices and refresh.');
          return;
        }
        
        const stream = await requestMediaPermissions();
        console.log('✅ Permissions granted');
        // Immediately stop all tracks to release the devices
        stream.getTracks().forEach(track => {
          track.stop();
          console.log(`🛑 Stopped ${track.kind} track`);
        });
      } catch (err: any) {
        console.warn('⚠️ Permissions not granted on mount:', err);
        const errorMsg = getDeviceErrorMessage(err);
        toast.error(errorMsg);
      }
    };
    requestPermissions();
  }, []);

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

  // Fetch LiveKit token and dispatch agent when interview is active
  useEffect(() => {
    const fetchToken = async () => {
      if (isActive && interview && !lkToken) {
        try {
          const roomName = `interview_${videoId}`;
          const data = await videoInterviewService.joinInterview(Number(videoId));
          setLkToken(data.token);
          console.log('🎥 LiveKit token fetched and Agent dispatched for room:', roomName);
        } catch (err: any) {
          toast.error('Failed to get video token. Please refresh.');
          console.error('LiveKit token error:', err);
        }
      }
    };
    fetchToken();
  }, [isActive, interview, videoId, user, lkToken]);

  // Removed Jitsi initialization functions as we're moving to declarative LiveKit components

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
      console.log('🎬 Recruiter joining as observer (no interview start)');
      // Recruiter/Admin — join as observer WITHOUT starting the interview
      joinAsObserver();
    }
  };

  const joinAsObserver = async () => {
    try {
      // Recruiter joins as observer - does NOT start the interview
      // Just fetch token and join the room
      setIsActive(true);
      toast.success('Joining as observer...');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to join as observer');
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

      // Note: We'll start recording AFTER the video room connects to avoid device conflicts
      // but we set a flag or call it with a slight delay
      setTimeout(() => {
        startRecording();
      }, 2000);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to join interview');
    }
  };

  const handleConsentDecline = () => {
    setShowConsentDialog(false);
    toast.error('Recording consent is required to start the interview.');
  };

  const startRecording = async () => {
    // If already recording, don't start again
    if (isRecording || mediaRecorderRef.current) return;

    try {
      console.log('🎤 Starting AUDIO-ONLY backup recording...');

      // Request AUDIO ONLY to avoid device conflict with LiveKit camera
      const stream = await navigator.mediaDevices.getUserMedia(createAudioOnlyConstraints());

      recordingStreamRef.current = stream;
      recordedChunksRef.current = [];

      // Prefer audio/webm;codecs=opus, fallback to audio/webm
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4'; // Last resort fallback
        }
      }

      console.log(`🎤 Using MIME type: ${mimeType}`);

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error('❌ MediaRecorder error:', event.error);
      };

      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      console.log('✅ Audio-only backup recording started successfully');
    } catch (err: any) {
      console.error('❌ Failed to start audio recording:', err);
      const errorMsg = getDeviceErrorMessage(err);
      toast.error(errorMsg + ' Interview will continue without backup recording.');
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

        const blob = new Blob(recordedChunksRef.current, {
          type: recordedChunksRef.current[0]?.type || 'audio/webm'
        });
        console.log(`🎤 Recording blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB, type: ${blob.type}`);

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
    setLkToken(null);
    if (videoContainerRef.current) {
      videoContainerRef.current.innerHTML = '';
    }
  };

  const handleEnd = async () => {
    // Use ref to prevent double execution (React state isn't immediate)
    if (endingRef.current) return;
    endingRef.current = true;
    try {
      setEnding(true);

      // Only upload recording if candidate actually joined (2+ participants)
      if (maxParticipantsRef.current >= 2) {
        await stopAndUploadRecording();
      } else {
        // No-show: stop recording without uploading
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach(track => track.stop());
          recordingStreamRef.current = null;
        }
        setIsRecording(false);
        recordedChunksRef.current = [];
      }

      // Clean up all video call elements
      cleanupVideoCall();

      // Stop timer
      setIsActive(false);
      setCallJoined(false);

      // Tell backend the interview is completed (send max participant count)
      const result = await videoInterviewService.endInterview(Number(videoId), {
        max_participants: maxParticipantsRef.current
      });
      setInterview(result);

      if (result.status === 'no_show') {
        toast.error('Interview marked as No Show — candidate did not join');
      } else {
        toast.success('Interview completed!');
      }

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
      <Box sx={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', background: '#0f172a'
      }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress sx={{ color: '#60a5fa', mb: 2 }} />
          <Typography sx={{ color: '#94a3b8' }}>Loading interview room...</Typography>
        </Box>
      </Box>
    );
  }

  const isCompleted = interview?.status === 'completed';

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: '#0f172a' }}>
      {/* LEFT SIDE - Questions Panel */}
      <Box sx={{ 
        width: { xs: '100%', md: '40%' }, 
        backgroundColor: '#1e293b', 
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <Box sx={{ 
          padding: '24px', 
          borderBottom: '1px solid #334155',
          backgroundColor: '#1e293b'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <IconButton
              onClick={() => navigate('/video-interviews')}
              sx={{
                color: '#94a3b8',
                background: 'rgba(51, 65, 85, 0.5)',
                '&:hover': { background: 'rgba(71, 85, 105, 0.5)' }
              }}
            >
              <ArrowBack />
            </IconButton>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: '24px', fontWeight: 'bold', color: 'white', mb: 0.5 }}>
                Interview Questions
              </Typography>
              <Typography sx={{ color: '#94a3b8', fontSize: '14px' }}>
                {interview?.job_title || 'Loading...'}
              </Typography>
            </Box>
          </Box>
          
          {/* Status Badges */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {isActive && (
              <Chip
                icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'blink 1s infinite', '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />}
                label={callJoined ? "LIVE" : "CONNECTING"}
                size="small"
                sx={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  fontWeight: 600,
                  fontSize: '12px',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              />
            )}
            {isRecording && (
              <Chip
                icon={<FiberManualRecord sx={{ fontSize: 12 }} />}
                label="REC"
                size="small"
                sx={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  fontWeight: 600,
                  fontSize: '12px',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              />
            )}
            <Box sx={{
              background: 'rgba(59, 130, 246, 0.2)',
              color: '#60a5fa',
              borderRadius: '8px',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              <AccessTime sx={{ fontSize: 16 }} />
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '14px' }}>
                {formatTime(elapsed)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Scrollable Questions List */}
        <Box sx={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loadingQuestions ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress size={32} sx={{ color: '#60a5fa', mb: 2 }} />
              <Typography sx={{ color: '#94a3b8', fontSize: '14px' }}>
                Loading questions...
              </Typography>
            </Box>
          ) : questions.length > 0 ? (
            questions.map((q: any, idx: number) => (
              <Box
                key={q.id || idx}
                sx={{
                  backgroundColor: 'rgba(51, 65, 85, 0.5)',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid rgba(71, 85, 105, 0.5)',
                  marginBottom: '16px',
                  transition: 'all 0.2s',
                  '&:hover': {
                    backgroundColor: 'rgba(51, 65, 85, 0.7)',
                    borderColor: 'rgba(71, 85, 105, 0.7)'
                  }
                }}
              >
                {/* Question Number & Difficulty Badge */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    color: '#60a5fa',
                    fontWeight: 600,
                    fontSize: '14px',
                    border: '1px solid rgba(59, 130, 246, 0.3)'
                  }}>
                    {idx + 1}
                  </Box>
                  {q.difficulty && (
                    <Chip
                      label={q.difficulty.toUpperCase()}
                      size="small"
                      sx={{
                        fontSize: '12px',
                        fontWeight: 500,
                        ...(q.difficulty.toLowerCase() === 'easy' ? {
                          backgroundColor: 'rgba(34, 197, 94, 0.2)',
                          color: '#4ade80',
                          border: '1px solid rgba(34, 197, 94, 0.3)'
                        } : q.difficulty.toLowerCase() === 'medium' || q.difficulty.toLowerCase() === 'intermediate' ? {
                          backgroundColor: 'rgba(234, 179, 8, 0.2)',
                          color: '#facc15',
                          border: '1px solid rgba(234, 179, 8, 0.3)'
                        } : {
                          backgroundColor: 'rgba(239, 68, 68, 0.2)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.3)'
                        })
                      }}
                    />
                  )}
                </Box>
                {/* Question Text */}
                <Typography sx={{ color: '#e2e8f0', fontSize: '16px', lineHeight: 1.6, mb: q.skill_focus ? 1 : 0 }}>
                  {q.question_text}
                </Typography>
                {q.skill_focus && (
                  <Typography sx={{ color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>
                    Focus: {q.skill_focus}
                  </Typography>
                )}
              </Box>
            ))
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <SmartToy sx={{ fontSize: 48, color: '#475569', mb: 2 }} />
              <Typography sx={{ color: '#94a3b8', fontSize: '14px' }}>
                Questions will be loaded when interview starts
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* RIGHT SIDE - Video Panel */}
      <Box sx={{ 
        width: { xs: '100%', md: '60%' }, 
        backgroundColor: '#0f172a',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Video Container */}
        <Box sx={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
          <Paper sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#1e293b',
            borderRadius: 0,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
              {isActive ? (
                // LiveKit Video Call with Tiles
                <Box
                  sx={{
                    width: '100%',
                    height: '100%',
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: '20px',
                    background: '#1e293b',
                  }}
                >
                  {lkToken ? (
                    <LiveKitRoom
                      video={user?.role === 'candidate'} // Only candidate has video
                      audio={user?.role === 'candidate'} // Only candidate has audio (recruiter is observer)
                      token={lkToken}
                      serverUrl={import.meta.env.VITE_LIVEKIT_URL || "wss://ai-interview-platform-a0kpbtob.livekit.cloud"}
                      connect={true}
                      onConnected={() => {
                        setCallJoined(true);
                        setParticipantCount(1);
                        maxParticipantsRef.current = Math.max(maxParticipantsRef.current, 1);
                        const role = user?.role === 'candidate' ? 'Connected to interview!' : 'Joined as observer';
                        toast.success(role);
                      }}
                      style={{ height: '100%', width: '100%', background: '#0a0a0b' }}
                    >
                      <VideoTilesGrid onEndCall={handleEnd} />
                      <RoomAudioRenderer />
                    </LiveKitRoom>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <CircularProgress sx={{ color: '#020291' }} />
                      <Typography sx={{ color: 'white' }}>Establishing secure connection...</Typography>
                    </Box>
                  )}
                </Box>
              ) : isCompleted ? (
                <Box sx={{ textAlign: 'center', width: '100%', maxWidth: 500, mx: 'auto', p: 3 }}>
                  <Box sx={{
                    width: 80, height: 80, borderRadius: '50%',
                    background: '#020291',
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
                    <Typography sx={{ color: '#94a3b8', fontSize: '14px' }}>
                      Interview completed. You can close this window.
                    </Typography>
                  )}
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', p: { xs: 2, sm: 4 } }}>
                  <Box sx={{
                    width: 120, height: 120, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 24px',
                    boxShadow: '0 0 40px rgba(139, 92, 246, 0.4)'
                  }}>
                    <SmartToy sx={{ color: 'white', fontSize: 60 }} />
                  </Box>
                  <Typography sx={{ color: 'white', fontSize: { xs: '20px', sm: '28px' }, fontWeight: 700, mb: 1 }}>
                    AI Interview Ready
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: { xs: '13px', sm: '15px' }, mb: 4 }}>
                    {user?.role === 'candidate' 
                      ? 'AI will conduct the interview and automatically score responses'
                      : 'Join as observer to watch the AI interview (mic and camera will be disabled)'}
                  </Typography>
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<SmartToy />}
                    onClick={handleStart}
                    sx={{
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                      padding: '16px 48px',
                      borderRadius: '12px',
                      fontWeight: 700,
                      fontSize: '16px',
                      textTransform: 'none',
                      boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                        boxShadow: '0 12px 32px rgba(139, 92, 246, 0.5)',
                      }
                    }}
                  >
                    {user?.role === 'candidate' ? 'Start AI Interview' : 'Join as Observer'}
                  </Button>
                </Box>
              )}
          </Paper>
        </Box>

        {/* End Meeting Button - Floating Bottom Right */}
        {isActive && (
          <Box sx={{ position: 'absolute', bottom: 32, right: 32, zIndex: 10 }}>
              <Button
                onClick={handleEnd}
                disabled={ending}
                startIcon={ending ? <CircularProgress size={20} sx={{ color: 'white' }} /> : <CallEnd />}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  padding: '16px 24px',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  fontWeight: 600,
                  borderRadius: '9999px',
                  textTransform: 'none',
                  fontSize: '15px',
                  boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.5), 0 10px 10px -5px rgba(239, 68, 68, 0.4)',
                  transition: 'all 0.2s',
                  '&:hover': {
                    backgroundColor: '#dc2626',
                    transform: 'scale(1.05)',
                    boxShadow: '0 25px 30px -5px rgba(239, 68, 68, 0.6)'
                  },
                  '&:disabled': {
                    backgroundColor: '#991b1b',
                    color: '#fca5a5'
                  }
                }}
              >
                {ending ? 'Ending...' : 'End Meeting'}
              </Button>
            </Box>
          )}
        </Box>

        {/* Uploading Recording Overlay */}
      {/* Uploading Recording Overlay */}
      {uploadingRecording && (
        <Box sx={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Paper sx={{ p: 4, borderRadius: '16px', textAlign: 'center' }}>
            <CircularProgress sx={{ color: '#020291', mb: 2 }} />
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
              background: '#020291',
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
  );
};

export default VideoInterviewRoom;
