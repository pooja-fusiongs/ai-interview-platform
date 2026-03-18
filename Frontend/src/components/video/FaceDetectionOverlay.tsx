import React, { useRef, useEffect, useState } from 'react';
import { Box, Chip } from '@mui/material';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useFaceDetection } from '../../hooks/useFaceDetection';
import { useLipDetection } from '../../hooks/useLipDetection';
import { useVoiceConsistency } from '../../hooks/useVoiceConsistency';
import fraudDetectionService from '../../services/fraudDetectionService';

interface FaceDetectionOverlayProps {
  enabled: boolean;
  videoInterviewId?: number;
}

const FaceDetectionOverlay: React.FC<FaceDetectionOverlayProps> = ({ enabled, videoInterviewId }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const lastFaceSentRef = useRef(0);
  const lastLipSentRef = useRef(0);
  const lastVoiceSentRef = useRef(0);
  const faceSendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lipSendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get local camera + mic tracks from LiveKit
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.Microphone, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const localCameraTrack = tracks.find(
    (t) => t.participant?.isLocal && t.source === Track.Source.Camera
  );
  const localMicTrack = tracks.find(
    (t) => t.participant?.isLocal && t.source === Track.Source.Microphone
  );

  // Attach camera track to hidden video element
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !localCameraTrack?.publication?.track?.mediaStreamTrack) {
      setVideoReady(false);
      return;
    }

    const mediaStreamTrack = localCameraTrack.publication.track.mediaStreamTrack;
    videoEl.srcObject = new MediaStream([mediaStreamTrack]);
    videoEl.play().catch(() => {});
    setVideoReady(true);

    return () => {
      videoEl.srcObject = null;
      setVideoReady(false);
    };
  }, [localCameraTrack?.publication?.track?.mediaStreamTrack]);

  // Get mic stream for audio analysis
  useEffect(() => {
    if (!localMicTrack?.publication?.track || !enabled) {
      setMicStream(null);
      return;
    }

    let ownStream: MediaStream | null = null;
    let cancelled = false;

    const lkTrack = localMicTrack.publication.track.mediaStreamTrack;

    const tryGetMic = async () => {
      // Method 1: getUserMedia without deviceId constraint (gets default mic)
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        ownStream = s;
        const track = s.getAudioTracks()[0];
        console.log(`[FraudDetection] Mic stream (getUserMedia): ${track?.label}, enabled=${track?.enabled}, muted=${track?.muted}`);
        setMicStream(s);
        return;
      } catch (e) {
        console.warn(`[FraudDetection] getUserMedia failed: ${e}`);
      }

      // Method 2: Clone LiveKit's track (clone creates independent copy)
      if (cancelled) return;
      try {
        const cloned = lkTrack.clone();
        const s = new MediaStream([cloned]);
        console.log(`[FraudDetection] Mic stream (cloned LiveKit): ${cloned.label}, enabled=${cloned.enabled}, muted=${cloned.muted}, readyState=${cloned.readyState}`);
        setMicStream(s);
        return;
      } catch (e) {
        console.warn(`[FraudDetection] Clone failed: ${e}`);
      }

      // Method 3: Use LiveKit track directly (last resort)
      if (cancelled) return;
      const s = new MediaStream([lkTrack]);
      console.log(`[FraudDetection] Mic stream (direct LiveKit): ${lkTrack.label}, enabled=${lkTrack.enabled}, readyState=${lkTrack.readyState}`);
      setMicStream(s);
    };

    tryGetMic();

    return () => {
      cancelled = true;
      if (ownStream) { ownStream.getTracks().forEach(t => t.stop()); }
      setMicStream(null);
    };
  }, [localMicTrack?.publication?.track, enabled]);

  // --- Face Detection (every 750ms) ---
  const { faceCount, status: faceStatus, alerts: faceAlerts, getLatestStats: getFaceStats } = useFaceDetection({
    videoElement: videoReady ? videoRef.current : null,
    enabled: enabled && videoReady,
    intervalMs: 750,
  });

  // --- Lip Detection (every 1500ms — heavier model, stagger with face detection) ---
  const { alerts: lipAlerts, status: lipStatus, getLatestStats: getLipStats } = useLipDetection({
    videoElement: videoReady ? videoRef.current : null,
    audioStream: micStream,
    enabled: enabled && videoReady,
    intervalMs: 1500,
  });

  // --- Voice Consistency (every 1500ms — audio-only, lightweight) ---
  const { alerts: voiceAlerts, status: voiceStatus, getLatestStats: getVoiceStats } = useVoiceConsistency({
    audioStream: micStream,
    enabled: enabled && !!micStream,
    intervalMs: 1500,
  });

  // Send face detection stats every 30s
  useEffect(() => {
    if (!videoInterviewId || !enabled) return;

    const sendFaceStats = async () => {
      const s = getFaceStats();
      if (s.totalDetections === 0) return;
      if (s.totalDetections === lastFaceSentRef.current) return;
      lastFaceSentRef.current = s.totalDetections;

      try {
        console.log(`[FraudDetection] Sending face stats: detections=${s.totalDetections}, noFace=${s.noFaceCount}, multi=${s.multipleFaceCount}`);
        await fraudDetectionService.submitFaceEvents(videoInterviewId, {
          total_detections: s.totalDetections,
          no_face_count: s.noFaceCount,
          multiple_face_count: s.multipleFaceCount,
          single_face_count: s.singleFaceCount,
          no_face_seconds: s.noFaceSeconds,
          multiple_face_seconds: s.multipleFaceSeconds,
          max_faces_detected: s.maxFacesDetected,
          detection_interval_ms: 750,
        });
      } catch (err) {
        console.error('[FraudDetection] Face event failed:', err);
      }
    };

    // Send face stats first, then lip and voice follow with staggered delays
    sendFaceStats(); // Send immediately to create the record first
    faceSendIntervalRef.current = setInterval(sendFaceStats, 30000);
    return () => {
      if (faceSendIntervalRef.current) clearInterval(faceSendIntervalRef.current);
      sendFaceStats();
    };
  }, [videoInterviewId, enabled, getFaceStats]);

  // Send lip sync stats every 30s
  useEffect(() => {
    if (!videoInterviewId || !enabled) return;

    const sendLipStats = async () => {
      const s = getLipStats();
      if (s.totalFrames === 0) return;
      if (s.totalFrames === lastLipSentRef.current) return;
      lastLipSentRef.current = s.totalFrames;

      try {
        console.log(`[FraudDetection] Sending lip stats: frames=${s.totalFrames}, noFace=${s.noFaceFrames}, mismatch=${s.lipStillWithAudio}`);
        await fraudDetectionService.submitLipEvents(videoInterviewId, {
          total_frames: s.totalFrames,
          lip_moving_with_audio: s.lipMovingWithAudio,
          lip_still_with_audio: s.lipStillWithAudio,
          lip_moving_no_audio: s.lipMovingNoAudio,
          lip_still_no_audio: s.lipStillNoAudio,
          no_face_frames: s.noFaceFrames,
          max_mouth_openness: s.maxMouthOpenness,
          avg_mouth_openness: s.avgMouthOpenness,
          mismatch_seconds: s.mismatchSeconds,
          detection_interval_ms: 750,
        });
      } catch (err) {
        console.error('[FraudDetection] Lip event failed:', err);
      }
    };

    // Delay lip stats by 5s so face record is created first
    const lipDelay = setTimeout(() => {
      sendLipStats();
      lipSendIntervalRef.current = setInterval(sendLipStats, 30000);
    }, 5000);
    return () => {
      clearTimeout(lipDelay);
      if (lipSendIntervalRef.current) clearInterval(lipSendIntervalRef.current);
      sendLipStats();
    };
  }, [videoInterviewId, enabled, getLipStats]);

  // Send voice consistency stats every 30s
  useEffect(() => {
    if (!videoInterviewId || !enabled) return;

    let voiceSendInterval: ReturnType<typeof setInterval> | null = null;

    const sendVoiceStats = async () => {
      const s = getVoiceStats();
      if (s.totalSegments === 0) return;
      if (s.totalSegments === lastVoiceSentRef.current) return;
      lastVoiceSentRef.current = s.totalSegments;

      try {
        console.log(`[FraudDetection] Sending voice stats: segments=${s.totalSegments}, silent=${s.silentSegments}, shifts=${s.pitchShiftCount}, pitch=${s.avgPitch.toFixed(1)}Hz`);
        await fraudDetectionService.submitVoiceEvents(videoInterviewId, {
          total_segments: s.totalSegments,
          consistent_segments: s.consistentSegments,
          inconsistent_segments: s.inconsistentSegments,
          silent_segments: s.silentSegments,
          avg_pitch: s.avgPitch,
          pitch_shift_count: s.pitchShiftCount,
          max_pitch_deviation: s.maxPitchDeviation,
          inconsistent_seconds: s.inconsistentSeconds,
          detection_interval_ms: 1500,
        });
      } catch (err) {
        console.error('[FraudDetection] Voice event failed:', err);
      }
    };

    // Delay voice stats by 10s so face record is created first
    const voiceDelay = setTimeout(() => {
      sendVoiceStats();
      voiceSendInterval = setInterval(sendVoiceStats, 30000);
    }, 10000);
    return () => {
      clearTimeout(voiceDelay);
      if (voiceSendInterval) clearInterval(voiceSendInterval);
      sendVoiceStats();
    };
  }, [videoInterviewId, enabled, getVoiceStats]);

  // --- UI State ---
  const [showNormal, setShowNormal] = useState(true);
  useEffect(() => {
    if (faceAlerts.length === 0 && lipAlerts.length === 0 && faceStatus === 'running') {
      const timer = setTimeout(() => setShowNormal(false), 5000);
      return () => clearTimeout(timer);
    }
    setShowNormal(true);
  }, [faceAlerts.length, lipAlerts.length, faceStatus, faceCount]);

  // Face detection chip
  const hasNoFace = faceAlerts.some((a) => a.type === 'no_face');
  const hasMultiple = faceAlerts.some((a) => a.type === 'multiple_faces');

  let faceChipLabel = '';
  let faceChipColor = '';
  let faceChipBg = '';
  let faceDotColor = '';
  let faceVisible = false;

  if (faceStatus === 'loading') {
    faceChipLabel = 'Face detection loading...';
    faceChipColor = '#94a3b8';
    faceChipBg = 'rgba(0,0,0,0.5)';
    faceDotColor = '#94a3b8';
    faceVisible = true;
  } else if (faceStatus === 'running') {
    if (hasMultiple) {
      faceChipLabel = `${faceCount} faces detected`;
      faceChipColor = '#fca5a5';
      faceChipBg = 'rgba(220,38,38,0.85)';
      faceDotColor = '#ef4444';
      faceVisible = true;
    } else if (hasNoFace) {
      faceChipLabel = 'No face detected';
      faceChipColor = '#fde68a';
      faceChipBg = 'rgba(217,119,6,0.85)';
      faceDotColor = '#f59e0b';
      faceVisible = true;
    } else if (showNormal && faceCount === 1) {
      faceChipLabel = 'Face detected';
      faceChipColor = '#86efac';
      faceChipBg = 'rgba(0,0,0,0.5)';
      faceDotColor = '#22c55e';
      faceVisible = true;
    }
  }

  // Lip sync chip
  const hasLipMismatch = lipAlerts.some((a) => a.type === 'lip_not_moving');
  let lipChipVisible = false;
  let lipChipLabel = '';
  let lipChipColor = '';
  let lipChipBg = '';
  let lipDotColor = '';

  if (lipStatus === 'running' && hasLipMismatch) {
    lipChipLabel = 'Lip sync mismatch';
    lipChipColor = '#fdba74';
    lipChipBg = 'rgba(194,65,12,0.85)';
    lipDotColor = '#f97316';
    lipChipVisible = true;
  }

  // Voice consistency chip
  const hasVoiceChange = voiceAlerts.some((a) => a.type === 'voice_change');
  let voiceChipVisible = false;
  let voiceChipLabel = '';
  let voiceChipColor = '';
  let voiceChipBg = '';
  let voiceDotColor = '';

  if (voiceStatus === 'running' && hasVoiceChange) {
    voiceChipLabel = 'Voice pattern change';
    voiceChipColor = '#c4b5fd';
    voiceChipBg = 'rgba(109,40,217,0.85)';
    voiceDotColor = '#8b5cf6';
    voiceChipVisible = true;
  }

  const chipSx = (bg: string, color: string) => ({
    backgroundColor: bg,
    color: color,
    fontSize: '11px',
    fontWeight: 600,
    height: 28,
    backdropFilter: 'blur(8px)',
    border: 'none',
    '& .MuiChip-label': { px: 1 },
  });

  const dotSx = (color: string, pulse: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: color,
    ml: '8px',
    animation: pulse ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
    '@keyframes pulse-dot': {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.4 },
    },
  });

  return (
    <>
      {/* Hidden video element for detection */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        muted
        playsInline
        autoPlay
      />

      {/* Face detection chip */}
      {faceVisible && (
        <Box sx={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, transition: 'opacity 0.3s ease' }}>
          <Chip
            size="small"
            icon={<Box sx={dotSx(faceDotColor, hasMultiple || hasNoFace)} />}
            label={faceChipLabel}
            sx={chipSx(faceChipBg, faceChipColor)}
          />
        </Box>
      )}

      {/* Lip sync mismatch chip — shown below face chip */}
      {lipChipVisible && (
        <Box sx={{ position: 'fixed', top: faceVisible ? 114 : 80, right: 24, zIndex: 1000, transition: 'all 0.3s ease' }}>
          <Chip
            size="small"
            icon={<Box sx={dotSx(lipDotColor, true)} />}
            label={lipChipLabel}
            sx={chipSx(lipChipBg, lipChipColor)}
          />
        </Box>
      )}

      {/* Voice consistency chip — shown below lip chip */}
      {voiceChipVisible && (
        <Box sx={{ position: 'fixed', top: (faceVisible ? 114 : 80) + (lipChipVisible ? 34 : 0), right: 24, zIndex: 1000, transition: 'all 0.3s ease' }}>
          <Chip
            size="small"
            icon={<Box sx={dotSx(voiceDotColor, true)} />}
            label={voiceChipLabel}
            sx={chipSx(voiceChipBg, voiceChipColor)}
          />
        </Box>
      )}
    </>
  );
};

export default FaceDetectionOverlay;
