import { useRef, useState, useEffect, useCallback } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

export interface FaceAlert {
  type: 'no_face' | 'multiple_faces';
  timestamp: number;
  faceCount: number;
}

interface DetectionEntry {
  timestamp: number;
  faceCount: number;
}

export interface FaceDetectionStats {
  totalDetections: number;
  noFaceCount: number;
  multipleFaceCount: number;
  singleFaceCount: number;
  noFaceSeconds: number;
  multipleFaceSeconds: number;
  maxFacesDetected: number;
}

interface UseFaceDetectionOptions {
  videoElement: HTMLVideoElement | null;
  enabled: boolean;
  intervalMs?: number;
}

interface UseFaceDetectionResult {
  faceCount: number;
  status: 'idle' | 'loading' | 'running' | 'error';
  alerts: FaceAlert[];
  stats: FaceDetectionStats;
  getLatestStats: () => FaceDetectionStats;
}

export function useFaceDetection({
  videoElement,
  enabled,
  intervalMs = 750,
}: UseFaceDetectionOptions): UseFaceDetectionResult {
  const [faceCount, setFaceCount] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [alerts, setAlerts] = useState<FaceAlert[]>([]);
  const [stats, setStats] = useState<FaceDetectionStats>({
    totalDetections: 0,
    noFaceCount: 0,
    multipleFaceCount: 0,
    singleFaceCount: 0,
    noFaceSeconds: 0,
    multipleFaceSeconds: 0,
    maxFacesDetected: 0,
  });

  const detectorRef = useRef<FaceDetector | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyRef = useRef<DetectionEntry[]>([]);
  const initializingRef = useRef(false);
  const statsRef = useRef<FaceDetectionStats>({
    totalDetections: 0,
    noFaceCount: 0,
    multipleFaceCount: 0,
    singleFaceCount: 0,
    noFaceSeconds: 0,
    multipleFaceSeconds: 0,
    maxFacesDetected: 0,
  });

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (detectorRef.current) {
      detectorRef.current.close();
      detectorRef.current = null;
    }
    historyRef.current = [];
    initializingRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled || !videoElement) {
      cleanup();
      setStatus('idle');
      setFaceCount(0);
      setAlerts([]);
      return;
    }

    let cancelled = false;

    const init = async () => {
      if (initializingRef.current || detectorRef.current) return;
      initializingRef.current = true;
      setStatus('loading');

      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        if (cancelled) return;

        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.5,
        });

        if (cancelled) {
          detector.close();
          return;
        }

        detectorRef.current = detector;
        setStatus('running');

        const intervalSeconds = intervalMs / 1000;

        // Start detection loop
        intervalRef.current = setInterval(() => {
          if (!detectorRef.current || !videoElement) return;
          if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return;

          try {
            const result = detectorRef.current.detectForVideo(videoElement, performance.now());
            const count = result.detections.length;

            setFaceCount(count);

            // Update cumulative stats
            const s = statsRef.current;
            s.totalDetections += 1;
            if (count === 0) {
              s.noFaceCount += 1;
              s.noFaceSeconds += intervalSeconds;
            } else if (count === 1) {
              s.singleFaceCount += 1;
            } else {
              s.multipleFaceCount += 1;
              s.multipleFaceSeconds += intervalSeconds;
            }
            if (count > s.maxFacesDetected) {
              s.maxFacesDetected = count;
            }
            // Update state every 10 detections to avoid excessive re-renders
            if (s.totalDetections % 10 === 0) {
              setStats({ ...s });
            }

            const now = Date.now();
            historyRef.current.push({ timestamp: now, faceCount: count });

            // Keep only last 30 seconds
            const cutoff = now - 30000;
            historyRef.current = historyRef.current.filter(e => e.timestamp > cutoff);

            // Derive alerts from recent history
            const newAlerts: FaceAlert[] = [];
            const recent = historyRef.current.slice(-4); // last ~3 seconds

            // No face: last 3 entries are all zero (truly consecutive)
            const lastThree = recent.slice(-3);
            const consecutiveNoFace = lastThree.length >= 3 && lastThree.every(e => e.faceCount === 0);
            if (consecutiveNoFace) {
              newAlerts.push({ type: 'no_face', timestamp: now, faceCount: 0 });
            }

            // Multiple faces: any recent detection with 2+
            if (count >= 2) {
              newAlerts.push({ type: 'multiple_faces', timestamp: now, faceCount: count });
            }

            setAlerts(newAlerts);
          } catch {
            // Skip frame errors
          }
        }, intervalMs);
      } catch {
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
  }, [enabled, videoElement, intervalMs, cleanup]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const getLatestStats = useCallback(() => ({ ...statsRef.current }), []);

  return { faceCount, status, alerts, stats, getLatestStats };
}
