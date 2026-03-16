import React, { useRef, useEffect, useState } from 'react';
import { Box, Chip } from '@mui/material';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useFaceDetection } from '../../hooks/useFaceDetection';
import fraudDetectionService from '../../services/fraudDetectionService';

interface FaceDetectionOverlayProps {
  enabled: boolean;
  videoInterviewId?: number;
}

const FaceDetectionOverlay: React.FC<FaceDetectionOverlayProps> = ({ enabled, videoInterviewId }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const lastSentRef = useRef(0);
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Get local camera track from LiveKit
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false }
  );

  const localCameraTrack = tracks.find(
    (t) => t.participant?.isLocal && t.source === Track.Source.Camera
  );

  // Attach track to hidden video element
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

  const { faceCount, status, alerts, getLatestStats } = useFaceDetection({
    videoElement: videoReady ? videoRef.current : null,
    enabled: enabled && videoReady,
    intervalMs: 750,
  });

  // Send face detection stats to backend every 30 seconds
  useEffect(() => {
    if (!videoInterviewId || !enabled) return;

    const sendStats = async () => {
      const s = getLatestStats();
      if (s.totalDetections === 0) return;
      if (s.totalDetections === lastSentRef.current) return;
      lastSentRef.current = s.totalDetections;

      try {
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
        // Stats sent successfully
      } catch (err) {
        // Silently handle send failure
      }
    };

    sendIntervalRef.current = setInterval(sendStats, 30000);

    // Also send on unmount (interview end)
    return () => {
      if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
      sendStats();
    };
  }, [videoInterviewId, enabled, getLatestStats]);

  // Auto-hide normal state after 5 seconds
  const [showNormal, setShowNormal] = useState(true);
  useEffect(() => {
    if (alerts.length === 0 && status === 'running') {
      const timer = setTimeout(() => setShowNormal(false), 5000);
      return () => clearTimeout(timer);
    }
    setShowNormal(true);
  }, [alerts.length, status, faceCount]);

  // Determine what to show
  const hasNoFace = alerts.some((a) => a.type === 'no_face');
  const hasMultiple = alerts.some((a) => a.type === 'multiple_faces');

  let chipLabel = '';
  let chipColor = '';
  let chipBg = '';
  let dotColor = '';
  let visible = false;

  if (status === 'loading') {
    chipLabel = 'Face detection loading...';
    chipColor = '#94a3b8';
    chipBg = 'rgba(0,0,0,0.5)';
    dotColor = '#94a3b8';
    visible = true;
  } else if (status === 'error') {
    // Silently don't show anything on error
    visible = false;
  } else if (status === 'running') {
    if (hasMultiple) {
      chipLabel = `${faceCount} faces detected`;
      chipColor = '#fca5a5';
      chipBg = 'rgba(220,38,38,0.85)';
      dotColor = '#ef4444';
      visible = true;
    } else if (hasNoFace) {
      chipLabel = 'No face detected';
      chipColor = '#fde68a';
      chipBg = 'rgba(217,119,6,0.85)';
      dotColor = '#f59e0b';
      visible = true;
    } else if (showNormal && faceCount === 1) {
      chipLabel = 'Face detected';
      chipColor = '#86efac';
      chipBg = 'rgba(0,0,0,0.5)';
      dotColor = '#22c55e';
      visible = true;
    }
  }

  return (
    <>
      {/* Hidden video element for face detection */}
      <video
        ref={videoRef}
        style={{ display: 'none' }}
        muted
        playsInline
        autoPlay
      />

      {/* Status indicator */}
      {visible && (
        <Box
          sx={{
            position: 'fixed',
            top: 80,
            right: 24,
            zIndex: 1000,
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          <Chip
            size="small"
            icon={
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: dotColor,
                  ml: '8px',
                  animation: hasMultiple || hasNoFace ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
                  '@keyframes pulse-dot': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.4 },
                  },
                }}
              />
            }
            label={chipLabel}
            sx={{
              backgroundColor: chipBg,
              color: chipColor,
              fontSize: '11px',
              fontWeight: 600,
              height: 28,
              backdropFilter: 'blur(8px)',
              border: 'none',
              '& .MuiChip-label': { px: 1 },
            }}
          />
        </Box>
      )}
    </>
  );
};

export default FaceDetectionOverlay;
