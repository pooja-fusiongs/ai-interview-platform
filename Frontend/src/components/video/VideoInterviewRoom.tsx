import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, CircularProgress,
  Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Collapse, TextField
} from '@mui/material';
import {
  ArrowBack, AccessTime,
  Check, Videocam,
  FiberManualRecord, ExpandMore, ExpandLess,
  VideoCall, Description
} from '@mui/icons-material';
import videoInterviewService from '../../services/videoInterviewService';
import ratingService from '../../services/ratingService';
import activityService from '../../services/activityService';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { LiveKitRoom, RoomAudioRenderer, useRemoteParticipants, useTracks } from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, DisconnectReason, RoomOptions, VideoPresets } from 'livekit-client';
import { VideoTilesGrid } from './VideoTilesGrid';
import FaceDetectionOverlay from './FaceDetectionOverlay';
import TranscriptionCapture from './TranscriptionCapture';
import { TranscriptEntry } from '../../hooks/useRealtimeTranscript';
import { getMediaDevices } from '../../utils/mediaDeviceUtils';
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
  onRemoteParticipantJoined?: () => void;
}> = ({ shouldRecord, mediaRecorderRef, recordedChunksRef, onRecordingChange, onRemoteParticipantJoined }) => {
  const remoteParticipants = useRemoteParticipants();
  const remoteJoinedRef = useRef(false);

  // Track when remote participant joins
  useEffect(() => {
    if (remoteParticipants.length > 0 && !remoteJoinedRef.current) {
      remoteJoinedRef.current = true;
      onRemoteParticipantJoined?.();
    }
  }, [remoteParticipants.length]);
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
        camVideoElRef.current.setAttribute('autoplay', '');
      }
      // Always re-create MediaStream to handle track replacements
      camVideoElRef.current.srcObject = new MediaStream([camMediaTrack]);
      camVideoElRef.current.play().catch(() => {});
      // Monitor track ended event
      camMediaTrack.addEventListener('ended', () => {
        console.warn('⚠️ [Recorder] Local camera track ended — recording may lose local video');
      });
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
      console.log('🖥️ [Recorder] Screen share ended, detaching');
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
        remoteCamVideoElRef.current.setAttribute('autoplay', '');
      }
      remoteCamVideoElRef.current.srcObject = new MediaStream([remoteCamMediaTrack]);
      remoteCamVideoElRef.current.play().catch(() => {});
      remoteCamMediaTrack.addEventListener('ended', () => {
        console.warn('⚠️ [Recorder] Remote camera track ended — recording may lose remote video');
      });
    } else if (remoteCamVideoElRef.current) {
      remoteCamVideoElRef.current.srcObject = null;
    }
  }, [remoteCamMediaTrack]);

  // Attach/detach remote screen share video element
  useEffect(() => {
    if (remoteScreenMediaTrack) {
      console.log('🖥️ [Recorder] Remote screen share track detected, attaching');
      if (!remoteScreenVideoElRef.current) {
        remoteScreenVideoElRef.current = document.createElement('video');
        remoteScreenVideoElRef.current.muted = true;
        remoteScreenVideoElRef.current.playsInline = true;
      }
      remoteScreenVideoElRef.current.srcObject = new MediaStream([remoteScreenMediaTrack]);
      remoteScreenVideoElRef.current.play().catch(() => {});
    } else if (remoteScreenVideoElRef.current) {
      console.log('🖥️ [Recorder] Remote screen share ended, detaching');
      remoteScreenVideoElRef.current.srcObject = null;
    }
  }, [remoteScreenMediaTrack]);

  // Start recording when mic track becomes available (wait briefly for camera too)
  useEffect(() => {
    console.log(`🔍 [Recorder Check] shouldRecord=${shouldRecord}, started=${startedRef.current}, hasRecorder=${!!mediaRecorderRef.current}, hasMic=${!!micMediaTrack}, hasCam=${!!camMediaTrack}, remoteCount=${remoteParticipants.length}`);
    if (!shouldRecord || startedRef.current || mediaRecorderRef.current) {
      if (!shouldRecord) console.warn('⏸️ [Recorder] shouldRecord=false — recording NOT starting (callJoined is false?)');
      if (startedRef.current) console.log('✅ [Recorder] Already started, skipping');
      if (mediaRecorderRef.current) console.log('✅ [Recorder] MediaRecorder already exists, skipping');
      return;
    }
    if (!micMediaTrack) {
      console.warn('⏸️ [Recorder] No mic track yet — waiting for mic permission...');
      return;
    }
    // Wait for camera track too — if not available yet, wait up to 3s then start anyway
    if (!camMediaTrack) {
      console.log('⏳ [Recorder] Mic ready but waiting for camera track (up to 3s)...');
    }

    // Delay recording start to give camera track time to appear
    const timer = setTimeout(async () => {
      if (startedRef.current || mediaRecorderRef.current) return;
      startedRef.current = true;

      try {
        console.log(`🎬 Starting recording: screen=${!!screenMediaTrack}, camera=${!!camMediaTrack}, mic=${!!micMediaTrack}`);

        // --- Audio setup ---
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;

        // Resume AudioContext (required on mobile browsers where it starts suspended)
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
          console.log('🔊 AudioContext resumed from suspended state');
        }

        const destination = audioCtx.createMediaStreamDestination();
        destinationRef.current = destination;

        const localSource = audioCtx.createMediaStreamSource(new MediaStream([micMediaTrack]));
        localSource.connect(destination);
        console.log('🎤 Local mic connected to audio mixer');

        for (const remote of remoteParticipants) {
          const remoteMicPub = remote.getTrackPublication(Track.Source.Microphone);
          const remoteTrack = remoteMicPub?.track?.mediaStreamTrack;
          if (remoteTrack) {
            // IMPORTANT: Clone the track! Original track gets consumed by RoomAudioRenderer for playback.
            // Without clone, AudioContext stops receiving data after a few seconds.
            const clonedTrack = remoteTrack.clone();
            const remoteSrc = audioCtx.createMediaStreamSource(new MediaStream([clonedTrack]));
            remoteSrc.connect(destination);
            connectedRemotesRef.current.add(remote.identity);
            console.log(`🎙️ Remote participant audio connected: ${remote.identity}`);

            // Monitor remote audio level
            const remoteAnalyser = audioCtx.createAnalyser();
            remoteAnalyser.fftSize = 256;
            remoteSrc.connect(remoteAnalyser);
            const remoteData = new Uint8Array(remoteAnalyser.frequencyBinCount);
            const remoteMonitor = setInterval(() => {
              if (audioCtx.state === 'closed') { clearInterval(remoteMonitor); return; }
              remoteAnalyser.getByteFrequencyData(remoteData);
              const avg = remoteData.reduce((sum, v) => sum + v, 0) / remoteData.length;
              if (avg > 1) {
                console.log(`🎙️ Remote Audio [${remote.identity}]: ${avg.toFixed(1)} — Voice detected ✅`);
              } else {
                console.warn(`🔇 Remote Audio [${remote.identity}]: ${avg.toFixed(1)} — No voice ❌`);
              }
            }, 2000);
          } else {
            console.warn(`⚠️ Remote participant ${remote.identity} has NO mic track`);
          }
        }

        // --- Canvas compositing setup ---
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        canvasRef.current = canvas;
        const ctx = canvas.getContext('2d')!;

        // Draw loop: composites all video tracks onto canvas
        // Always checks DOM as fallback — handles LiveKit track replacements
        let frameMissCount = 0;
        const drawFrame = () => {
          const localScreenVid = screenVideoElRef.current;
          let localCamVid = camVideoElRef.current;
          const remoteScreenVid = remoteScreenVideoElRef.current;
          let remoteCamVid = remoteCamVideoElRef.current;

          const hasLocalScreen = localScreenVid?.srcObject && localScreenVid.readyState >= 2;
          let hasLocalCam = !!(localCamVid?.srcObject && localCamVid.readyState >= 2);
          const hasRemoteScreen = remoteScreenVid?.srcObject && remoteScreenVid.readyState >= 2;
          let hasRemoteCam = !!(remoteCamVid?.srcObject && remoteCamVid.readyState >= 2);

          // ALWAYS check DOM for live video elements — handles track replacements
          if (!hasLocalCam || !hasRemoteCam) {
            const domVideos = document.querySelectorAll<HTMLVideoElement>('video');
            for (const v of domVideos) {
              if (!v.srcObject || v.readyState < 2 || v.videoWidth === 0) continue;
              if (v.muted && !hasLocalCam) {
                localCamVid = v; hasLocalCam = true;
              } else if (!v.muted && !hasRemoteCam) {
                remoteCamVid = v; hasRemoteCam = true;
              }
            }
          }

          // Track missed frames — log warning if canvas has nothing for 30+ frames
          if (!hasLocalCam && !hasRemoteCam && !hasLocalScreen && !hasRemoteScreen) {
            frameMissCount++;
            if (frameMissCount === 90) { // ~3 sec at 30fps
              console.warn('⚠️ [Recording] No video sources for 3+ seconds — recording may be blank');
            }
          } else {
            frameMissCount = 0;
          }

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
        const canvasStream = canvas.captureStream(15); // 15fps — smoother on slow connections
        const combinedStream = new MediaStream();
        canvasStream.getVideoTracks().forEach(t => combinedStream.addTrack(t));
        const audioTracks = destination.stream.getAudioTracks();
        audioTracks.forEach(t => combinedStream.addTrack(t));
        console.log(`🔊 Audio tracks in recording: ${audioTracks.length}, AudioContext state: ${audioCtx.state}`);

        recordedChunksRef.current = [];

        let mimeType = 'video/webm;codecs=vp8,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4';
        }

        console.log(`🎬 Recording: ${combinedStream.getVideoTracks().length} video + ${combinedStream.getAudioTracks().length} audio, MIME: ${mimeType}`);

        const mediaRecorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 500000, audioBitsPerSecond: 128000 });
        let chunkCount = 0;
        let totalBytes = 0;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
            chunkCount++;
            totalBytes += event.data.size;
            // Log every 10 chunks (~10 seconds)
            if (chunkCount % 10 === 0) {
              console.log(`📦 [Recording] ${chunkCount} chunks, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total, recorder state: ${mediaRecorder.state}`);
            }
          }
        };
        mediaRecorder.addEventListener('pause', () => {
          console.log(`🎬 [Recording] State changed: ${mediaRecorder.state}`);
        });
        mediaRecorder.addEventListener('resume', () => {
          console.log(`🎬 [Recording] State changed: ${mediaRecorder.state}`);
        });
        mediaRecorder.onerror = (event: any) => {
          console.error('❌ MediaRecorder error:', event.error);
        };

        mediaRecorder.start(1000);
        mediaRecorderRef.current = mediaRecorder;
        onRecordingChange(true);
        console.log(`✅ Recording started! State: ${mediaRecorder.state}, MIME: ${mimeType}, video tracks: ${combinedStream.getVideoTracks().length}, audio tracks: ${combinedStream.getAudioTracks().length}`);

        // Audio level monitor — logs every 2 seconds to verify mic is capturing
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        localSource.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const audioMonitor = setInterval(() => {
          if (audioCtx.state === 'closed') { clearInterval(audioMonitor); return; }
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length;
          if (avg > 1) {
            console.log(`🎤 Audio Level: ${avg.toFixed(1)} — Voice detected ✅`);
          } else {
            console.warn(`🔇 Audio Level: ${avg.toFixed(1)} — No voice detected ❌ (mic mute hai ya kaam nahi kar raha)`);
          }
        }, 2000);
      } catch (err) {
        console.error('❌ Failed to start recording:', err);
        startedRef.current = false;
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [shouldRecord, micMediaTrack, camMediaTrack]);

  // Dynamically connect remote participant audio when they join AFTER recording starts
  useEffect(() => {
    if (!audioCtxRef.current || !destinationRef.current || !mediaRecorderRef.current) {
      if (remoteParticipants.length > 0) {
        console.warn(`⚠️ [Late Join] ${remoteParticipants.length} remote participant(s) detected but recorder not ready yet — audioCtx=${!!audioCtxRef.current}, destination=${!!destinationRef.current}, recorder=${!!mediaRecorderRef.current}`);
      }
      return;
    }
    const audioCtx = audioCtxRef.current;
    const destination = destinationRef.current;

    for (const remote of remoteParticipants) {
      if (connectedRemotesRef.current.has(remote.identity)) continue;

      const remoteMicPub = remote.getTrackPublication(Track.Source.Microphone);
      const remoteTrack = remoteMicPub?.track?.mediaStreamTrack;
      console.log(`🔍 [Late Join] Checking remote "${remote.identity}": micPub=${!!remoteMicPub}, track=${!!remoteMicPub?.track}, mediaStreamTrack=${!!remoteTrack}, trackEnabled=${remoteTrack?.enabled}, trackMuted=${remoteTrack?.muted}`);
      if (remoteTrack) {
        try {
          // Clone track so RoomAudioRenderer (playback) and our recorder don't fight over the same track
          const clonedTrack = remoteTrack.clone();
          const src = audioCtx.createMediaStreamSource(new MediaStream([clonedTrack]));
          src.connect(destination);
          connectedRemotesRef.current.add(remote.identity);
          console.log(`✅ [Late Join] Remote "${remote.identity}" audio connected to mixer! Total connected: ${connectedRemotesRef.current.size}`);

          // Monitor this remote's audio level
          const lateAnalyser = audioCtx.createAnalyser();
          lateAnalyser.fftSize = 256;
          src.connect(lateAnalyser);
          const lateData = new Uint8Array(lateAnalyser.frequencyBinCount);
          const lateMonitor = setInterval(() => {
            if (audioCtx.state === 'closed') { clearInterval(lateMonitor); return; }
            lateAnalyser.getByteFrequencyData(lateData);
            const avg = lateData.reduce((sum, v) => sum + v, 0) / lateData.length;
            if (avg > 1) {
              console.log(`🎙️ [Late Join] Remote Audio [${remote.identity}]: ${avg.toFixed(1)} — Voice detected ✅`);
            } else {
              console.warn(`🔇 [Late Join] Remote Audio [${remote.identity}]: ${avg.toFixed(1)} — Silent ❌`);
            }
          }, 3000);
        } catch (err) {
          console.error(`❌ [Late Join] Failed to connect remote "${remote.identity}" audio:`, err);
        }
      } else {
        console.warn(`⚠️ [Late Join] Remote "${remote.identity}" has NO mic track — mic off or not published yet`);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Candidate joins via email link with ?token=xxx
  // Save token to sessionStorage and remove from URL so candidate can't see/remove it
  const [isCandidateLink] = useState(() => {
    const tokenFromUrl = searchParams.get('token');
    if (tokenFromUrl) {
      sessionStorage.setItem(`interview_token_${videoId}`, tokenFromUrl);
      return true;
    }
    return !!sessionStorage.getItem(`interview_token_${videoId}`);
  });

  // Remove token from URL on first render (clean URL)
  useEffect(() => {
    if (searchParams.get('token')) {
      searchParams.delete('token');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

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
  // Recording upload is now non-blocking (background)
  const [, setParticipantCount] = useState(0);
  const [lkToken, setLkToken] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionRatings, setQuestionRatings] = useState<Record<number, number>>({});
  const questionRatingsRef = useRef<Record<number, number>>({});
  const [savingRating, setSavingRating] = useState<number | null>(null);
  const ratingQueueRef = useRef<Array<{ questionId: number; rating: number }>>([]);
  const isProcessingRatingRef = useRef(false);
  const [interviewJobId, setInterviewJobId] = useState<number | null>(null);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [expandedAnswers, setExpandedAnswers] = useState<Record<number, boolean>>({});
  const [interviewMode, setInterviewMode] = useState<'video' | 'classic'>('video');
  const [classicTranscript, setClassicTranscript] = useState('');
  const [showTranscriptInput, setShowTranscriptInput] = useState(false);
  const [submittingClassic, setSubmittingClassic] = useState(false);
  const [hasExited, setHasExited] = useState(false);
  const [interviewEnded, setInterviewEnded] = useState(false);
  const [gracePeriodTimer, setGracePeriodTimer] = useState<number | null>(null);
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [, setTranscriptConnected] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const graceCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const endingRef = useRef(false);

  // Guard recording / transcription / fraud-detection from being killed by an
  // accidental refresh, back-button or tab close. While the call is joined:
  //   1. activityService.setInterviewActive(true) → suppresses the auto-logout
  //      beacon that beforeunload would otherwise fire (which invalidates the
  //      session and tears down the WS connections mid-interview).
  //   2. A native browser confirm prompt warns before leaving the page.
  useEffect(() => {
    activityService.setInterviewActive(callJoined);
    if (!callJoined) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      activityService.setInterviewActive(false);
    };
  }, [callJoined]);

  // Final safety: ensure the flag is cleared on unmount even if callJoined
  // never flipped back to false (e.g. user navigates away mid-call).
  useEffect(() => {
    return () => {
      activityService.setInterviewActive(false);
    };
  }, []);

  // Audio-only fallback — set automatically when the browser denies the
  // camera (e.g. another tab/app owns it). LiveKitRoom is re-mounted with
  // video={false} so the user can at least hear/see the remote participant.
  const [audioOnlyMode, setAudioOnlyMode] = useState(false);
  // const jitsiApiRef = useRef<any>(null); // Removed Jitsi ref
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const maxParticipantsRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 3;

  useEffect(() => {
    const fetchInterview = async (retryCount = 0) => {
      try {
        const data = isGuest
          ? await videoInterviewService.guestGetInterview(Number(videoId))
          : await videoInterviewService.getInterview(Number(videoId));
        setInterview(data);

        // Fetch questions only for recruiter/interviewer (not for candidates)
        if (!isGuest && !isCandidateLink && user?.role !== 'candidate') {
          fetchQuestions();
        }
        const s = (data.status || '').toLowerCase();

        // Terminal states — don't start anything
        if (['completed', 'cancelled', 'no_show'].includes(s)) {
          const isCandidate = isGuest || isCandidateLink || user?.role === 'candidate';
          if (isCandidate) {
            // Candidates stay on a "thank you" screen — never redirect to login/dashboard
            setInterviewEnded(true);
            setLoading(false);
            return;
          }
          toast(
            s === 'no_show' ? 'Interview expired — candidate did not join'
              : s === 'cancelled' ? 'This interview was cancelled'
              : 'This interview is already completed',
            { icon: 'ℹ️', duration: 3000 }
          );
          setTimeout(() => navigate(`/video-detail/${videoId}`), 2000);
          return;
        }

        if (s === 'in_progress') {
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
        } else if (s === 'waiting') {
          // Interview is waiting for candidate - start grace period check
          startGracePeriodCheck();
        }
        setLoading(false);
      } catch (err: any) {
        // Retry once on timeout/network error (cold start on Render can be slow)
        if (retryCount < 1 && (!err.response || err.code === 'ECONNABORTED')) {
          console.warn('⚠️ Initial fetch failed, retrying...', err.message);
          setTimeout(() => fetchInterview(retryCount + 1), 2000);
          return;
        }
        setError(err.response?.data?.detail || err.message || 'Failed to load interview.');
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

  // Proactive token refresh — silently renew token before it expires during interview
  useEffect(() => {
    if (isGuest) return; // Guest tokens don't need refresh

    const REFRESH_BEFORE_SECONDS = 5 * 60; // Refresh 5 min before expiry
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const getTokenExpiry = (): number | null => {
      const token = localStorage.getItem('token');
      if (!token) return null;
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp ? payload.exp * 1000 : null; // Convert to ms
      } catch {
        return null;
      }
    };

    const scheduleRefresh = () => {
      const expiry = getTokenExpiry();
      if (!expiry) return;

      const now = Date.now();
      const msUntilRefresh = expiry - now - (REFRESH_BEFORE_SECONDS * 1000);

      // If already past refresh time but token not expired yet, refresh immediately
      // If token already expired, the 401 interceptor will handle it
      const delay = Math.max(msUntilRefresh, 0);

      if (expiry <= now) return; // Token already expired, let interceptor handle

      refreshTimer = setTimeout(async () => {
        try {
          const currentToken = localStorage.getItem('token');
          if (!currentToken) return;

          const resp = await fetch(
            `${import.meta.env.VITE_API_BASE_URL || 'https://ai-interview-platform-2bov.onrender.com'}/api/auth/refresh`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (resp.ok) {
            const data = await resp.json();
            if (data.access_token) {
              localStorage.setItem('token', data.access_token);
              console.log('🔄 Token silently refreshed during interview');
              // Schedule the next refresh for the new token
              scheduleRefresh();
            }
          } else {
            console.warn('⚠️ Token refresh returned non-OK status:', resp.status);
          }
        } catch (err) {
          console.warn('⚠️ Silent token refresh failed:', err);
        }
      }, delay);
    };

    scheduleRefresh();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [isGuest]);

  const fetchQuestions = async (retryCount = 0) => {
    try {
      setLoadingQuestions(true);
      const response = await videoInterviewService.getAIInterviewQuestions(Number(videoId));
      const fetchedQuestions = response.questions || [];
      setQuestions(fetchedQuestions);
      if (response.job_id) setInterviewJobId(response.job_id);
      if (response.application_id) setApplicationId(response.application_id);

      // If questions still pending (generating in background), retry after delay
      if (fetchedQuestions.length === 0 && response.questions_pending && retryCount < 5) {
        setTimeout(() => fetchQuestions(retryCount + 1), 5000);
      }
    } catch (err: any) {
      console.warn('Failed to fetch questions:', err);
      // Retry on error (questions might still be generating)
      if (retryCount < 3) {
        setTimeout(() => fetchQuestions(retryCount + 1), 5000);
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  // Process rating queue one at a time with retry
  const processRatingQueue = async () => {
    if (isProcessingRatingRef.current || !interviewJobId || !applicationId) return;
    isProcessingRatingRef.current = true;

    while (ratingQueueRef.current.length > 0) {
      const { questionId, rating } = ratingQueueRef.current.shift()!;
      setSavingRating(questionId);

      let saved = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await ratingService.rateQuestion(interviewJobId, applicationId, questionId, { rating, source: 'video_interview' });
          questionRatingsRef.current = { ...questionRatingsRef.current, [questionId]: rating };
          setQuestionRatings(prev => ({ ...prev, [questionId]: rating }));
          saved = true;
          break;
        } catch (err: any) {
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, attempt * 1000)); // Wait 1s, 2s before retry
          }
        }
      }
      // All retries failed — revert optimistic update so UI doesn't show unsaved score
      if (!saved) {
        const reverted = { ...questionRatingsRef.current };
        delete reverted[questionId];
        questionRatingsRef.current = reverted;
        setQuestionRatings(prev => { const u = { ...prev }; delete u[questionId]; return u; });
        toast.error(`Failed to save rating for Q${questionId}. Please try again.`, { id: `rating-fail-${questionId}`, duration: 4000 });
      }
    }

    setSavingRating(null);
    isProcessingRatingRef.current = false;
  };

  const handleRateQuestion = (questionId: number, rating: number) => {
    if (!interviewJobId || !applicationId) {
      toast.error('Unable to save rating — interview data missing');
      return;
    }
    // Update UI immediately for fast feedback (ref updated only after successful save)
    setQuestionRatings(prev => ({ ...prev, [questionId]: rating }));
    // Replace any pending rating for same question in queue
    ratingQueueRef.current = ratingQueueRef.current.filter(r => r.questionId !== questionId);
    ratingQueueRef.current.push({ questionId, rating });
    processRatingQueue();
  };

  const handleUnrateQuestion = (questionId: number) => {
    if (!interviewJobId || !applicationId) return;
    // Remove from UI
    setQuestionRatings(prev => {
      const updated = { ...prev };
      delete updated[questionId];
      return updated;
    });
    // Remove from ref
    const updatedRef = { ...questionRatingsRef.current };
    delete updatedRef[questionId];
    questionRatingsRef.current = updatedRef;
    // Remove from queue (don't send any pending rating for this question)
    ratingQueueRef.current = ratingQueueRef.current.filter(r => r.questionId !== questionId);
    // Delete rating from backend
    ratingService.deleteRating(interviewJobId, applicationId, questionId, 'video_interview').catch(() => {
      // If delete fails, silently ignore — rating stays on backend
      console.warn('Failed to delete rating for question', questionId);
    });
  };

  const handleClassicSubmit = async () => {
    if (!interviewJobId || !applicationId) {
      toast.error('Interview data missing');
      return;
    }
    const ratedCount = Object.keys(questionRatings).length;
    if (ratedCount === 0) {
      toast.error('Please rate at least one question before submitting');
      return;
    }
    setSubmittingClassic(true);
    try {
      // Upload transcript if provided
      if (classicTranscript.trim()) {
        const formData = new FormData();
        formData.append('transcript_text', classicTranscript.trim());
        await ratingService.submitTranscript(interviewJobId, applicationId, formData);
      }
      // Generate report from ratings
      toast.loading('Generating report...', { id: 'classic-report' });
      const result = await ratingService.finalizeReport(interviewJobId, applicationId);
      if (result.status === 'success') {
        toast.success(`Report generated! Score: ${result.recruiter_score}/10`, { id: 'classic-report', duration: 4000 });
      } else {
        toast.dismiss('classic-report');
        toast.success('Ratings saved successfully');
      }
      // End the interview - classic mode: force completed with score
      try {
        await videoInterviewService.endInterview(Number(videoId), {
          max_participants: 2,
          force_complete: true,
          overall_score: result.recruiter_score || null,
          recommendation: result.report_card?.recommendation || 'next_round',
        });
        setInterview((prev: any) => prev ? { ...prev, status: 'completed' } : prev);
      } catch {}
      setTimeout(() => navigate(`/video-detail/${videoId}`), 2000);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to submit');
    } finally {
      setSubmittingClassic(false);
    }
  };

  const startGracePeriodCheck = () => {
    // Check grace period every 30 seconds
    if (graceCheckIntervalRef.current) return; // Already checking

    const checkGrace = async () => {
      try {
        // Safety: if candidate already joined (detected via LiveKit), skip grace period check
        if (maxParticipantsRef.current >= 2) {
          if (graceCheckIntervalRef.current) {
            clearInterval(graceCheckIntervalRef.current);
            graceCheckIntervalRef.current = null;
            setGracePeriodTimer(null);
          }
          return;
        }

        const response = await videoInterviewService.checkGracePeriod(Number(videoId), 10); // 10 minutes grace

        // Backend says status is IN_PROGRESS = candidate already joined on backend
        // Even if recruiter's LiveKit didn't detect them (connection issues)
        if (response.status === 'in_progress') {
          maxParticipantsRef.current = Math.max(maxParticipantsRef.current, 2);
          if (graceCheckIntervalRef.current) {
            clearInterval(graceCheckIntervalRef.current);
            graceCheckIntervalRef.current = null;
            setGracePeriodTimer(null);
          }
          console.log('✅ Backend confirms candidate joined (status=in_progress), stopping grace period check');
          return;
        }

        if (response.grace_period_expired) {
          // Grace period expired, candidate didn't join — stop everything
          if (graceCheckIntervalRef.current) {
            clearInterval(graceCheckIntervalRef.current);
            graceCheckIntervalRef.current = null;
          }
          // Stop LiveKit and recording
          setIsActive(false);
          setCallJoined(false);
          setIsRecording(false);
          cleanupVideoCall();

          toast.error('Candidate did not join within grace period. Redirecting...', { duration: 3000 });

          // End interview on backend (marks as no_show)
          try {
            await videoInterviewService.endInterview(Number(videoId), {
              max_participants: maxParticipantsRef.current,
            });
          } catch {}

          // Redirect to detail page
          setTimeout(() => navigate(`/video-detail/${videoId}`), 2500);
          return;
        } else if (response.remaining_seconds) {
          setGracePeriodTimer(response.remaining_seconds);
        }
      } catch (err) {
        console.error('Grace period check failed:', err);
      }
    };

    // Check immediately
    checkGrace();

    // Then check every 60 seconds (reduced from 30s to save bandwidth)
    graceCheckIntervalRef.current = setInterval(checkGrace, 60000);
  };

  // Device check on mount (no permission request — LiveKit handles that to avoid double prompts in incognito)
  useEffect(() => {
    const checkDevices = async () => {
      try {
        const deviceInfo = await getMediaDevices();
        if (!deviceInfo.hasVideo && !deviceInfo.hasAudio) {
          toast.error('No camera or microphone found. Please connect devices and refresh.');
        }
      } catch (err: any) {
        console.warn('Device enumeration failed:', err);
      }
    };
    checkDevices();
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

  // Fetch LiveKit token when interview is active (with retry)
  useEffect(() => {
    let cancelled = false;
    const fetchToken = async () => {
      if (isActive && interview && !lkToken) {
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          if (cancelled) return;
          try {
            const roomName = `interview_${videoId}`;
            const data = isGuest
              ? await videoInterviewService.guestJoinInterview(Number(videoId))
              : await videoInterviewService.joinInterview(Number(videoId));
            if (!cancelled) {
              setLkToken(data.token);
              console.log('🎥 LiveKit token fetched for room:', roomName);
            }
            return;
          } catch (err: any) {
            console.error(`LiveKit token error (attempt ${attempt}/${maxRetries}):`, err);
            if (attempt === maxRetries) {
              if (!cancelled) toast.error('Failed to get video token. Please refresh.');
            } else {
              // Wait before retrying (1s, 2s)
              await new Promise(r => setTimeout(r, attempt * 1000));
            }
          }
        }
      }
    };
    fetchToken();
    return () => { cancelled = true; };
  }, [isActive, interview, videoId, user, lkToken, isGuest]);

  // Removed Jitsi initialization functions as we're moving to declarative LiveKit components

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // ?role=candidate in URL = candidate view (email link), regardless of login
  // Guest (no login) = candidate view
  // candidate role = candidate view
  const isUserCandidate = isGuest || isCandidateLink || user?.role === 'candidate';

  const handleStart = () => {
    console.log('🎬 handleStart called, user role:', user?.role);
    if (isUserCandidate) {
      // If consent already given (rejoining after exit), skip dialog
      if (interview?.recording_consent) {
        setIsActive(true);
        toast.success('Rejoining interview...');
      } else {
        setShowConsentDialog(true);
      }
    } else {
      // Recruiter/Admin: join interview directly as interviewer
      console.log('🎬 Recruiter joining as interviewer');
      joinAsInterviewer();
    }
  };

  const joinAsInterviewer = async () => {
    try {
      // IMPORTANT: Resume AudioContext on user click (Chrome autoplay policy)
      try {
        const tempCtx = new AudioContext();
        if (tempCtx.state === 'suspended') await tempCtx.resume();
        tempCtx.close();
        console.log('🔊 AudioContext unlocked by recruiter click (Chrome autoplay fix)');
      } catch (e) { /* ignore */ }

      // Recruiter joins as interviewer with full audio/video
      setIsActive(true);
      toast.success('Joining interview...');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to join interview');
    }
  };


  const handleConsentAccept = async () => {
    setShowConsentDialog(false);

    // IMPORTANT: Resume/create AudioContext immediately on user click (Chrome autoplay policy)
    // Chrome blocks AudioContext and audio playback unless triggered by a user gesture.
    // This must happen synchronously in the click handler, NOT after async calls.
    try {
      const tempCtx = new AudioContext();
      if (tempCtx.state === 'suspended') await tempCtx.resume();
      tempCtx.close(); // Close temp context — LiveKit and InterviewRecorder will create their own
      console.log('🔊 AudioContext unlocked by user gesture (Chrome autoplay fix)');
    } catch (e) {
      console.warn('AudioContext unlock failed:', e);
    }

    // Start LiveKit + recording IMMEDIATELY — don't wait for API calls
    setIsActive(true);
    toast.success('Joining interview...');

    // API calls run in background — consent save + join
    try {
      if (isGuest) {
        await videoInterviewService.guestUpdateRecordingConsent(Number(videoId), true);
      } else {
        await videoInterviewService.updateRecordingConsent(Number(videoId), true);
      }

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
    } catch (err: any) {
      console.error('Background join API failed:', err);
      // Don't stop the interview — LiveKit is already connected
    }
  };

  const handleConsentDecline = () => {
    setShowConsentDialog(false);
    toast.error('Recording consent is required to start the interview.');
  };

  // Recording callback for InterviewRecorder component
 

  // Stop recorder and return blob (non-blocking — does NOT upload)
  const stopRecorderAndGetBlob = (): Promise<Blob | null> => {
    console.log(`🛑 [StopRecorder] Called — mediaRecorder exists: ${!!mediaRecorderRef.current}, state: ${mediaRecorderRef.current?.state || 'N/A'}, chunks: ${recordedChunksRef.current.length}`);
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      console.error('❌ [StopRecorder] NO active MediaRecorder! Recording was never started or already stopped.');
      // Still return existing chunks if any (recorder may have been stopped by browser)
      if (recordedChunksRef.current.length > 0) {
        const blob = new Blob(recordedChunksRef.current, { type: recordedChunksRef.current[0]?.type || 'video/webm' });
        console.log(`✅ [StopRecorder] Blob from existing chunks: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
        recordedChunksRef.current = [];
        return Promise.resolve(blob);
      }
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      // Safety timeout: if onstop never fires, resolve with whatever chunks we have
      const timeout = setTimeout(() => {
        console.warn('⚠️ [StopRecorder] onstop timeout (5s) — resolving with existing chunks');
        setIsRecording(false);
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: recordedChunksRef.current[0]?.type || 'video/webm' });
          recordedChunksRef.current = [];
          resolve(blob);
        } else {
          resolve(null);
        }
      }, 5000);

      const recorder = mediaRecorderRef.current!;
      recorder.onstop = () => {
        clearTimeout(timeout);
        setIsRecording(false);
        console.log(`🛑 [StopRecorder] Stopped. Total chunks: ${recordedChunksRef.current.length}`);
        if (recordedChunksRef.current.length === 0) {
          console.error('❌ [StopRecorder] ZERO chunks! Recording captured NOTHING.');
          resolve(null);
          return;
        }
        const blob = new Blob(recordedChunksRef.current, {
          type: recordedChunksRef.current[0]?.type || 'video/webm'
        });
        console.log(`✅ [StopRecorder] Blob created: ${(blob.size / 1024 / 1024).toFixed(2)} MB, type: ${blob.type}, chunks: ${recordedChunksRef.current.length}`);
        recordedChunksRef.current = [];
        resolve(blob);
      };
      try {
        recorder.stop();
      } catch (err) {
        console.warn('⚠️ [StopRecorder] recorder.stop() threw:', err);
        clearTimeout(timeout);
        setIsRecording(false);
        resolve(null);
      }
    });
  };

  const cleanupVideoCall = () => {
    setLkToken(null);
    if (videoContainerRef.current) {
      videoContainerRef.current.innerHTML = '';
    }
  };

  const handleExit = () => {
    // Exit: leave the call temporarily without ending the interview
    // Stop and discard current recording so a fresh one starts on rejoin
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      mediaRecorderRef.current = null;
    }
    recordedChunksRef.current = [];

    setIsActive(false);
    setCallJoined(false);
    setHasExited(true);
    setIsRecording(false);
    cleanupVideoCall();
    toast.success('You left the call. Click "Rejoin Interview" to rejoin.', { duration: 5000 });
  };

  const handleEnd = async () => {
    // Prevent double execution but allow retry after 10s timeout
    if (endingRef.current) {
      console.warn('handleEnd already in progress');
      toast('Ending interview... please wait', { icon: '⏳', id: 'ending-wait' });
      return;
    }
    endingRef.current = true;
    // Safety: reset after 10s in case end flow hangs (so button becomes clickable again)
    const safetyTimer = setTimeout(() => { endingRef.current = false; }, 10000);

    console.log(`\n========== 🔴 END INTERVIEW FLOW START ==========`);
    console.log(`📊 State: isActive=${isActive}, callJoined=${callJoined}, isRecording=${isRecording}, isGuest=${isGuest}`);
    console.log(`📊 Recorder: exists=${!!mediaRecorderRef.current}, state=${mediaRecorderRef.current?.state || 'N/A'}, chunks=${recordedChunksRef.current.length}`);
    console.log(`📊 Participants: maxParticipants=${maxParticipantsRef.current}`);

    try {
    // 1) INSTANT UI update — stop video/recording immediately
    setIsActive(false);
    setCallJoined(false);
    setIsRecording(false);
    setEnding(false);
    // Optimistically mark the interview completed so the render switches to
    // the "Interview Completed" screen immediately. Otherwise there's a 1-5s
    // window between setIsActive(false) and the backend endInterview response
    // during which isCompleted is false and the "Join Video Interview" UI
    // briefly reappears. The backend-confirmed value is merged in at line ~1246.
    setInterview((prev: any) => prev ? { ...prev, status: 'completed' } : prev);
    // Don't assume no_show from frontend maxParticipants — backend has the truth
    // (candidate may have joined on backend even if recruiter's connection kept failing)
    const candidateEverJoined = maxParticipantsRef.current >= 2;

    // 1.5) Flush pending rating queue — save all unsaved ratings before ending
    if (ratingQueueRef.current.length > 0 && interviewJobId && applicationId) {
      console.log(`💾 Flushing ${ratingQueueRef.current.length} pending rating(s) before end...`);
      const pendingRatings = [...ratingQueueRef.current];
      ratingQueueRef.current = [];
      for (const { questionId, rating } of pendingRatings) {
        try {
          await ratingService.rateQuestion(interviewJobId, applicationId, questionId, { rating, source: 'video_interview' });
          questionRatingsRef.current = { ...questionRatingsRef.current, [questionId]: rating };
          console.log(`💾 Saved pending rating: Q${questionId} = ${rating}`);
        } catch (err) {
          console.warn(`⚠️ Failed to save pending rating Q${questionId}:`, err);
        }
      }
    }

    // 2) Stop recorder (fast — just stops MediaRecorder, no upload)
    let recordingBlob: Blob | null = null;
    try {
      recordingBlob = await stopRecorderAndGetBlob();
    } catch (err) {
      console.error('❌ [handleEnd] stopRecorderAndGetBlob threw:', err);
    }

    console.log(`📦 [handleEnd] Recording blob: ${recordingBlob ? `${(recordingBlob.size / 1024 / 1024).toFixed(2)} MB` : 'NULL — no recording!'}`);

    // 3) Clean up video call
    cleanupVideoCall();

    // 4+5) Upload recording and call endInterview IN PARALLEL — don't block end on upload
    // ALWAYS upload if a blob exists, regardless of who joined.
    // Whoever ends the call (recruiter OR candidate) — the recording must be saved.
    const uploadPromise = (async () => {
      if (recordingBlob) {
        try {
          const upload = isGuest ? videoInterviewService.guestUploadRecording : videoInterviewService.uploadRecording;
          console.log(`🎬 [handleEnd] Uploading recording: ${(recordingBlob.size / 1024 / 1024).toFixed(2)} MB (maxParticipants=${maxParticipantsRef.current})...`);
          const uploadResult = await upload(Number(videoId), recordingBlob);
          console.log('✅ [handleEnd] Recording uploaded:', uploadResult);
        } catch (err) {
          console.error('❌ [handleEnd] Recording upload failed:', err);
        }
      } else {
        console.error('❌ [handleEnd] NO recording blob to upload! MediaRecorder produced nothing.');
      }
    })();

    let endResult: any = null;
    const endPromise = (async () => {
      try {
        if (isGuest) {
          endResult = await videoInterviewService.guestEndInterview(Number(videoId));
        } else {
          endResult = await videoInterviewService.endInterview(Number(videoId), {
            max_participants: maxParticipantsRef.current
          });
        }
        setInterview({ ...interview, ...endResult });
      } catch (err: any) {
        console.error('End interview API failed:', err);
      }
    })();

    // endInterview must complete; upload can continue in background (don't block user)
    await endPromise;
    // Don't await upload — let it finish in background so user isn't stuck
    uploadPromise.catch(() => {});

    // 6) Use backend status (truth) — not frontend-only maxParticipants
    const backendStatus = (endResult?.status || '').toLowerCase();
    const actuallyCompleted = backendStatus === 'completed' || candidateEverJoined;

    if (actuallyCompleted) {
      if (!recordingBlob && candidateEverJoined) {
        toast('Interview completed but recording was not captured. Only transcript will be available.', { icon: '⚠️', duration: 6000 });
      } else {
        toast.success('Interview completed!');
      }
      // Auto-generate report from recruiter ratings
      if (!isGuest && interviewJobId && applicationId && Object.keys(questionRatings).length > 0) {
        try {
          toast.loading('Generating report card...', { id: 'report-gen' });
          const reportResult = await ratingService.finalizeReport(interviewJobId, applicationId);
          if (reportResult.status === 'success') {
            toast.success(`Report generated! Recruiter Score: ${reportResult.recruiter_score}/10`, { id: 'report-gen', duration: 4000 });
          } else {
            toast.dismiss('report-gen');
          }
        } catch (err) {
          toast.dismiss('report-gen');
          console.error('Report generation failed:', err);
        }
      }
    } else {
      toast('Candidate did not join the interview', { icon: 'ℹ️', duration: 3000 });
    }

    // 7) Clean up session token
    sessionStorage.removeItem(`interview_token_${videoId}`);

    // 8) Navigate to detail page (recruiter) or show thank-you screen (candidate)
    if (isGuest || isCandidateLink || user?.role === 'candidate') {
      setInterviewEnded(true);
    } else if (actuallyCompleted) {
      setTimeout(() => navigate(`/video-detail/${videoId}`), 2000);
    }
    } finally {
      // Always unlock the end button so it can be clicked again if something failed
      clearTimeout(safetyTimer);
      endingRef.current = false;
    }
  };

  // Show consent dialog only when candidate clicks "Start Interview" (handled in handleStart)
  useEffect(() => {
    if (false) {
      setShowConsentDialog(true);
    }
  }, [interview, isGuest, user, isActive, showConsentDialog]);

  // Candidate finished / already completed — show thank-you screen (never expose login)
  if (interviewEnded && (isGuest || isCandidateLink || user?.role === 'candidate')) {
    const status = (interview?.status || '').toLowerCase();
    return (
      <Box sx={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100dvh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
      }}>
        <Paper sx={{
          p: 5, textAlign: 'center', maxWidth: 480, mx: 2,
          borderRadius: 3, boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
        }}>
          <Check sx={{ fontSize: 64, color: status === 'completed' ? '#22c55e' : '#f59e0b', mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            {status === 'completed' ? 'Interview Completed' :
             status === 'cancelled' ? 'Interview Cancelled' :
             status === 'no_show' ? 'Interview Session Expired' :
             'Interview Ended'}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {status === 'completed'
              ? 'Thank you for completing your interview. Our team will review your responses and get back to you soon.'
              : status === 'cancelled'
              ? 'This interview has been cancelled. Please contact the recruiter for more information.'
              : status === 'no_show'
              ? 'The interview session has expired. Please contact the recruiter if you need to reschedule.'
              : 'The interview has ended. You may now close this window.'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            You can safely close this browser tab.
          </Typography>
        </Paper>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100dvh', background: '#0f172a'
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
        height: isUserCandidate ? '100dvh' : 'calc(100dvh - 64px)',
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
            {!isUserCandidate && (
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
                {isUserCandidate ? 'Video Interview' : (interview?.job_title || 'Video Interview')}
              </Typography>
              <Typography sx={{
                color: '#64748b',
                fontSize: { xs: '11px', md: '13px' },
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {isUserCandidate ? `Interview #${videoId}` : `${interview?.candidate_name || 'Candidate'} • Interview #${videoId}`}
              </Typography>
            </Box>
          </Box>

          {/* Mode Toggle + Timer */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {!isUserCandidate && !isCompleted && (
              <Chip
                icon={interviewMode === 'video' ? <VideoCall sx={{ fontSize: 16, color: '#fff' }} /> : <Description sx={{ fontSize: 16, color: '#fff' }} />}
                label={interviewMode === 'video' ? 'Video Mode' : 'Classic Mode'}
                size="small"
                sx={{ fontWeight: 600, fontSize: '11px', background: interviewMode === 'video' ? '#020291' : '#7c3aed', color: '#fff', '& .MuiChip-icon': { color: '#fff' } }}
              />
            )}
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
            {interviewMode !== 'classic' && (
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
            )}
          </Box>
        </Box>

        {/* Main Content Area - Split Left/Right */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* LEFT SIDE - Questions Panel (recruiter only) */}
          {!isUserCandidate && <Box sx={{
            width: { xs: '100%', md: interviewMode === 'classic' ? '100%' : '40%' },
            maxHeight: { xs: isActive && interviewMode !== 'classic' ? '30vh' : '40vh', md: 'none' },
            backgroundColor: 'white',
            borderRight: { md: '1px solid #e2e8f0' },
            borderBottom: { xs: '1px solid #e2e8f0', md: 'none' },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>

            {/* Rating Progress Header */}
            {questions.length > 0 && (
              <Box sx={{
                px: '20px', py: '12px',
                background: 'white',
                borderBottom: '1px solid #e2e8f0',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                    Rated: {Object.keys(questionRatings).length} / {questions.length} questions
                  </Typography>
                  {Object.keys(questionRatings).length > 0 && (
                    <Chip
                      label={`Avg: ${(Object.values(questionRatings).reduce((a, b) => a + b, 0) / Object.values(questionRatings).length).toFixed(1)}/10`}
                      size="small"
                      sx={{ fontSize: '11px', fontWeight: 700, background: '#ede9fe', color: '#7c3aed' }}
                    />
                  )}
                </Box>
                {Object.keys(questionRatings).length > 0 && Object.keys(questionRatings).length < questions.length && (
                  <Typography sx={{ fontSize: '11px', color: '#64748b', mt: '4px' }}>
                    Only rated questions will be considered in final scoring
                  </Typography>
                )}
              </Box>
            )}

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
                questions.map((q: any, idx: number) => {
                  const rating = questionRatings[q.id] || 0;
                  const isExpanded = expandedAnswers[q.id] || false;
                  return (
                  <Box
                    key={q.id || idx}
                    sx={{
                      background: 'white',
                      borderRadius: '10px',
                      border: rating ? '1px solid #c4b5fd' : '1px solid #e2e8f0',
                      marginBottom: '12px',
                      overflow: 'hidden',
                      transition: 'border-color 0.2s',
                    }}
                  >
                    {/* Question Header */}
                    <Box sx={{ p: '14px 16px', pb: '10px' }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                        <Box sx={{
                          width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                          background: rating ? '#7c3aed' : '#ede9fe',
                          color: rating ? 'white' : '#7c3aed',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '13px', mt: '2px'
                        }}>
                          {rating ? '✓' : idx + 1}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ color: '#1e293b', fontSize: '14px', lineHeight: 1.5, fontWeight: 500 }}>
                            {q.question_text}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                            {q.difficulty && (
                              <Chip label={q.difficulty.toUpperCase()} size="small" sx={{
                                fontSize: '10px', fontWeight: 700, height: '20px', borderRadius: '4px',
                                ...(q.difficulty.toLowerCase() === 'easy' || q.difficulty.toLowerCase() === 'basic' ? {
                                  background: '#dcfce7', color: '#166534'
                                } : q.difficulty.toLowerCase() === 'medium' || q.difficulty.toLowerCase() === 'intermediate' ? {
                                  background: '#fef3c7', color: '#92400e'
                                } : { background: '#fee2e2', color: '#991b1b' })
                              }} />
                            )}
                            {q.skill_focus && (
                              <Chip label={q.skill_focus} size="small" sx={{
                                fontSize: '10px', fontWeight: 600, height: '20px', borderRadius: '4px',
                                background: '#f3e8ff', color: '#7c3aed'
                              }} />
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </Box>

                    {/* Rating Row */}
                    <Box sx={{
                      px: '16px', py: '10px',
                      background: '#f8fafc',
                      borderTop: '1px solid #f1f5f9',
                      display: 'flex', alignItems: 'center', gap: 0.5
                    }}>
                      <Typography sx={{ fontSize: '11px', fontWeight: 600, color: '#64748b', mr: 0.5 }}>
                        Score:
                      </Typography>
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <Box
                          key={n}
                          onClick={() => {
                            if (savingRating !== q.id) {
                              if (rating === n) {
                                // Click same score = deselect
                                handleUnrateQuestion(q.id);
                              } else {
                                handleRateQuestion(q.id, n);
                              }
                            }
                          }}
                          sx={{
                            width: '26px', height: '26px', borderRadius: '6px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                            transition: 'all 0.15s',
                            ...(rating === n ? {
                              background: n >= 7 ? '#16a34a' : n >= 4 ? '#d97706' : '#dc2626',
                              color: 'white',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                            } : rating && n <= rating ? {
                              background: n >= 7 ? '#dcfce7' : n >= 4 ? '#fef3c7' : '#fee2e2',
                              color: n >= 7 ? '#166534' : n >= 4 ? '#92400e' : '#991b1b',
                            } : {
                              background: 'white',
                              color: '#94a3b8',
                              border: '1px solid #e2e8f0',
                              '&:hover': { borderColor: '#7c3aed', color: '#7c3aed', background: '#faf5ff' }
                            })
                          }}
                        >
                          {n}
                        </Box>
                      ))}
                      {savingRating === q.id && <CircularProgress size={14} sx={{ ml: 0.5, color: '#7c3aed' }} />}
                    </Box>

                    {/* Show Answer Toggle */}
                    {(q.suggested_answer || q.sample_answer) && (
                      <>
                        <Box
                          onClick={() => setExpandedAnswers(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                          sx={{
                            px: '16px', py: '8px',
                            borderTop: '1px solid #f1f5f9',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            cursor: 'pointer',
                            '&:hover': { background: '#f8fafc' }
                          }}
                        >
                          <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#7c3aed' }}>
                            {isExpanded ? 'Hide Expected Answer' : 'Show Expected Answer'}
                          </Typography>
                          {isExpanded ? <ExpandLess sx={{ fontSize: 18, color: '#7c3aed' }} /> : <ExpandMore sx={{ fontSize: 18, color: '#7c3aed' }} />}
                        </Box>
                        <Collapse in={isExpanded}>
                          <Box sx={{
                            px: '16px', py: '12px',
                            background: '#fefce8',
                            borderTop: '1px solid #fef08a',
                          }}>
                            <Typography sx={{ fontSize: '13px', color: '#713f12', lineHeight: 1.6 }}>
                              {q.suggested_answer || q.sample_answer}
                            </Typography>
                          </Box>
                        </Collapse>
                      </>
                    )}
                  </Box>
                  );
                })
              ) : (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <Videocam sx={{ fontSize: 48, color: '#cbd5e1', mb: 2 }} />
                  <Typography sx={{ color: '#64748b', fontSize: '14px' }}>
                    Questions will be loaded when interview starts
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Live captions now show directly on video panel — no need for separate transcript panel here */}

            {/* Classic Mode: Transcript (collapsible) */}
            {interviewMode === 'classic' && !isUserCandidate && (
              <Box sx={{ p: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <Typography
                  onClick={() => setShowTranscriptInput(prev => !prev)}
                  sx={{ fontSize: '12px', fontWeight: 600, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  {showTranscriptInput ? '▾' : '▸'} Paste Transcript (Optional)
                </Typography>
                {showTranscriptInput && (
                  <TextField
                    multiline rows={3} fullWidth
                    placeholder="Paste interview transcript here for AI scoring..."
                    value={classicTranscript}
                    onChange={e => setClassicTranscript(e.target.value)}
                    sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: '12px' } }}
                  />
                )}
              </Box>
            )}

          </Box>}

          {/* RIGHT SIDE - Video Panel / Mode Selection */}
          <Box sx={{
            display: interviewMode === 'classic' && isActive ? 'none' : 'flex',
            width: { xs: '100%', md: '60%' },
            flex: 1,
            minHeight: 0,
            height: '100%',
            background: 'white',
            position: 'relative',
            flexDirection: 'column',
            p: { xs: 0, md: 1.5 },
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
                borderRadius: { xs: 0, md: '12px' },
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'none',
                border: { xs: 'none', md: '1px solid #e2e8f0' }
              }}>
                {isCompleted ? (
                  // Completed interview — always show this screen regardless of
                  // any other state (prevents the "Join Video Interview" UI or
                  // a stale LiveKit room from appearing after completion, even
                  // if the initial redirect races or the page is reloaded).
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
                ) : isActive ? (
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
                        key={audioOnlyMode ? 'audio-only' : 'full-av'}
                        video={!audioOnlyMode}
                        audio={true}
                        token={lkToken}
                        serverUrl={import.meta.env.VITE_LIVEKIT_URL || "wss://ai-interview-platform-a0kpbtob.livekit.cloud"}
                        connect={true}
                        options={{
                          adaptiveStream: true,
                          dynacast: true,
                          reconnectPolicy: {
                            nextRetryDelayInMs: (context: { retryCount: number }) => {
                              // Retry up to 5 times with increasing delay (1s, 2s, 4s, 8s, 10s)
                              if (context.retryCount > 5) return null; // give up
                              return Math.min(1000 * Math.pow(2, context.retryCount), 10000);
                            },
                          },
                          videoCaptureDefaults: {
                            resolution: VideoPresets.h360.resolution,
                            facingMode: 'user',
                          },
                          publishDefaults: {
                            videoSimulcastLayers: [VideoPresets.h180],
                            videoCodec: 'vp8',
                            dtx: true,
                            red: true,
                            screenShareEncoding: { maxBitrate: 500000, maxFramerate: 15 },
                          },
                        } as RoomOptions}
                        onConnected={() => {
                          setCallJoined(true);
                          setParticipantCount(1);
                          maxParticipantsRef.current = Math.max(maxParticipantsRef.current, 1);
                          reconnectAttemptsRef.current = 0;
                          // Stable id + low duration so reconnect loops don't stack 4+ toasts.
                          toast.success('Joined interview', { id: 'livekit-joined', duration: 2500 });
                        }}
                        onDisconnected={async (reason?: DisconnectReason) => {
                          console.warn('LiveKit disconnected, reason:', reason);
                          setCallJoined(false);

                          // Don't reconnect if user intentionally left or interview ended
                          if (
                            reason === DisconnectReason.CLIENT_INITIATED ||
                            endingRef.current
                          ) {
                            return;
                          }

                          // Candidate disconnected (recruiter ended the call)
                          if (isUserCandidate) {
                            // If handleEnd is already running, let it finish — don't duplicate work
                            if (endingRef.current) {
                              console.log('[onDisconnected] Candidate: handleEnd already running, skipping');
                              return;
                            }
                            endingRef.current = true;
                            setIsActive(false);
                            setCallJoined(false);
                            setIsRecording(false);
                            toast.success('Interview completed!');

                            // Candidate stays on page — safe to await upload
                            (async () => {
                              try {
                                const blob = await stopRecorderAndGetBlob();
                                if (blob) {
                                  const upload = isGuest
                                    ? videoInterviewService.guestUploadRecording
                                    : videoInterviewService.uploadRecording;
                                  await upload(Number(videoId), blob);
                                  console.log('✅ Candidate recording uploaded');
                                }
                              } catch (err) {
                                console.error('Recording upload failed:', err);
                              }

                              // End interview after upload (use correct endpoint based on auth)
                              try {
                                if (isGuest) {
                                  await videoInterviewService.guestEndInterview(Number(videoId));
                                } else {
                                  await videoInterviewService.endInterview(Number(videoId), {
                                    max_participants: maxParticipantsRef.current
                                  });
                                }
                              } catch {}

                              // Refresh interview data
                              const fetchFn = isGuest
                                ? videoInterviewService.guestGetInterview
                                : videoInterviewService.getInterview;
                              try {
                                const data = await fetchFn(Number(videoId));
                                if (data) setInterview(data);
                              } catch {}
                            })().finally(() => {
                              endingRef.current = false;
                            });
                            return;
                          }

                          // LiveKit already tried its built-in reconnect before firing onDisconnected.
                          // Instead of destroying the component (setLkToken=null), let user retry manually.
                          // This avoids the connect-disconnect loop on mobile/slow networks.
                          reconnectAttemptsRef.current += 1;
                          const attempt = reconnectAttemptsRef.current;
                          if (attempt <= MAX_RECONNECT_ATTEMPTS) {
                            toast.error(`Connection lost. Retrying (${attempt}/${MAX_RECONNECT_ATTEMPTS})...`, { id: 'reconnect-toast' });
                            // Wait briefly, then re-fetch token (gives network time to stabilize)
                            await new Promise(r => setTimeout(r, attempt * 2000)); // 2s, 4s, 6s
                            if (!endingRef.current) {
                              setLkToken(null); // triggers token re-fetch and LiveKitRoom re-mount
                            }
                          } else {
                            toast.error('Connection lost. Click "Rejoin Interview" to try again.', { id: 'reconnect-toast', duration: 8000 });
                            setIsActive(false);
                            setCallJoined(false);
                            setHasExited(true); // show rejoin button instead of being stuck
                            cleanupVideoCall();
                          }
                        }}
                        onError={(error: Error) => {
                          console.error('LiveKit error:', error);

                          // PERMISSION DENIED is a FATAL error — don't auto-retry.
                          // Otherwise LiveKit re-requests camera every few seconds,
                          // each denial fires onError → new toast → infinite loop.
                          // Mark endingRef so onDisconnected's reconnect branch is skipped.
                          const msg = error.message || '';
                          const isPermissionErr = msg.includes('Permission denied')
                            || msg.includes('NotAllowedError')
                            || error.name === 'NotAllowedError';
                          if (isPermissionErr) {
                            reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS + 1; // suppress retry
                            // Auto-fallback to audio-only so the user can still
                            // continue the interview even when the camera is
                            // held by another tab/app. LiveKitRoom is re-mounted
                            // (via key prop) with video={false}.
                            if (!audioOnlyMode) {
                              setAudioOnlyMode(true);
                              toast('Camera busy — joined in audio-only mode. Close other apps using camera and rejoin to enable video.', {
                                id: 'livekit-permission-denied',
                                duration: 8000,
                                icon: '🎧',
                              });
                            } else {
                              toast.error(
                                'Mic permission denied. Grant mic access in browser settings, then click Rejoin.',
                                { id: 'livekit-permission-denied', duration: 10000 }
                              );
                            }
                            return;
                          }

                          // Avoid duplicate toasts for device errors (already handled by onMediaDeviceFailure)
                          if (!msg.includes('video source') && !msg.includes('device')) {
                            const isSignalErr = msg.includes('signal connection')
                              || msg.includes('Abort handler')
                              || msg.includes('could not establish');
                            if (isSignalErr) {
                              toast.error('Connection unstable. Retrying...', {
                                id: 'livekit-signal-error',
                                duration: 3000,
                              });
                            } else {
                              toast.error(`Video error: ${msg || 'Connection issue detected'}`, {
                                id: 'livekit-generic-error',
                                duration: 4000,
                              });
                            }
                          }
                        }}
                        onMediaDeviceFailure={(failure: any) => {
                          console.error('Media device failure:', failure);
                          const failureStr = String(failure || '');
                          if (failureStr.includes('Permission') || failureStr.includes('NotAllowed')) {
                            reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS + 1;
                            if (!audioOnlyMode) {
                              setAudioOnlyMode(true);
                              toast('Camera busy — joined in audio-only mode. You can still hear and see the other participant.', {
                                id: 'livekit-permission-denied',
                                duration: 8000,
                                icon: '🎧',
                              });
                            } else {
                              toast.error(
                                'Mic permission denied. Grant mic access in browser settings, then rejoin.',
                                { id: 'livekit-permission-denied', duration: 10000 }
                              );
                            }
                            return;
                          }
                          toast.error('Camera or microphone failed. Close other apps using camera (Teams, Zoom) and refresh.', { id: 'media-device-error', duration: 6000 });
                        }}
                        style={{ height: '100%', width: '100%', background: '#0a0a0b' }}
                      >
                        <InterviewRecorder
                          shouldRecord={callJoined}
                          mediaRecorderRef={mediaRecorderRef}
                          recordedChunksRef={recordedChunksRef}
                          onRecordingChange={setIsRecording}
                          onRemoteParticipantJoined={() => {
                            maxParticipantsRef.current = Math.max(maxParticipantsRef.current, 2);
                            console.log('👥 Remote participant joined — maxParticipants updated to 2');
                            // Stop grace period timer — candidate has joined, no need to check for no_show
                            if (graceCheckIntervalRef.current) {
                              clearInterval(graceCheckIntervalRef.current);
                              graceCheckIntervalRef.current = null;
                              setGracePeriodTimer(null);
                              console.log('⏱️ Grace period timer cleared — candidate joined');
                            }
                          }}
                        />
                        {/* Both sides send their own local mic for high-quality transcription */}
                        <TranscriptionCapture
                          interviewId={videoId || ''}
                          userRole={isUserCandidate ? 'candidate' : 'recruiter'}
                          enabled={callJoined}
                          onTranscriptUpdate={setTranscriptEntries}
                          onConnectionChange={setTranscriptConnected}
                        />
                        {isUserCandidate && <FaceDetectionOverlay enabled={callJoined} videoInterviewId={videoId ? parseInt(videoId) : undefined} />}
                        <VideoTilesGrid onEndCall={handleEnd} onExitCall={handleExit} captionEntries={transcriptEntries} isCandidate={isUserCandidate} />
                        <RoomAudioRenderer />
                      </LiveKitRoom>
                    ) : (
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <CircularProgress sx={{ color: '#020291' }} />
                        <Typography sx={{ color: '#64748b' }}>Establishing secure connection...</Typography>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Box sx={{
                    textAlign: 'center', p: { xs: 2, sm: 4 }, pb: { xs: 4, sm: 4 },
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'center' },
                    width: '100%', height: '100%',
                    overflowY: 'auto',
                    background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 50%, #e0e7ff 100%)',
                  }}>
                    {/* Mode Selection for Recruiter (before joining) */}
                    {!isUserCandidate && !hasExited && (
                      <>
                        <Typography sx={{ color: '#1e293b', fontSize: '20px', fontWeight: 700, mb: 1 }}>
                          Choose Interview Mode
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: '13px', mb: { xs: '10px', md: 3 }, maxWidth: 400 }}>
                          Select how you want to conduct this interview
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, mb: { xs: '16px', md: 4 }, width: '100%', maxWidth: 420, px: 2 }}>
                          {/* Video Mode Card */}
                          <Box
                            onClick={() => setInterviewMode('video')}
                            sx={{
                              flex: 1, cursor: 'pointer', borderRadius: '14px', p: 2.5, textAlign: 'center',
                              border: interviewMode === 'video' ? '2px solid #020291' : '2px solid #e2e8f0',
                              background: interviewMode === 'video' ? '#eef2ff' : '#fff',
                              transition: 'all 0.2s',
                              '&:hover': { borderColor: '#020291', background: '#f8faff' },
                            }}
                          >
                            <Box sx={{
                              width: 48, height: 48, borderRadius: '12px', margin: '0 auto 10px',
                              background: interviewMode === 'video' ? '#020291' : '#f1f5f9',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <VideoCall sx={{ color: interviewMode === 'video' ? '#fff' : '#64748b', fontSize: 26 }} />
                            </Box>
                            <Typography sx={{ fontWeight: 700, fontSize: '14px', color: interviewMode === 'video' ? '#020291' : '#1e293b' }}>
                              Video Interview
                            </Typography>
                            <Typography sx={{ fontSize: '11px', color: '#94a3b8', mt: 0.5, lineHeight: 1.4 }}>
                              Live video call with candidate + rating
                            </Typography>
                          </Box>
                          {/* Classic Mode Card */}
                          <Box
                            onClick={() => setInterviewMode('classic')}
                            sx={{
                              flex: 1, cursor: 'pointer', borderRadius: '14px', p: 2.5, textAlign: 'center',
                              border: interviewMode === 'classic' ? '2px solid #7c3aed' : '2px solid #e2e8f0',
                              background: interviewMode === 'classic' ? '#f5f3ff' : '#fff',
                              transition: 'all 0.2s',
                              '&:hover': { borderColor: '#7c3aed', background: '#faf8ff' },
                            }}
                          >
                            <Box sx={{
                              width: 48, height: 48, borderRadius: '12px', margin: '0 auto 10px',
                              background: interviewMode === 'classic' ? '#7c3aed' : '#f1f5f9',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Description sx={{ color: interviewMode === 'classic' ? '#fff' : '#64748b', fontSize: 26 }} />
                            </Box>
                            <Typography sx={{ fontWeight: 700, fontSize: '14px', color: interviewMode === 'classic' ? '#7c3aed' : '#1e293b' }}>
                              Classic Mode
                            </Typography>
                            <Typography sx={{ fontSize: '11px', color: '#94a3b8', mt: 0.5, lineHeight: 1.4 }}>
                              No video — rate questions + upload transcript
                            </Typography>
                          </Box>
                        </Box>
                      </>
                    )}

                    {/* Rejoin / Candidate view */}
                    {(isUserCandidate || hasExited) && (
                      <>
                        <Box sx={{
                          width: 100, height: 100, borderRadius: '50%',
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          mb: 3, boxShadow: '0 12px 32px rgba(139, 92, 246, 0.4)'
                        }}>
                          <Videocam sx={{ color: 'white', fontSize: 50 }} />
                        </Box>
                        <Typography sx={{ color: '#1e293b', fontSize: '24px', fontWeight: 700, mb: 1 }}>
                          {hasExited ? 'Rejoin Interview' : 'Interview Ready'}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: '14px', mb: 4, maxWidth: 400 }}>
                          {hasExited ? 'You left the call. Click below to rejoin.' : 'Your interview is ready. Click below to begin.'}
                        </Typography>
                      </>
                    )}

                    <Button
                      variant="contained"
                      size="large"
                      startIcon={interviewMode === 'classic' && !isUserCandidate && !hasExited ? <Description /> : <Videocam />}
                      onClick={interviewMode === 'classic' && !isUserCandidate && !hasExited ? () => { setIsActive(true); toast.success('Classic mode started — Rate questions and submit when done.', { duration: 3000 }); } : handleStart}
                      sx={{
                        background: interviewMode === 'classic' && !isUserCandidate && !hasExited
                          ? 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)'
                          : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                        padding: { xs: '5px 10px', md: '14px 36px' },
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
                      {hasExited ? 'Rejoin Interview' : isUserCandidate ? 'Start Interview' : interviewMode === 'classic' ? 'Start Classic Interview' : 'Join Video Interview'}
                    </Button>
                  </Box>
                )}
              </Paper>
            </Box>

            {/* End Meeting button removed — already inside VideoTilesGrid control bar */}
          </Box>
        </Box>

        {/* Classic Mode: Fixed Submit Bar at bottom - outside scroll area */}
        {interviewMode === 'classic' && !isUserCandidate && (
          <Box sx={{
            p: '12px 20px',
            borderTop: '2px solid #e2e8f0',
            background: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
            flexShrink: 0,
          }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                {Object.keys(questionRatings).length}/{questions.length} Questions Rated
              </Typography>
              <Typography sx={{ fontSize: '12px', color: '#64748b' }}>
                {Object.keys(questionRatings).length === 0 ? 'Rate at least one question to submit' : 'Ready to submit & generate report'}
              </Typography>
            </Box>
            <Button
              onClick={handleClassicSubmit}
              disabled={submittingClassic || Object.keys(questionRatings).length === 0}
              variant="contained"
              sx={{
                background: 'linear-gradient(135deg, #020291 0%, #010178 100%)',
                color: '#fff',
                borderRadius: '10px',
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '14px',
                px: 4,
                py: 1.5,
                minWidth: 220,
                boxShadow: '0 4px 12px rgba(2,2,145,0.3)',
                '&:hover': { background: 'linear-gradient(135deg, #010178 0%, #000066 100%)', boxShadow: '0 6px 16px rgba(2,2,145,0.4)' },
                '&:disabled': { opacity: 0.5, color: '#fff', background: '#020291' }
              }}
            >
              {submittingClassic ? (
                <><CircularProgress size={18} sx={{ mr: 1, color: '#fff' }} /> Generating Report...</>
              ) : (
                'Submit & Complete Interview'
              )}
            </Button>
          </Box>
        )}

        {/* Recording upload happens in background — no blocking overlay */}

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

  return isUserCandidate ? content : <Navigation>{content}</Navigation>;
};

export default VideoInterviewRoom;
