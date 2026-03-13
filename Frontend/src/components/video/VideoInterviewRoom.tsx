import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, CircularProgress,
  Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions
} from '@mui/material';
import {
  ArrowBack, AccessTime,
  Check, Videocam,
  FiberManualRecord
} from '@mui/icons-material';
import videoInterviewService from '../../services/videoInterviewService';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { LiveKitRoom, RoomAudioRenderer, useRemoteParticipants, useTracks } from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { VideoTilesGrid } from './VideoTilesGrid';
import { getMediaDevices, requestMediaPermissions, getDeviceErrorMessage } from '../../utils/mediaDeviceUtils';
import Navigation from '../layout/Sidebar';

/**
 * Suppresses "ignoring incoming text stream" console warnings from LiveKit agent events.
 * Registers no-op handlers for known agent text stream topics.
 */
/**
 * InterviewRecorder - Records video + ALL audio automatically.
 * Uses useTracks hook for reliable track detection (no polling misses).
 * Uses AudioContext to mix local mic + remote participant audio.
 * NO extra browser prompts — uses LiveKit tracks directly.
 * Must be placed INSIDE <LiveKitRoom>.
 */
const InterviewRecorder: React.FC<{
  shouldRecord: boolean;
  mediaRecorderRef: React.MutableRefObject<MediaRecorder | null>;
  recordedChunksRef: React.MutableRefObject<Blob[]>;
  onRecordingChange: (recording: boolean) => void;
}> = ({ shouldRecord, mediaRecorderRef, recordedChunksRef, onRecordingChange }) => {
  const remoteParticipants = useRemoteParticipants();
  const allTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.Microphone, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const audioCtxRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const connectedRemotesRef = useRef<Set<string>>(new Set());
  const startedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const camVideoElRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteCamVideoElRef = useRef<HTMLVideoElement | null>(null);
  const remoteScreenVideoElRef = useRef<HTMLVideoElement | null>(null);

  // Find local tracks via useTracks (reactive)
  const localCamTrackRef = allTracks.find(
    t => t.participant.isLocal && t.source === Track.Source.Camera && t.publication?.track
  );
  const localMicTrackRef = allTracks.find(
    t => t.participant.isLocal && t.source === Track.Source.Microphone && t.publication?.track
  );
  const localScreenTrackRef = allTracks.find(
    t => t.participant.isLocal && t.source === Track.Source.ScreenShare && t.publication?.track
  );
  // Find remote tracks (for recording the other participant)
  const remoteCamTrackRef = allTracks.find(
    t => !t.participant.isLocal && t.source === Track.Source.Camera && t.publication?.track
  );
  const remoteScreenTrackRef = allTracks.find(
    t => !t.participant.isLocal && t.source === Track.Source.ScreenShare && t.publication?.track
  );

  const camMediaTrack = localCamTrackRef?.publication?.track?.mediaStreamTrack;
  const micMediaTrack = localMicTrackRef?.publication?.track?.mediaStreamTrack;
  const screenMediaTrack = localScreenTrackRef?.publication?.track?.mediaStreamTrack;
  const remoteCamMediaTrack = remoteCamTrackRef?.publication?.track?.mediaStreamTrack;
  const remoteScreenMediaTrack = remoteScreenTrackRef?.publication?.track?.mediaStreamTrack;

  // Attach/detach camera video element when track changes
  useEffect(() => {
    if (camMediaTrack) {
      if (!camVideoElRef.current) {
        camVideoElRef.current = document.createElement('video');
        camVideoElRef.current.muted = true;
        camVideoElRef.current.playsInline = true;
      }
      camVideoElRef.current.srcObject = new MediaStream([camMediaTrack]);
      camVideoElRef.current.play().catch(() => {});
    } else if (camVideoElRef.current) {
      camVideoElRef.current.srcObject = null;
    }
  }, [camMediaTrack]);

  // Attach/detach screen share video element when track changes
  useEffect(() => {
    if (screenMediaTrack) {
      if (!screenVideoElRef.current) {
        screenVideoElRef.current = document.createElement('video');
        screenVideoElRef.current.muted = true;
        screenVideoElRef.current.playsInline = true;
      }
      screenVideoElRef.current.srcObject = new MediaStream([screenMediaTrack]);
      screenVideoElRef.current.play().catch(() => {});
    } else if (screenVideoElRef.current) {
      screenVideoElRef.current.srcObject = null;
    }
  }, [screenMediaTrack]);

  // Attach/detach remote camera video element
  useEffect(() => {
    if (remoteCamMediaTrack) {
      if (!remoteCamVideoElRef.current) {
        remoteCamVideoElRef.current = document.createElement('video');
        remoteCamVideoElRef.current.muted = true;
        remoteCamVideoElRef.current.playsInline = true;
      }
      remoteCamVideoElRef.current.srcObject = new MediaStream([remoteCamMediaTrack]);
      remoteCamVideoElRef.current.play().catch(() => {});
    } else if (remoteCamVideoElRef.current) {
      remoteCamVideoElRef.current.srcObject = null;
    }
  }, [remoteCamMediaTrack]);

  // Attach/detach remote screen share video element
  useEffect(() => {
    if (remoteScreenMediaTrack) {
      if (!remoteScreenVideoElRef.current) {
        remoteScreenVideoElRef.current = document.createElement('video');
        remoteScreenVideoElRef.current.muted = true;
        remoteScreenVideoElRef.current.playsInline = true;
      }
      remoteScreenVideoElRef.current.srcObject = new MediaStream([remoteScreenMediaTrack]);
      remoteScreenVideoElRef.current.play().catch(() => {});
    } else if (remoteScreenVideoElRef.current) {
      remoteScreenVideoElRef.current.srcObject = null;
    }
  }, [remoteScreenMediaTrack]);

  // Start recording when mic track becomes available
  useEffect(() => {
    if (!shouldRecord || startedRef.current || mediaRecorderRef.current) return;
    if (!micMediaTrack) return;

    const timer = setTimeout(() => {
      if (startedRef.current || mediaRecorderRef.current) return;
      startedRef.current = true;

      try {
        console.log(`🎬 Starting recording: screen=${!!screenMediaTrack}, camera=${!!camMediaTrack}, mic=${!!micMediaTrack}`);

        // --- Audio setup ---
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const destination = audioCtx.createMediaStreamDestination();
        destinationRef.current = destination;

        const localSource = audioCtx.createMediaStreamSource(new MediaStream([micMediaTrack]));
        localSource.connect(destination);
        console.log('🎤 Local mic connected to audio mixer');

        for (const remote of remoteParticipants) {
          const remoteMicPub = remote.getTrackPublication(Track.Source.Microphone);
          const remoteTrack = remoteMicPub?.track?.mediaStreamTrack;
          if (remoteTrack) {
            const src = audioCtx.createMediaStreamSource(new MediaStream([remoteTrack]));
            src.connect(destination);
            connectedRemotesRef.current.add(remote.identity);
            console.log(`🎙️ Remote participant audio connected: ${remote.identity}`);
          }
        }

        // --- Canvas compositing setup ---
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        canvasRef.current = canvas;
        const ctx = canvas.getContext('2d')!;

        // Draw loop: composites all video tracks onto canvas
        const drawFrame = () => {
          const localScreenVid = screenVideoElRef.current;
          const localCamVid = camVideoElRef.current;
          const remoteScreenVid = remoteScreenVideoElRef.current;
          const remoteCamVid = remoteCamVideoElRef.current;

          const hasLocalScreen = localScreenVid?.srcObject && localScreenVid.readyState >= 2;
          const hasLocalCam = localCamVid?.srcObject && localCamVid.readyState >= 2;
          const hasRemoteScreen = remoteScreenVid?.srcObject && remoteScreenVid.readyState >= 2;
          const hasRemoteCam = remoteCamVid?.srcObject && remoteCamVid.readyState >= 2;

          // Dark background
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Priority: screen share (either side) takes full canvas, cameras as PiP
          const anyScreen = hasRemoteScreen || hasLocalScreen;
          const screenVid = hasRemoteScreen ? remoteScreenVid : hasLocalScreen ? localScreenVid : null;

          if (anyScreen && screenVid) {
            // Screen share full canvas
            ctx.drawImage(screenVid, 0, 0, canvas.width, canvas.height);
            // Show both cameras as PiP
            const pipW = 160, pipH = 120, pipMargin = 12;
            let pipIdx = 0;
            for (const vid of [remoteCamVid, localCamVid]) {
              const hasCam = vid?.srcObject && vid.readyState >= 2;
              if (hasCam) {
                const pipX = canvas.width - pipW - pipMargin;
                const pipY = canvas.height - pipH - pipMargin - pipIdx * (pipH + pipMargin);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(pipX - 2, pipY - 2, pipW + 4, pipH + 4);
                ctx.drawImage(vid!, pipX, pipY, pipW, pipH);
                pipIdx++;
              }
            }
          } else if (hasRemoteCam && hasLocalCam) {
            // Side-by-side: remote left, local right
            const halfW = canvas.width / 2;
            ctx.drawImage(remoteCamVid!, 0, 0, halfW, canvas.height);
            ctx.drawImage(localCamVid!, halfW, 0, halfW, canvas.height);
            // Divider line
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(halfW, 0);
            ctx.lineTo(halfW, canvas.height);
            ctx.stroke();
          } else if (hasRemoteCam) {
            // Only remote camera
            const vw = remoteCamVid!.videoWidth || 640;
            const vh = remoteCamVid!.videoHeight || 480;
            const scale = Math.min(canvas.width / vw, canvas.height / vh);
            const dw = vw * scale, dh = vh * scale;
            ctx.drawImage(remoteCamVid!, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
          } else if (hasLocalCam) {
            // Only local camera
            const vw = localCamVid!.videoWidth || 640;
            const vh = localCamVid!.videoHeight || 480;
            const scale = Math.min(canvas.width / vw, canvas.height / vh);
            const dw = vw * scale, dh = vh * scale;
            ctx.drawImage(localCamVid!, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
          }

          animFrameRef.current = requestAnimationFrame(drawFrame);
        };
        drawFrame();

        // --- MediaRecorder setup ---
        const canvasStream = canvas.captureStream(30); // 30fps
        const combinedStream = new MediaStream();
        canvasStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));
        destination.stream.getAudioTracks().forEach(t => combinedStream.addTrack(t));

        recordedChunksRef.current = [];

        let mimeType = 'video/webm;codecs=vp8,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4';
        }

        console.log(`🎬 Recording: ${combinedStream.getVideoTracks().length} video + ${combinedStream.getAudioTracks().length} audio, MIME: ${mimeType}`);

        const mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) recordedChunksRef.current.push(event.data);
        };
        mediaRecorder.onerror = (event: any) => {
          console.error('❌ MediaRecorder error:', event.error);
        };

        mediaRecorder.start(1000);
        mediaRecorderRef.current = mediaRecorder;
        onRecordingChange(true);
        console.log('✅ Recording started (canvas compositing mode)');
      } catch (err) {
        console.error('❌ Failed to start recording:', err);
        startedRef.current = false;
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [shouldRecord, micMediaTrack]);

  // Dynamically connect AI agent audio when it joins AFTER recording starts
  useEffect(() => {
    if (!audioCtxRef.current || !destinationRef.current || !mediaRecorderRef.current) return;
    const audioCtx = audioCtxRef.current;
    const destination = destinationRef.current;

    for (const remote of remoteParticipants) {
      if (connectedRemotesRef.current.has(remote.identity)) continue;

      const remoteMicPub = remote.getTrackPublication(Track.Source.Microphone);
      const remoteTrack = remoteMicPub?.track?.mediaStreamTrack;
      if (remoteTrack) {
        try {
          const src = audioCtx.createMediaStreamSource(new MediaStream([remoteTrack]));
          src.connect(destination);
          connectedRemotesRef.current.add(remote.identity);
          console.log(`🎙️ Remote participant audio connected (late join): ${remote.identity}`);
        } catch (err) {
          console.error('Failed to connect remote audio:', err);
        }
      }
    }
  }, [remoteParticipants]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
      }
    };
  }, []);

  return null;
};

const VideoInterviewRoom: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Guest mode: no logged-in user — candidate joining from email link
  const isGuest = !user;
  const [interview, setInterview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [callJoined, setCallJoined] = useState(false);
  const [, setEnding] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadingRecording, setUploadingRecording] = useState(false);
  const [, setParticipantCount] = useState(0);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [gracePeriodTimer, setGracePeriodTimer] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);
  // const jitsiApiRef = useRef<any>(null); // Removed Jitsi ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const maxParticipantsRef = useRef(0);

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const data = isGuest
          ? await videoInterviewService.guestGetInterview(Number(videoId))
          : await videoInterviewService.getInterview(Number(videoId));
        setInterview(data);

        // Fetch questions for this interview
        fetchQuestions();
        if (data.status === 'in_progress') {
          setIsActive(true);
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
        } else if (data.status === 'waiting') {
          // Interview is waiting for candidate - start grace period check
          startGracePeriodCheck();
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
      if (graceCheckIntervalRef.current) clearInterval(graceCheckIntervalRef.current);
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

  const startGracePeriodCheck = () => {
    // Check grace period every 30 seconds
    if (graceCheckIntervalRef.current) return; // Already checking

    const checkGrace = async () => {
      try {
        const response = await videoInterviewService.checkGracePeriod(Number(videoId), 10); // 10 minutes grace

        if (response.grace_period_expired) {
          // Grace period expired, candidate didn't join
          toast.error('Candidate did not join within grace period');
          if (graceCheckIntervalRef.current) {
            clearInterval(graceCheckIntervalRef.current);
            graceCheckIntervalRef.current = null;
          }
          // Refresh interview data
          const data = await videoInterviewService.getInterview(Number(videoId));
          setInterview(data);
        } else if (response.remaining_seconds) {
          setGracePeriodTimer(response.remaining_seconds);
        }
      } catch (err) {
        console.error('Grace period check failed:', err);
      }
    };

    // Check immediately
    checkGrace();

    // Then check every 30 seconds
    graceCheckIntervalRef.current = setInterval(checkGrace, 30000);
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

  // Fetch LiveKit token when interview is active
  useEffect(() => {
    const fetchToken = async () => {
      if (isActive && interview && !lkToken) {
        try {
          const roomName = `interview_${videoId}`;
          const data = isGuest
            ? await videoInterviewService.guestJoinInterview(Number(videoId))
            : await videoInterviewService.joinInterview(Number(videoId));
          setLkToken(data.token);
          console.log('🎥 LiveKit token fetched for room:', roomName);
        } catch (err: any) {
          toast.error('Failed to get video token. Please refresh.');
          console.error('LiveKit token error:', err);
        }
      }
    };
    fetchToken();
  }, [isActive, interview, videoId, user, lkToken, isGuest]);

  // Removed Jitsi initialization functions as we're moving to declarative LiveKit components

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const isUserCandidate = isGuest || user?.role === 'candidate';

  const handleStart = () => {
    console.log('🎬 handleStart called, user role:', user?.role);
    if (isUserCandidate) {
      // Candidate: show consent dialog then join
      setShowConsentDialog(true);
    } else {
      // Recruiter/Admin: join interview directly as interviewer
      console.log('🎬 Recruiter joining as interviewer');
      joinAsInterviewer();
    }
  };

  const joinAsInterviewer = async () => {
    try {
      // Recruiter joins as interviewer with full audio/video
      setIsActive(true);
      toast.success('Joining interview...');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to join interview');
    }
  };


  const handleConsentAccept = async () => {
    setShowConsentDialog(false);
    try {
      // Save consent to backend
      if (isGuest) {
        await videoInterviewService.guestUpdateRecordingConsent(Number(videoId), true);
      } else {
        await videoInterviewService.updateRecordingConsent(Number(videoId), true);
      }

      // If interview is already in_progress (started by recruiter), just join
      if (interview?.status !== 'in_progress') {
        if (isGuest) {
          await videoInterviewService.guestJoinInterview(Number(videoId));
          const data = await videoInterviewService.guestGetInterview(Number(videoId));
          setInterview(data);
        } else {
          await videoInterviewService.joinInterview(Number(videoId));
          const data = await videoInterviewService.getInterview(Number(videoId));
          setInterview(data);
        }
        setElapsed(0);
      }

      setIsActive(true);
      toast.success('Joining interview...');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to join interview');
    }
  };

  const handleConsentDecline = () => {
    setShowConsentDialog(false);
    toast.error('Recording consent is required to start the interview.');
  };

  // Recording callback for InterviewRecorder component
  const handleRecordingChange = React.useCallback((recording: boolean) => {
    setIsRecording(recording);
  }, []);

  const stopAndUploadRecording = async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return;
    }

    return new Promise<void>((resolve) => {
      const recorder = mediaRecorderRef.current!;

      recorder.onstop = async () => {
        // Don't stop LiveKit tracks — LiveKit manages them
        // Just stop the MediaRecorder

        setIsRecording(false);

        if (recordedChunksRef.current.length === 0) {
          console.warn('No recording data collected');
          resolve();
          return;
        }

        const blob = new Blob(recordedChunksRef.current, {
          type: recordedChunksRef.current[0]?.type || 'video/webm'
        });
        console.log(`🎬 Recording blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB, type: ${blob.type}`);

        try {
          setUploadingRecording(true);
          toast('Uploading recording...', { icon: '📤' });
          await (isGuest ? videoInterviewService.guestUploadRecording : videoInterviewService.uploadRecording)(Number(videoId), blob);
          toast.success('Recording uploaded successfully!');
        } catch (err) {
          console.error('Failed to upload recording:', err);
          toast.error('Failed to upload recording.');
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

      // Upload recording if MediaRecorder exists
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state !== 'inactive') {
          // Recorder is still active — stop and upload
          console.log(`🎬 Stopping recorder (state: ${mediaRecorderRef.current.state}, isRecording: ${isRecording})`);
          await stopAndUploadRecording();
        } else if (recordedChunksRef.current.length > 0) {
          // Recorder already inactive but has chunks (e.g., silently errored) — upload what we have
          console.log(`🎬 Recorder inactive but has ${recordedChunksRef.current.length} chunks — uploading`);
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          console.log(`🎬 Recording blob size: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
          try {
            await (isGuest ? videoInterviewService.guestUploadRecording : videoInterviewService.uploadRecording)(Number(videoId), blob);
            toast.success('Recording uploaded successfully!');
          } catch (err) {
            console.error('Failed to upload recording:', err);
            toast.error('Failed to upload recording.');
          }
          recordedChunksRef.current = [];
          setIsRecording(false);
        }
      }

      // Clean up all video call elements
      cleanupVideoCall();

      // Stop timer
      setIsActive(false);
      setCallJoined(false);

      // Tell backend the interview is completed (send max participant count)
      let result;
      if (isGuest) {
        result = await videoInterviewService.guestEndInterview(Number(videoId));
      } else {
        result = await videoInterviewService.endInterview(Number(videoId), {
          max_participants: maxParticipantsRef.current
        });
      }
      setInterview(result);

      if (result.status === 'no_show') {
        toast.error('Interview marked as No Show — candidate did not join');
      } else {
        toast.success('Interview completed!');
      }

      if (!isGuest) {
        setTimeout(() => {
          navigate(`/video-detail/${videoId}`);
        }, 1500);
      }
      // Guest stays on the page — will see "Interview Completed" state
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to end interview');
    } finally {
      setEnding(false);
      endingRef.current = false;
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

  const content = (
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        height: isGuest ? '100vh' : 'calc(100vh - 64px)',
        width: '100%',
        overflow: 'hidden',
        backgroundColor: '#f8fafc'
      }}>
        {/* Top Header Bar */}
        <Box sx={{
          padding: { xs: '10px 12px', md: '16px 24px' },
          borderBottom: '1px solid #e2e8f0',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
          flexWrap: 'wrap',
          gap: 1
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 }, minWidth: 0, flex: 1 }}>
            {!isGuest && (
              <IconButton
                onClick={() => navigate('/video-interviews')}
                sx={{
                  color: '#64748b',
                  '&:hover': {
                    background: '#f1f5f9',
                    color: '#020291'
                  }
                }}
              >
                <ArrowBack />
              </IconButton>
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{
                fontSize: { xs: '14px', md: '18px' },
                fontWeight: 700,
                color: '#1e293b',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {interview?.job_title || 'Software QA Engineer'}
              </Typography>
              <Typography sx={{
                color: '#64748b',
                fontSize: { xs: '11px', md: '13px' },
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {interview?.candidate_name || 'pooja Mishra'} • Interview #{videoId}
              </Typography>
            </Box>
          </Box>

          {/* Timer and Status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {interview?.status === 'waiting' && gracePeriodTimer && (
              <Chip
                icon={<AccessTime sx={{ fontSize: 14 }} />}
                label={`Waiting (${Math.floor(gracePeriodTimer / 60)}:${(gracePeriodTimer % 60).toString().padStart(2, '0')})`}
                size="small"
                sx={{
                  background: '#fef3c7',
                  color: '#92400e',
                  fontWeight: 600,
                  fontSize: '12px',
                  border: '1px solid #fde68a'
                }}
              />
            )}
            {isActive && (
              <Chip
                icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'blink 1s infinite', '@keyframes blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />}
                label={callJoined ? "LIVE" : "CONNECTING"}
                size="small"
                sx={{
                  background: '#fee2e2',
                  color: '#991b1b',
                  fontWeight: 600,
                  fontSize: '12px',
                  border: '1px solid #fecaca'
                }}
              />
            )}
            {isRecording && (
              <Chip
                icon={<FiberManualRecord sx={{ fontSize: 12 }} />}
                label="REC"
                size="small"
                sx={{
                  background: '#fee2e2',
                  color: '#991b1b',
                  fontWeight: 600,
                  fontSize: '12px',
                  border: '1px solid #fecaca'
                }}
              />
            )}
            <Box sx={{
              background: '#dbeafe',
              color: '#1e40af',
              borderRadius: '8px',
              border: '1px solid #bfdbfe',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              <AccessTime sx={{ fontSize: 18 }} />
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '15px' }}>
                {formatTime(elapsed)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Main Content Area - Split Left/Right */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* LEFT SIDE - Questions Panel (recruiter only) */}
          {!isUserCandidate && <Box sx={{
            width: { xs: '100%', md: '40%' },
            maxHeight: { xs: isActive ? '30vh' : '40vh', md: 'none' },
            backgroundColor: 'white',
            borderRight: { md: '1px solid #e2e8f0' },
            borderBottom: { xs: '1px solid #e2e8f0', md: 'none' },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>

            {/* Scrollable Questions List */}
            <Box sx={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              background: '#f8fafc',
              '&::-webkit-scrollbar': {
                width: '6px'
              },
              '&::-webkit-scrollbar-track': {
                background: '#f1f5f9'
              },
              '&::-webkit-scrollbar-thumb': {
                background: '#cbd5e1',
                borderRadius: '3px',
                '&:hover': {
                  background: '#94a3b8'
                }
              }
            }}>
              {loadingQuestions ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress size={32} sx={{ color: '#020291', mb: 2 }} />
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>
                    Loading questions...
                  </Typography>
                </Box>
              ) : questions.length > 0 ? (
                questions.map((q: any, idx: number) => (
                  <Box
                    key={q.id || idx}
                    sx={{
                      background: 'white',
                      borderRadius: '12px',
                      padding: '20px',
                      border: '1px solid #e2e8f0',
                      marginBottom: '16px',
                      transition: 'all 0.2s',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                      '&:hover': {
                        borderColor: '#8b5cf6',
                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.1)',
                        transform: 'translateY(-2px)'
                      }
                    }}
                  >
                    {/* Question Number & Difficulty Badge */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                      <Box sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: '#ede9fe',
                        color: '#7c3aed',
                        fontWeight: 700,
                        fontSize: '14px',
                        border: '2px solid #ddd6fe'
                      }}>
                        {idx + 1}
                      </Box>
                      {q.difficulty && (
                        <Chip
                          label={q.difficulty.toUpperCase()}
                          size="small"
                          sx={{
                            fontSize: '11px',
                            fontWeight: 700,
                            height: '24px',
                            borderRadius: '6px',
                            ...(q.difficulty.toLowerCase() === 'easy' ? {
                              background: '#dcfce7',
                              color: '#166534',
                              border: '1px solid #bbf7d0'
                            } : q.difficulty.toLowerCase() === 'medium' || q.difficulty.toLowerCase() === 'intermediate' ? {
                              background: '#fef3c7',
                              color: '#92400e',
                              border: '1px solid #fde68a'
                            } : {
                              background: '#fee2e2',
                              color: '#991b1b',
                              border: '1px solid #fecaca'
                            })
                          }}
                        />
                      )}
                    </Box>
                    {/* Question Text */}
                    <Typography sx={{
                      color: '#1e293b',
                      fontSize: '15px',
                      lineHeight: 1.6,
                      mb: q.skill_focus ? 1.5 : 0,
                      fontWeight: 500
                    }}>
                      {q.question_text}
                    </Typography>
                    {q.skill_focus && (
                      <Box sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        background: '#f3e8ff',
                        border: '1px solid #e9d5ff',
                        borderRadius: '6px',
                        padding: '4px 10px'
                      }}>
                        <Typography sx={{
                          color: '#7c3aed',
                          fontSize: '12px',
                          fontWeight: 600
                        }}>
                          Focus: {q.skill_focus}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                ))
              ) : (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <Videocam sx={{ fontSize: 48, color: '#cbd5e1', mb: 2 }} />
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>
                    Questions will be loaded when interview starts
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>}

          {/* RIGHT SIDE - Video Panel */}
          <Box sx={{
            width: { xs: '100%', md: '60%' },
            flex: 1,
            minHeight: 0,
            background: 'white',
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
                background: '#f8fafc',
                borderRadius: 0,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'none'
              }}>
                {isActive ? (
                  // LiveKit Video Call with Tiles
                  <Box
                    sx={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      overflow: 'hidden',
                      borderRadius: 0,
                      background: '#000',
                    }}
                  >
                    {lkToken ? (
                      <LiveKitRoom
                        video={true}
                        audio={true}
                        token={lkToken}
                        serverUrl={import.meta.env.VITE_LIVEKIT_URL || "wss://ai-interview-platform-a0kpbtob.livekit.cloud"}
                        connect={true}
                        onConnected={() => {
                          setCallJoined(true);
                          setParticipantCount(1);
                          maxParticipantsRef.current = Math.max(maxParticipantsRef.current, 1);
                          toast.success('Joined interview');
                        }}
                        style={{ height: '100%', width: '100%', background: '#0a0a0b' }}
                      >
                        <InterviewRecorder
                          shouldRecord={!isUserCandidate && callJoined}
                          mediaRecorderRef={mediaRecorderRef}
                          recordedChunksRef={recordedChunksRef}
                          onRecordingChange={setIsRecording}
                        />
                        <VideoTilesGrid onEndCall={handleEnd} />
                        <RoomAudioRenderer />
                      </LiveKitRoom>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <CircularProgress sx={{ color: '#020291' }} />
                        <Typography sx={{ color: '#64748b' }}>Establishing secure connection...</Typography>
                      </Box>
                    )}
                  </Box>
                ) : isCompleted ? (
                  <Box sx={{ textAlign: 'center', width: '100%', maxWidth: 500, mx: 'auto', p: 4 }}>
                    <Box sx={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 24px',
                      boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)'
                    }}>
                      <Check sx={{ color: 'white', fontSize: 50 }} />
                    </Box>
                    <Typography sx={{
                      color: '#1e293b',
                      fontSize: '28px',
                      fontWeight: 700,
                      mb: 2
                    }}>
                      Interview Completed
                    </Typography>
                    <Typography sx={{ color: '#64748b', fontSize: '15px', lineHeight: 1.6 }}>
                      Interview completed. You can close this window.
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center', p: { xs: 3, sm: 5 } }}>
                    <Box sx={{
                      width: 120,
                      height: 120,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 32px',
                      boxShadow: '0 12px 32px rgba(139, 92, 246, 0.4)'
                    }}>
                      <Videocam sx={{ color: 'white', fontSize: 60 }} />
                    </Box>
                    <Typography sx={{
                      color: '#1e293b',
                      fontSize: { xs: '24px', sm: '32px' },
                      fontWeight: 700,
                      mb: 2
                    }}>
                      Interview Ready
                    </Typography>
                    <Typography sx={{
                      color: '#64748b',
                      fontSize: { xs: '14px', sm: '16px' },
                      mb: 5,
                      lineHeight: 1.7,
                      maxWidth: '500px',
                      mx: 'auto'
                    }}>
                      {isUserCandidate
                        ? 'Your interview is ready. Click below to begin.'
                        : 'Join the interview room to conduct the interview with the candidate.'}
                    </Typography>
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<Videocam />}
                      onClick={handleStart}
                      sx={{
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                        padding: '16px 40px',
                        borderRadius: '12px',
                        fontWeight: 700,
                        fontSize: '16px',
                        textTransform: 'none',
                        boxShadow: '0 8px 24px rgba(139, 92, 246, 0.4)',
                        transition: 'all 0.2s',
                        '&:hover': {
                          background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
                          boxShadow: '0 12px 32px rgba(139, 92, 246, 0.5)',
                          transform: 'translateY(-2px)',
                        }
                      }}
                    >
                      {isUserCandidate ? 'Start Interview' : 'Join Interview'}
                    </Button>
                  </Box>
                )}
              </Paper>
            </Box>

            {/* End Meeting button removed — already inside VideoTilesGrid control bar */}
          </Box>
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

  return isGuest ? content : <Navigation>{content}</Navigation>;
};

export default VideoInterviewRoom;
