import React, { useRef, useEffect, useState } from 'react';
import { Box, Chip } from '@mui/material';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useDetection } from '../../hooks/useDetection';
import fraudDetectionService from '../../services/fraudDetectionService';

interface FaceDetectionOverlayProps {
  enabled: boolean;
  videoInterviewId?: number;
}

const FaceDetectionOverlay: React.FC<FaceDetectionOverlayProps> = ({ enabled, videoInterviewId }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  
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

  // Check if camera is actually enabled (not muted)
  const isCameraMuted = localCameraTrack?.publication?.isMuted ?? true;
  const cameraTrackEnabled = !isCameraMuted && !!localCameraTrack?.publication?.track?.mediaStreamTrack;

  // Attach camera track to hidden video element
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !cameraTrackEnabled || !localCameraTrack?.publication?.track?.mediaStreamTrack) {
      setVideoReady(false);
      if (videoEl) videoEl.srcObject = null;
      return;
    }

    const mediaStreamTrack = localCameraTrack.publication.track.mediaStreamTrack;
    videoEl.srcObject = new MediaStream([mediaStreamTrack]);

    const onCanPlay = () => {
      setVideoReady(true);
    };

    // Only mark ready once the video has enough data to process frames
    if (videoEl.readyState >= 2) {
      setVideoReady(true);
    } else {
      videoEl.addEventListener('canplay', onCanPlay, { once: true });
    }

    videoEl.play().catch((err) => {
      console.warn('[FaceDetectionOverlay] Video play failed:', err);
    });

    return () => {
      videoEl.removeEventListener('canplay', onCanPlay);
      videoEl.srcObject = null;
      setVideoReady(false);
    };
  }, [localCameraTrack?.publication?.track?.mediaStreamTrack, cameraTrackEnabled]);

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
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        ownStream = s;
        setMicStream(s);
        return;
      } catch (e) {
        console.warn(`[FraudDetection] getUserMedia failed: ${e}`);
      }

      if (cancelled) return;
      try {
        const cloned = lkTrack.clone();
        const s = new MediaStream([cloned]);
        setMicStream(s);
        return;
      } catch (e) {
        console.warn(`[FraudDetection] Clone failed: ${e}`);
      }

      if (cancelled) return;
      const s = new MediaStream([lkTrack]);
      setMicStream(s);
    };

    tryGetMic();

    return () => {
      cancelled = true;
      if (ownStream) { ownStream.getTracks().forEach(t => t.stop()); }
      setMicStream(null);
    };
  }, [localMicTrack?.publication?.track, enabled]);

  // --- Unified Detection Hook (approx 1fps) ---
  const { status, faceCount: rawFaceCount, movementScore, extractAndResetPayload } = useDetection({
    videoElement: videoReady ? videoRef.current : null,
    audioStream: micStream,
    enabled: enabled && videoReady,
    intervalMs: 1000,
  });

  // Stabilize face count — only switch to "no face" after 2 consecutive misses
  // For multi-face (>1), show immediately (important fraud signal)
  // Camera off → immediately show "no face"
  const noFaceStreakRef = React.useRef(0);
  const lastNonZeroRef = React.useRef(1);
  const [faceCount, setStableFaceCount] = React.useState(0);

  React.useEffect(() => {
    // Camera off → immediately "no face"
    if (!cameraTrackEnabled) {
      noFaceStreakRef.current = 99;
      setStableFaceCount(0);
      return;
    }

    if (rawFaceCount === 0) {
      noFaceStreakRef.current += 1;
      if (noFaceStreakRef.current >= 2) {
        setStableFaceCount(0);
      }
      // else keep showing last known face count (debounce flickering)
    } else {
      noFaceStreakRef.current = 0;
      lastNonZeroRef.current = rawFaceCount;
      setStableFaceCount(rawFaceCount);
    }
  }, [rawFaceCount, cameraTrackEnabled]);

  // --- Send Unified Stats Every 5 Seconds ---
  useEffect(() => {
    if (!videoInterviewId || !enabled || status !== 'running') return;

    const interval = setInterval(async () => {
      const payload = extractAndResetPayload(videoInterviewId);
      
      // Prevent sending empty payloads if detection just started
      if (payload.total_detections === 0 && payload.total_segments === 0) return;

      try {
         await fraudDetectionService.submitUnifiedDetection(payload);
      } catch (err) {
         console.error('[FraudDetection] Unified event failed:', err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [videoInterviewId, enabled, status, extractAndResetPayload]);

  // --- UI State & Chips ---
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

  // Face Detection UI
  let faceChipLabel = '';
  let faceChipColor = '';
  let faceChipBg = '';
  let faceDotColor = '';
  let faceVisible = false;

  if (status === 'error') {
    faceChipLabel = 'AI Detector failed — retrying on next join';
    faceChipColor = '#fca5a5';
    faceChipBg = 'rgba(220,38,38,0.7)';
    faceDotColor = '#ef4444';
    faceVisible = true;
  } else if (status === 'loading') {
    faceChipLabel = 'AI Detector loading...';
    faceChipColor = '#94a3b8';
    faceChipBg = 'rgba(0,0,0,0.5)';
    faceDotColor = '#94a3b8';
    faceVisible = true;
  } else if (status === 'running') {
    if (faceCount > 1) {
      faceChipLabel = `${faceCount} faces detected`;
      faceChipColor = '#fca5a5';
      faceChipBg = 'rgba(220,38,38,0.85)';
      faceDotColor = '#ef4444';
      faceVisible = true;
    } else if (faceCount === 0) {
      faceChipLabel = 'No face detected';
      faceChipColor = '#fde68a';
      faceChipBg = 'rgba(217,119,6,0.85)';
      faceDotColor = '#f59e0b';
      faceVisible = true;
    } else {
      faceChipLabel = 'Monitoring Active';
      faceChipColor = '#86efac';
      faceChipBg = 'rgba(0,0,0,0.5)';
      faceDotColor = '#22c55e';
      faceVisible = true;
    }
  }

  // Movement Score UI
  let movementChipLabel = '';
  let movementChipColor = '';
  let movementChipBg = '';
  let movementDotColor = '';
  let movementVisible = false;

  if (status === 'running') {
    if (movementScore === 'HIGH') {
      movementChipLabel = 'High Movement';
      movementChipColor = '#fca5a5';
      movementChipBg = 'rgba(220,38,38,0.85)';
      movementDotColor = '#ef4444';
      movementVisible = true;
    } else if (movementScore === 'MODERATE') {
      movementChipLabel = 'Moderate Movement';
      movementChipColor = '#fde68a';
      movementChipBg = 'rgba(217,119,6,0.85)';
      movementDotColor = '#f59e0b';
      movementVisible = true;
    }
  }

  return (
    <>
      <video
        ref={videoRef}
        style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        muted
        playsInline
        autoPlay
      />

      {faceVisible && (
        <Box sx={{ position: 'fixed', top: 80, right: 24, zIndex: 1000, transition: 'opacity 0.3s ease' }}>
          <Chip
            size="small"
            icon={<Box sx={dotSx(faceDotColor, faceCount !== 1)} />}
            label={faceChipLabel}
            sx={chipSx(faceChipBg, faceChipColor)}
          />
        </Box>
      )}

      {movementVisible && (
        <Box sx={{ position: 'fixed', top: faceVisible ? 114 : 80, right: 24, zIndex: 1000, transition: 'all 0.3s ease' }}>
          <Chip
            size="small"
            icon={<Box sx={dotSx(movementDotColor, true)} />}
            label={movementChipLabel}
            sx={chipSx(movementChipBg, movementChipColor)}
          />
        </Box>
      )}
    </>
  );
};

export default FaceDetectionOverlay;
