import React, { useRef, useEffect, useState } from 'react';
import { useTracks, useRoomContext } from '@livekit/components-react';
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
  const room = useRoomContext();
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

    let cancelled = false;

    const lkTrack = localMicTrack.publication.track.mediaStreamTrack;

    const tryGetMic = async () => {
      // Use LiveKit's track directly — avoid separate getUserMedia call
      // which conflicts with LiveKit's camera/mic and causes "Could not start video source"
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
      setMicStream(null);
    };
  }, [localMicTrack?.publication?.track, enabled]);

  // --- Unified Detection Hook (approx 1fps) ---
  const { status, faceCount: rawFaceCount, faceChanged, movementScore, extractAndResetPayload } = useDetection({
    videoElement: videoReady ? videoRef.current : null,
    audioStream: micStream,
    enabled: enabled && videoReady,
    intervalMs: 1000,
  });

  // Face count — small grace period for "no face" to avoid false positives from model misses
  const prevCameraEnabledRef = React.useRef(cameraTrackEnabled);
  const prevFaceCountRef = React.useRef(rawFaceCount);
  const [faceCount, setStableFaceCount] = React.useState(0);
  const noFaceStreakRef = React.useRef(0); // consecutive "0 face" frames

  React.useEffect(() => {
    const wasEnabled = prevCameraEnabledRef.current;
    prevCameraEnabledRef.current = cameraTrackEnabled;

    // Camera turned OFF → instant fraud flag
    if (wasEnabled && !cameraTrackEnabled) {
      if (videoInterviewId) {
        fraudDetectionService.submitFaceEvents(videoInterviewId, {
          total_detections: 1,
          no_face_count: 1,
          multiple_face_count: 0,
          single_face_count: 0,
          no_face_seconds: 1,
          multiple_face_seconds: 0,
          max_faces_detected: 0,
          detection_interval_ms: 0,
          camera_disabled_count: 1,
        }).catch(() => {});
      }
      setStableFaceCount(0);
      prevFaceCountRef.current = 0;
      return;
    }

    if (!cameraTrackEnabled) {
      setStableFaceCount(0);
      prevFaceCountRef.current = 0;
      return;
    }

    const prevCount = prevFaceCountRef.current;
    prevFaceCountRef.current = rawFaceCount;

    // Grace period for "no face" — require 3 consecutive misses (3s at 1000ms interval)
    // This prevents false "0 faces" from momentary model failures
    if (rawFaceCount === 0 && cameraTrackEnabled) {
      noFaceStreakRef.current += 1;
      if (noFaceStreakRef.current < 3) {
        // Not enough consecutive misses — keep showing previous face count
        return;
      }
    } else {
      noFaceStreakRef.current = 0;
    }

    // Face disappeared → fraud flag (only after grace period of 3 consecutive no-face)
    if (prevCount > 0 && rawFaceCount === 0 && noFaceStreakRef.current >= 3 && videoInterviewId) {
      fraudDetectionService.submitFaceEvents(videoInterviewId, {
        total_detections: 1,
        no_face_count: 1,
        multiple_face_count: 0,
        single_face_count: 0,
        no_face_seconds: 1,
        multiple_face_seconds: 0,
        max_faces_detected: 0,
        detection_interval_ms: 0,
        camera_disabled_count: 0,
      }).catch(() => {});
    }

    // Multiple faces appeared → instant fraud flag (transition from ≤1 to >1)
    if (rawFaceCount > 1 && prevCount <= 1 && videoInterviewId) {
      fraudDetectionService.submitFaceEvents(videoInterviewId, {
        total_detections: 1,
        no_face_count: 0,
        multiple_face_count: 1,
        single_face_count: 0,
        no_face_seconds: 0,
        multiple_face_seconds: 0,
        max_faces_detected: rawFaceCount,
        detection_interval_ms: 0,
      }).catch(() => {});
    }

    setStableFaceCount(rawFaceCount);
  }, [rawFaceCount, cameraTrackEnabled, videoInterviewId]);

  // Face identity changed → instant fraud flag
  const prevFaceChangedRef = React.useRef(false);
  React.useEffect(() => {
    const wasFaceChanged = prevFaceChangedRef.current;
    prevFaceChangedRef.current = faceChanged;

    // Only fire on transition from false → true
    if (faceChanged && !wasFaceChanged && videoInterviewId) {
      console.warn('[FraudDetection] Face identity changed — different person detected!');
      fraudDetectionService.submitFaceEvents(videoInterviewId, {
        total_detections: 1,
        no_face_count: 0,
        multiple_face_count: 0,
        single_face_count: 0,
        no_face_seconds: 0,
        multiple_face_seconds: 0,
        max_faces_detected: 1,
        detection_interval_ms: 0,
        camera_disabled_count: 0,
        face_changed: true,
      }).catch(() => {});
    }
  }, [faceChanged, videoInterviewId]);

  // --- Broadcast fraud status to recruiter via LiveKit DataChannel ---
  useEffect(() => {
    if (!room || status !== 'running') return;
    try {
      const fraudStatus = {
        type: 'fraud_status',
        faceCount,
        faceChanged,
        movementScore,
        cameraOff: !cameraTrackEnabled,
        status,
      };
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(fraudStatus)),
        { reliable: false } // unreliable = faster, ok to lose a frame
      );
    } catch {}
  }, [room, faceCount, faceChanged, movementScore, cameraTrackEnabled, status]);

  // --- Send Unified Stats Every 15 Seconds (batched to reduce bandwidth) ---
  useEffect(() => {
    if (!videoInterviewId || !enabled || status !== 'running') return;

    const interval = setInterval(async () => {
      // Skip if tab is hidden — no need to send when user isn't looking
      if (document.hidden) return;

      const payload = extractAndResetPayload(videoInterviewId);

      // Prevent sending empty payloads if detection just started
      if (payload.total_detections === 0 && payload.total_segments === 0) return;

      try {
         await fraudDetectionService.submitUnifiedDetection(payload);
      } catch (err) {
         console.error('[FraudDetection] Unified event failed:', err);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [videoInterviewId, enabled, status, extractAndResetPayload]);

  // Candidate sees NO fraud detection UI — chips are shown on recruiter side via DataChannel
  return (
    <video
      ref={videoRef}
      style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      muted
      playsInline
      autoPlay
    />
  );
};

export default FaceDetectionOverlay;
