import { useRef, useState, useEffect, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export interface LipSyncAlert {
  type: 'lip_not_moving' | 'lip_no_face';
  timestamp: number;
}

export interface LipDetectionStats {
  totalFrames: number;
  lipMovingWithAudio: number;    // Lips moving + audio active (good)
  lipStillWithAudio: number;     // Lips NOT moving + audio active (suspicious)
  lipMovingNoAudio: number;      // Lips moving + no audio
  lipStillNoAudio: number;       // Both still (silence, normal)
  noFaceFrames: number;
  maxMouthOpenness: number;
  avgMouthOpenness: number;
  mismatchSeconds: number;       // Total seconds of lip-audio mismatch
}

interface UseLipDetectionOptions {
  videoElement: HTMLVideoElement | null;
  audioStream: MediaStream | null;  // Candidate's mic stream
  enabled: boolean;
  intervalMs?: number;
}

interface UseLipDetectionResult {
  lipMoving: boolean;
  audioActive: boolean;
  status: 'idle' | 'loading' | 'running' | 'error';
  alerts: LipSyncAlert[];
  stats: LipDetectionStats;
  getLatestStats: () => LipDetectionStats;
}

// MediaPipe Face Mesh landmark indices:
// Inner upper lip (bottom edge): 13
// Inner lower lip (top edge): 14
// Forehead top: 10
// Chin bottom: 152
const UPPER_LIP_IDX = 13;
const LOWER_LIP_IDX = 14;
const FOREHEAD_IDX = 10;
const CHIN_IDX = 152;

// Thresholds
const LIP_MOVEMENT_THRESHOLD = 0.06;  // Mouth openness (normalized) threshold — closed mouth ~0.03-0.05, open ~0.08+
const AUDIO_RMS_THRESHOLD = 0.002;    // Audio RMS threshold to count as "active speech"
const MISMATCH_CONSECUTIVE = 4;       // Consecutive mismatches before alert (~6s at 1500ms interval)

const emptyStats: LipDetectionStats = {
  totalFrames: 0,
  lipMovingWithAudio: 0,
  lipStillWithAudio: 0,
  lipMovingNoAudio: 0,
  lipStillNoAudio: 0,
  noFaceFrames: 0,
  maxMouthOpenness: 0,
  avgMouthOpenness: 0,
  mismatchSeconds: 0,
};

export function useLipDetection({
  videoElement,
  audioStream,
  enabled,
  intervalMs = 750,
}: UseLipDetectionOptions): UseLipDetectionResult {
  const [lipMoving, setLipMoving] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [alerts, setAlerts] = useState<LipSyncAlert[]>([]);
  const [stats, setStats] = useState<LipDetectionStats>({ ...emptyStats });

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializingRef = useRef(false);
  const statsRef = useRef<LipDetectionStats>({ ...emptyStats });
  const opennessSum = useRef(0);

  // Audio analysis refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  // Mismatch tracking for alerts
  const mismatchHistoryRef = useRef<boolean[]>([]);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (landmarkerRef.current) {
      landmarkerRef.current.close();
      landmarkerRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    audioDataRef.current = null;
    mismatchHistoryRef.current = [];
    initializingRef.current = false;
  }, []);

  // Setup audio analyser when audioStream changes
  useEffect(() => {
    if (!audioStream || !enabled) return;

    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContext();
      // Resume if suspended (browser autoplay policy)
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;

      const source = audioCtx.createMediaStreamSource(audioStream);
      source.connect(analyser);

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      audioDataRef.current = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;
    } catch {
      // Audio analysis not available
    }

    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
      audioCtxRef.current = null;
      analyserRef.current = null;
      audioDataRef.current = null;
    };
  }, [audioStream, enabled]);

  // Get current audio RMS level
  const getAudioRMS = useCallback((): number => {
    if (!analyserRef.current || !audioDataRef.current) return 0;
    analyserRef.current.getFloatTimeDomainData(audioDataRef.current);
    let sum = 0;
    for (let i = 0; i < audioDataRef.current.length; i++) {
      sum += audioDataRef.current[i] * audioDataRef.current[i];
    }
    return Math.sqrt(sum / audioDataRef.current.length);
  }, []);

  useEffect(() => {
    if (!enabled || !videoElement) {
      cleanup();
      setStatus('idle');
      setLipMoving(false);
      setAudioActive(false);
      setAlerts([]);
      return;
    }

    let cancelled = false;

    const init = async () => {
      if (initializingRef.current || landmarkerRef.current) return;
      initializingRef.current = true;
      setStatus('loading');

      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );

        if (cancelled) return;

        console.log('[LipDetection] Loading FaceLandmarker model...');
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.3,
          minTrackingConfidence: 0.3,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        console.log('[LipDetection] FaceLandmarker model loaded successfully');

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setStatus('running');

        const intervalSeconds = intervalMs / 1000;

        intervalRef.current = setInterval(() => {
          if (!landmarkerRef.current || !videoElement) return;
          if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return;

          try {
            const now = performance.now();
            const result = landmarkerRef.current.detectForVideo(videoElement, now);
            const s = statsRef.current;
            s.totalFrames += 1;

            // Log first few frames to debug
            if (s.totalFrames <= 5) {
              console.log(`[LipDetection] Frame ${s.totalFrames}: faces=${result.faceLandmarks?.length || 0}, videoReady=${videoElement.readyState}, size=${videoElement.videoWidth}x${videoElement.videoHeight}`);
            }

            // Get audio level
            const rms = getAudioRMS();
            const isAudioActive = rms > AUDIO_RMS_THRESHOLD;
            setAudioActive(isAudioActive);


            if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
              // No face detected
              s.noFaceFrames += 1;
              setLipMoving(false);

              if (isAudioActive) {
                // Audio active but no face — suspicious
                mismatchHistoryRef.current.push(true);
              }
            } else {
              const landmarks = result.faceLandmarks[0];

              // Calculate mouth openness using inner lip landmarks
              const upperLip = landmarks[UPPER_LIP_IDX];
              const lowerLip = landmarks[LOWER_LIP_IDX];
              const forehead = landmarks[FOREHEAD_IDX];
              const chin = landmarks[CHIN_IDX];

              // Mouth gap normalized by full face height (forehead to chin)
              const faceHeight = Math.abs(chin.y - forehead.y) || 1;
              const mouthGap = Math.abs(lowerLip.y - upperLip.y);
              const openness = mouthGap / faceHeight;

              // Log first 3 frames to verify landmarks
              if (s.totalFrames <= 3) {
                console.log(`[LipDetection] forehead.y=${forehead.y.toFixed(4)}, chin.y=${chin.y.toFixed(4)}, faceH=${faceHeight.toFixed(4)}, gap=${mouthGap.toFixed(4)}, openness=${openness.toFixed(4)}, threshold=${LIP_MOVEMENT_THRESHOLD}`);
              }

              const isLipMoving = openness > LIP_MOVEMENT_THRESHOLD;
              setLipMoving(isLipMoving);

              // Track openness stats
              if (openness > s.maxMouthOpenness) {
                s.maxMouthOpenness = openness;
              }
              opennessSum.current += openness;
              s.avgMouthOpenness = opennessSum.current / (s.totalFrames - s.noFaceFrames || 1);

              // Categorize frame
              if (isLipMoving && isAudioActive) {
                s.lipMovingWithAudio += 1; // Good — speaking normally
                mismatchHistoryRef.current.push(false);
              } else if (!isLipMoving && isAudioActive) {
                s.lipStillWithAudio += 1; // Suspicious — audio but no lip movement
                s.mismatchSeconds += intervalSeconds;
                mismatchHistoryRef.current.push(true);
              } else if (isLipMoving && !isAudioActive) {
                s.lipMovingNoAudio += 1; // Could be muted, or mouthing words
                mismatchHistoryRef.current.push(false);
              } else {
                s.lipStillNoAudio += 1; // Silence — normal
                mismatchHistoryRef.current.push(false);
              }
            }

            // Keep only last 10 entries for alert detection
            if (mismatchHistoryRef.current.length > 10) {
              mismatchHistoryRef.current = mismatchHistoryRef.current.slice(-10);
            }

            // Generate alerts
            const newAlerts: LipSyncAlert[] = [];
            const recentMismatches = mismatchHistoryRef.current.slice(-MISMATCH_CONSECUTIVE);
            if (
              recentMismatches.length >= MISMATCH_CONSECUTIVE &&
              recentMismatches.every(m => m)
            ) {
              newAlerts.push({ type: 'lip_not_moving', timestamp: Date.now() });
            }

            setAlerts(newAlerts);

            // Update React state every 10 frames
            if (s.totalFrames % 10 === 0) {
              setStats({ ...s });
            }
          } catch (frameErr) {
            if (statsRef.current.totalFrames <= 3) {
              console.error('[LipDetection] Frame error:', frameErr);
            }
          }
        }, intervalMs);
      } catch (initErr) {
        console.error('[LipDetection] Init error:', initErr);
        if (!cancelled) {
          setStatus('error');
        }
      } finally {
        initializingRef.current = false;
      }
    };

    init();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, videoElement, intervalMs, cleanup, getAudioRMS]);

  useEffect(() => cleanup, [cleanup]);

  const getLatestStats = useCallback(() => ({ ...statsRef.current }), []);

  return { lipMoving, audioActive, status, alerts, stats, getLatestStats };
}
