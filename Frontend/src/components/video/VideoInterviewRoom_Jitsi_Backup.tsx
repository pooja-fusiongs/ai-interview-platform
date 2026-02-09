// BACKUP FILE - Jitsi Meet Implementation
// Created: 06 Feb 2026
// If Daily.co doesn't work, rename this file to VideoInterviewRoom.tsx

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
            const ts = data.started_at;
            const utcTimestamp = ts.endsWith('Z') || ts.includes('+') || ts.includes('-', ts.indexOf('T'))
              ? ts
              : ts + 'Z';
            const startTime = new Date(utcTimestamp).getTime();
            const now = Date.now();
            const diff = Math.floor((now - startTime) / 1000);
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

  // Initialize Jitsi when interview becomes active
  useEffect(() => {
    if (isActive && jitsiLoaded && jitsiContainerRef.current && !jitsiApiRef.current) {
      initializeJitsi();
    }
  }, [isActive, jitsiLoaded]);

  // Generate consistent room name - used by both Jitsi and copy link
  const getMeetingRoomName = () => {
    return `InterviewRoom-${videoId}`;
  };

  const initializeJitsi = () => {
    if (!jitsiContainerRef.current || !window.JitsiMeetExternalAPI) {
      console.error('Jitsi container or API not available');
      return;
    }

    const roomName = getMeetingRoomName();
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
        enableInsecureRoomNameWarning: false,
        requireDisplayName: false,
        enableWelcomePage: false,
        enableLobby: false,
        startAudioOnly: false,
        disableModeratorIndicator: true,
        disableDeepLinking: true,
        disableAudioLevels: false,
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'desktop', 'fullscreen',
          'fodeviceselection', 'chat', 'settings',
          'raisehand', 'videoquality', 'tileview'
        ],
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_POWERED_BY: false,
        DEFAULT_BACKGROUND: '#1e293b',
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: false,
        MOBILE_APP_PROMO: false,
        HIDE_INVITE_MORE_HEADER: true,
        DISABLE_PRESENCE_STATUS: false,
        filmStripOnly: false,
        VERTICAL_FILMSTRIP: true,
      }
    };

    try {
      jitsiApiRef.current = new window.JitsiMeetExternalAPI(domain, options);

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
        console.log('📴 Jitsi ready to close - triggering cleanup');
        handleEnd();
      });

      console.log('✅ Jitsi Meet initialized with room:', roomName);
      console.log('📎 Meeting URL:', `https://meet.jit.si/${roomName}`);
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

  const requestMediaPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(track => track.stop());
      console.log('✅ Media permissions granted');
      return true;
    } catch (err) {
      console.error('❌ Media permission denied:', err);
      toast.error('Please allow camera and microphone access for the video call');
      return false;
    }
  };

  const handleStart = async () => {
    try {
      const hasPermission = await requestMediaPermissions();
      if (!hasPermission) {
        return;
      }

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
    const roomName = getMeetingRoomName();
    const meetingUrl = `https://meet.jit.si/${roomName}`;
    try {
      await navigator.clipboard.writeText(meetingUrl);
      toast.success(`Meeting link copied: ${meetingUrl}`);
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
        {/* This is the Jitsi backup - full UI code here */}
        <Typography>Jitsi Backup File - See original VideoInterviewRoom.tsx for full implementation</Typography>
      </Box>
    </Navigation>
  );
};

export default VideoInterviewRoom;
