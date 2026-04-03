import { useRef, useState, useEffect, useCallback } from 'react';

// MediaPipe loaded dynamically from CDN (npm imports break in production build)
type Results = any;
type FaceDetectionResults = any;

/** Load a script from CDN and return the global object */
function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (document.querySelector(`script[src="${url}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load: ${url}`));
    document.head.appendChild(script);
  });
}

const HOLISTIC_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/holistic.js';
const FACE_DETECTION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/face_detection.js';

// --- Types ---
export interface MovementFlags {
  left_frame: boolean;
  excessive_hands: boolean;
  slouching: boolean;
  fidgeting: boolean;
}

export interface UnifiedDetectionPayload {
  interview_id: number;
  timestamp: string;
  total_detections: number;
  no_face_count: number;
  multiple_face_count: number;
  single_face_count: number;
  no_face_seconds: number;
  multiple_face_seconds: number;
  max_faces_detected: number;
  total_frames: number;
  lip_moving_with_audio: number;
  lip_still_with_audio: number;
  lip_moving_no_audio: number;
  lip_still_no_audio: number;
  no_face_frames: number;
  max_mouth_openness: number;
  avg_mouth_openness: number;
  mismatch_seconds: number;
  total_segments: number;
  consistent_segments: number;
  inconsistent_segments: number;
  silent_segments: number;
  avg_pitch: number;
  pitch_shift_count: number;
  max_pitch_deviation: number;
  inconsistent_seconds: number;
  looking_away_count: number;
  looking_away_seconds: number;
  movement_score: 'CALM' | 'MODERATE' | 'HIGH';
  movement_intensity: number;
  flags: MovementFlags;
}

interface UseDetectionOptions {
  videoElement: HTMLVideoElement | null;
  audioStream: MediaStream | null;
  enabled: boolean;
  intervalMs?: number; // Target interval for processing frames (e.g., 500ms)
}

// MediaPipe Face Mesh inner lip landmarks (from useLipDetection)
const UPPER_LIP_IDX = 13;
const LOWER_LIP_IDX = 14;
const FOREHEAD_IDX = 10;
const CHIN_IDX = 152;

// Thresholds
const AUDIO_RMS_THRESHOLD = 0.002;
const LIP_MOVEMENT_THRESHOLD = 0.06;
const PITCH_SHIFT_THRESHOLD = 0.35;

/** Audio Pitch Detection Algorithm */
function detectPitch(analyser: AnalyserNode, sampleRate: number, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer);
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < AUDIO_RMS_THRESHOLD) return 0;

  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);
  let bestOffset = -1;
  let bestCorrelation = 0;
  let foundGoodCorrelation = false;
  const minPeriod = Math.floor(sampleRate / 500);
  const maxPeriod = Math.floor(sampleRate / 80);

  for (let offset = minPeriod; offset < Math.min(maxPeriod, MAX_SAMPLES); offset++) {
    let correlation = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      correlation += buffer[i] * buffer[i + offset];
      norm1 += buffer[i] * buffer[i];
      norm2 += buffer[i + offset] * buffer[i + offset];
    }
    const normalizedCorrelation = correlation / (Math.sqrt(norm1 * norm2) || 1);
    if (normalizedCorrelation > 0.7 && normalizedCorrelation > bestCorrelation) {
      bestCorrelation = normalizedCorrelation;
      bestOffset = offset;
      foundGoodCorrelation = true;
    } else if (foundGoodCorrelation && normalizedCorrelation < 0.5) {
      break;
    }
  }
  if (bestOffset === -1 || bestCorrelation < 0.7) return 0;
  return sampleRate / bestOffset;
}

export function useDetection({
  videoElement,
  audioStream,
  enabled,
  intervalMs = 750,
}: UseDetectionOptions) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  
  // Real-time states
  const [faceCount, setFaceCount] = useState(0);
  const [lipMoving, setLipMoving] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [movementScore, setMovementScore] = useState<'CALM' | 'MODERATE' | 'HIGH'>('CALM');

  // Stats accumulator (resets every 5 seconds for the payload window)
  const windowStatsRef = useRef<Omit<UnifiedDetectionPayload, 'interview_id' | 'timestamp' | 'flags'>>({
    total_detections: 0,
    no_face_count: 0,
    multiple_face_count: 0,
    single_face_count: 0,
    no_face_seconds: 0,
    multiple_face_seconds: 0,
    max_faces_detected: 0,
    total_frames: 0,
    lip_moving_with_audio: 0,
    lip_still_with_audio: 0,
    lip_moving_no_audio: 0,
    lip_still_no_audio: 0,
    no_face_frames: 0,
    max_mouth_openness: 0,
    avg_mouth_openness: 0,
    mismatch_seconds: 0,
    total_segments: 0,
    consistent_segments: 0,
    inconsistent_segments: 0,
    silent_segments: 0,
    avg_pitch: 0,
    pitch_shift_count: 0,
    max_pitch_deviation: 0,
    inconsistent_seconds: 0,
    looking_away_count: 0,
    looking_away_seconds: 0,
    movement_score: 'CALM',
    movement_intensity: 0,
  });

  const flagsRef = useRef<MovementFlags>({
    left_frame: false,
    excessive_hands: false,
    slouching: false,
    fidgeting: false,
  });

  // Trackers
  const holisticRef = useRef<any>(null);
  const faceDetectorRef = useRef<any>(null);
  const multiFaceCountRef = useRef(0); // Updated by FaceDetection (supports multiple faces)
  const internalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Liveness detection — track face landmark movement between frames
  const prevNoseRef = useRef<{ x: number; y: number } | null>(null);
  const staticFrameCountRef = useRef(0);
  const STATIC_THRESHOLD = 0.002; // Minimum nose movement to count as "alive"
  const STATIC_FRAMES_LIMIT = 10; // After 10 static frames (~10s), treat as not a real face
  
  // Audio Trackers
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const baselinePitchRef = useRef(0);
  const baselineCountRef = useRef(0);
  const opennessSumRef = useRef(0);

  // Movement Trackers
  const lastPoseRef = useRef<any>(null);
  const lastHandsRef = useRef<{left: any, right: any}>({left: null, right: null});
  const movementHistoryRef = useRef<number[]>([]); // stores intensity values
  const slouchReferenceYRef = useRef<number | null>(null);

  // Payload extraction helper
  const extractAndResetPayload = useCallback((interview_id: number): UnifiedDetectionPayload => {
    const w = { ...windowStatsRef.current };
    const f = { ...flagsRef.current };
    
    // Average final values
    if (w.total_frames - w.no_face_frames > 0) {
      w.avg_mouth_openness = opennessSumRef.current / (w.total_frames - w.no_face_frames);
    }
    
    // Calculate 5-sec movement score based on average intensity
    const avgIntensity = movementHistoryRef.current.length > 0 
      ? movementHistoryRef.current.reduce((a, b) => a + b, 0) / movementHistoryRef.current.length 
      : 0;
      
    let score: 'CALM' | 'MODERATE' | 'HIGH' = 'CALM';
    if (avgIntensity > 0.035) score = 'HIGH';
    else if (avgIntensity > 0.012) score = 'MODERATE';
    
    w.movement_intensity = parseFloat(avgIntensity.toFixed(3));
    w.movement_score = score;

    const payload: UnifiedDetectionPayload = {
      interview_id,
      timestamp: new Date().toISOString(),
      ...w,
      flags: f
    };

    // Reset window
    windowStatsRef.current = {
      total_detections: 0,
      no_face_count: 0,
      multiple_face_count: 0,
      single_face_count: 0,
      no_face_seconds: 0,
      multiple_face_seconds: 0,
      max_faces_detected: 0,
      total_frames: 0,
      lip_moving_with_audio: 0,
      lip_still_with_audio: 0,
      lip_moving_no_audio: 0,
      lip_still_no_audio: 0,
      no_face_frames: 0,
      max_mouth_openness: 0,
      avg_mouth_openness: 0,
      mismatch_seconds: 0,
      total_segments: 0,
      consistent_segments: 0,
      inconsistent_segments: 0,
      silent_segments: 0,
      avg_pitch: 0,
      pitch_shift_count: 0,
      max_pitch_deviation: 0,
      inconsistent_seconds: 0,
      looking_away_count: 0,
      looking_away_seconds: 0,
      movement_score: 'CALM',
      movement_intensity: 0,
    };
    flagsRef.current = {
      left_frame: false,
      excessive_hands: false,
      slouching: false,
      fidgeting: false,
    };
    movementHistoryRef.current = [];
    opennessSumRef.current = 0;

    return payload;
  }, []);

  // Cleanup
  const cleanup = useCallback(() => {
    if (internalIntervalRef.current) clearInterval(internalIntervalRef.current);
    if (holisticRef.current) holisticRef.current.close();
    if (faceDetectorRef.current) faceDetectorRef.current.close();
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    internalIntervalRef.current = null;
    holisticRef.current = null;
    faceDetectorRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
    audioDataRef.current = null;
    bufferRef.current = null;
    setStatus('idle');
  }, []);

  // Setup Audio
  useEffect(() => {
    if (!audioStream || !enabled) return;
    try {
      const audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.1;
      const source = audioCtx.createMediaStreamSource(audioStream);
      source.connect(analyser);

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      audioDataRef.current = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;
      bufferRef.current = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;
    } catch {}
    
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [audioStream, enabled]);

  // Setup Holistic & Loop
  useEffect(() => {
    if (!enabled || !videoElement) {
      cleanup();
      return;
    }

    let isProcessing = false;
    let cancelled = false;

    const onResults = (results: Results) => {
      if (cancelled) return;
      
      const w = windowStatsRef.current;
      const intervalSeconds = intervalMs / 1000;
      
      // --- AUDIO PROCESSING ---
      let isAudioActive = false;
      let pitch = 0;
      if (analyserRef.current && bufferRef.current && audioCtxRef.current) {
        // RMS for activity
        analyserRef.current.getFloatTimeDomainData(bufferRef.current);
        let rms = 0;
        for (let i = 0; i < bufferRef.current.length; i++) rms += bufferRef.current[i] * bufferRef.current[i];
        rms = Math.sqrt(rms / bufferRef.current.length);
        isAudioActive = rms > AUDIO_RMS_THRESHOLD;
        setAudioActive(isAudioActive);
        
        // Pitch for consistency
        pitch = detectPitch(analyserRef.current, audioCtxRef.current.sampleRate, bufferRef.current);
        w.total_segments += 1;
        
        if (pitch === 0) {
          w.silent_segments += 1;
        } else {
          if (baselineCountRef.current < 10) {
            baselineCountRef.current += 1;
            baselinePitchRef.current = (baselinePitchRef.current * (baselineCountRef.current - 1) + pitch) / baselineCountRef.current;
            w.avg_pitch = baselinePitchRef.current;
            w.consistent_segments += 1;
          } else {
            const deviation = Math.abs(pitch - baselinePitchRef.current) / baselinePitchRef.current;
            if (deviation > w.max_pitch_deviation) w.max_pitch_deviation = deviation;
            w.avg_pitch = (w.avg_pitch * 0.95) + (pitch * 0.05);

            if (deviation > PITCH_SHIFT_THRESHOLD) {
              w.inconsistent_segments += 1;
              w.pitch_shift_count += 1;
              w.inconsistent_seconds += intervalSeconds;
            } else {
              w.consistent_segments += 1;
              baselinePitchRef.current = baselinePitchRef.current * 0.98 + pitch * 0.02;
            }
          }
        }
      }

      // --- FACE PROCESSING ---
      // Holistic gives 0 or 1 face. Use FaceDetection model for accurate multi-face count.
      const rawHasFace = !!results.faceLandmarks && results.faceLandmarks.length > 0;

      // Liveness check — detect if face is static (avatar/image/icon)
      let isLiveFace = rawHasFace;
      if (rawHasFace && results.faceLandmarks && results.faceLandmarks.length > 1) {
        const nose = results.faceLandmarks[1]; // nose tip
        if (prevNoseRef.current) {
          const dx = Math.abs(nose.x - prevNoseRef.current.x);
          const dy = Math.abs(nose.y - prevNoseRef.current.y);
          const movement = dx + dy;
          if (movement < STATIC_THRESHOLD) {
            staticFrameCountRef.current += 1;
          } else {
            staticFrameCountRef.current = 0; // Reset — face is moving
          }
          // If face hasn't moved for too many frames, it's likely a static image/avatar
          if (staticFrameCountRef.current >= STATIC_FRAMES_LIMIT) {
            isLiveFace = false;
          }
        }
        prevNoseRef.current = { x: nose.x, y: nose.y };
      } else {
        prevNoseRef.current = null;
        staticFrameCountRef.current = 0;
      }

      const hasFace = isLiveFace;
      // Use multi-face detector count if available, but apply liveness filter
      let faceCountCurrent = multiFaceCountRef.current > 0 ? multiFaceCountRef.current : (hasFace ? 1 : 0);
      if (!isLiveFace && faceCountCurrent === 1) faceCountCurrent = 0; // Static face = no real face
      setFaceCount(faceCountCurrent);
      w.total_detections += 1;

      if (faceCountCurrent === 0) {
        w.no_face_count += 1;
        w.no_face_seconds += intervalSeconds;
        flagsRef.current.left_frame = true;
      } else if (faceCountCurrent === 1) {
        w.single_face_count += 1;
      } else {
        // 2+ faces detected
        w.multiple_face_count += 1;
        w.multiple_face_seconds += intervalSeconds;
      }

      // --- GAZE / LOOKING AWAY DETECTION ---
      // Use nose tip landmark (index 1) to detect if person is looking away from screen
      // Nose centered (0.3-0.7 in x, 0.2-0.7 in y) = looking at screen
      // Outside this range = looking away (at phone, second monitor, etc.)
      if (hasFace && results.faceLandmarks && results.faceLandmarks.length > 1) {
        const nose = results.faceLandmarks[1]; // nose tip
        const isLookingAway = nose.x < 0.25 || nose.x > 0.75 || nose.y < 0.15 || nose.y > 0.75;
        if (isLookingAway) {
          w.looking_away_count += 1;
          w.looking_away_seconds += intervalSeconds;
        }
      }
      if (faceCountCurrent > w.max_faces_detected) w.max_faces_detected = faceCountCurrent;

      // --- LIP SYNC ---
      w.total_frames += 1;
      if (!hasFace || !rawHasFace) {
        w.no_face_frames += 1;
        setLipMoving(false);
      } else {
        const uLip = results.faceLandmarks[UPPER_LIP_IDX];
        const lLip = results.faceLandmarks[LOWER_LIP_IDX];
        const fHead = results.faceLandmarks[FOREHEAD_IDX];
        const chin = results.faceLandmarks[CHIN_IDX];
        
        const faceHeight = Math.abs(chin.y - fHead.y) || 1;
        const mouthGap = Math.abs(lLip.y - uLip.y);
        const openness = mouthGap / faceHeight;
        
        const isLipMoving = openness > LIP_MOVEMENT_THRESHOLD;
        setLipMoving(isLipMoving);

        if (openness > w.max_mouth_openness) w.max_mouth_openness = openness;
        opennessSumRef.current += openness;

        if (isLipMoving && isAudioActive) w.lip_moving_with_audio += 1;
        else if (!isLipMoving && isAudioActive) {
          w.lip_still_with_audio += 1;
          w.mismatch_seconds += intervalSeconds;
        }
        else if (isLipMoving && !isAudioActive) w.lip_moving_no_audio += 1;
        else w.lip_still_no_audio += 1;
      }

      // --- BODY MOVEMENT ---
      let currentIntensity = 0;
      if (results.poseLandmarks) {
        const leftShoulder = results.poseLandmarks[11];
        const rightShoulder = results.poseLandmarks[12];
        
        // Slouch detection: Establish reference Y
        const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        if (slouchReferenceYRef.current === null) {
          slouchReferenceYRef.current = avgShoulderY;
        } else {
          // If shoulders drop by 15% of frame height -> slouching
          if (avgShoulderY - slouchReferenceYRef.current > 0.15) {
            flagsRef.current.slouching = true;
          }
        }

        // Fidgeting / General Intensity
        if (lastPoseRef.current) {
          const ldx = leftShoulder.x - lastPoseRef.current[11].x;
          const ldy = leftShoulder.y - lastPoseRef.current[11].y;
          const rdx = rightShoulder.x - lastPoseRef.current[12].x;
          const rdy = rightShoulder.y - lastPoseRef.current[12].y;
          currentIntensity += Math.sqrt(ldx*ldx + ldy*ldy) + Math.sqrt(rdx*rdx + rdy*rdy);
        }
        lastPoseRef.current = results.poseLandmarks;
      }

      // Wrist Velocity (Excessive Hands)
      let handIntensity = 0;
      if (results.leftHandLandmarks) {
        const wrist = results.leftHandLandmarks[0];
        if (lastHandsRef.current.left) {
          const dx = wrist.x - lastHandsRef.current.left.x;
          const dy = wrist.y - lastHandsRef.current.left.y;
          handIntensity += Math.sqrt(dx*dx + dy*dy);
        }
        lastHandsRef.current.left = wrist;
      }
      if (results.rightHandLandmarks) {
        const wrist = results.rightHandLandmarks[0];
        if (lastHandsRef.current.right) {
          const dx = wrist.x - lastHandsRef.current.right.x;
          const dy = wrist.y - lastHandsRef.current.right.y;
          handIntensity += Math.sqrt(dx*dx + dy*dy);
        }
        lastHandsRef.current.right = wrist;
      }
      
      if (handIntensity > 0.1) flagsRef.current.excessive_hands = true;
      currentIntensity += handIntensity;

      // Add to movement history
      movementHistoryRef.current.push(currentIntensity);
      if (movementHistoryRef.current.length > 20) {
        movementHistoryRef.current.shift();
      }

      // Calculate real-time score for UI feedback
      const recentIntensity = movementHistoryRef.current.length > 0
        ? movementHistoryRef.current.reduce((a, b) => a + b, 0) / movementHistoryRef.current.length
        : 0;
        
      if (w.total_frames % 2 === 0) {
        console.log(`[MovementTracker] Avg Intensity: ${recentIntensity.toFixed(4)} | Poses: ${hasFace ? 1 : 0}`);
      }

      let currentScore: 'CALM' | 'MODERATE' | 'HIGH' = 'CALM';
      if (recentIntensity > 0.035) currentScore = 'HIGH'; // Lowered threshold 
      else if (recentIntensity > 0.012) currentScore = 'MODERATE'; // Lowered threshold

      setMovementScore(currentScore);

      // Fidgeting check (consistently high small movements)
      if (movementHistoryRef.current.filter(i => i > 0.01 && i < 0.04).length > 10) {
        flagsRef.current.fidgeting = true;
      }
    };

    const init = async () => {
      setStatus('loading');

      let holistic: any = null;

      try {
        if (cancelled) return;

        // Load Holistic from CDN (bypasses Vite bundler)
        await loadScript(HOLISTIC_CDN);
        const HolisticCtor = (window as any).Holistic;
        if (!HolisticCtor) throw new Error('Holistic not found on window after CDN load');

        const locateFile = (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`;
        const h = new HolisticCtor({ locateFile });
        h.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
          refineFaceLandmarks: true,
        });
        h.onResults(onResults);

        await h.initialize();
        holistic = h;
        console.log('[useDetection] Holistic initialized successfully');
      } catch (e) {
        console.warn('[useDetection] Holistic CDN load failed:', e);
      }

      if (!holistic || cancelled) {
        if (!cancelled) {
          console.warn("[useDetection] Holistic init failed. Retrying in 10s...");
          setStatus('error');
          setTimeout(() => { if (!cancelled) init(); }, 10000);
        }
        return;
      }

      holisticRef.current = holistic;

      // Initialize FaceDetection for multi-face counting
      try {
        await loadScript(FACE_DETECTION_CDN);
        const FDCtor = (window as any).FaceDetection;
        if (!FDCtor) throw new Error('FaceDetection not found on window');

        const fd = new FDCtor({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/${file}`,
        });
        fd.setOptions({
          model: 'short',
          minDetectionConfidence: 0.5,
        });
        fd.onResults((faceResults: FaceDetectionResults) => {
          const count = faceResults.detections?.length ?? 0;
          multiFaceCountRef.current = count;
        });
        await fd.initialize();
        faceDetectorRef.current = fd;
        console.log('[useDetection] FaceDetection (multi-face) initialized');
      } catch (e) {
        console.warn('[useDetection] FaceDetection init failed (multi-face disabled):', e);
        // Non-fatal — Holistic still works for single face
      }

      setStatus('running');

      // Canvas for black frame detection
      const checkCanvas = document.createElement('canvas');
      const checkCtx = checkCanvas.getContext('2d', { willReadFrequently: true });

      internalIntervalRef.current = setInterval(async () => {
        if (!holisticRef.current || !videoElement || isProcessing) return;
        if (videoElement.readyState < 2 || videoElement.videoWidth === 0) return;

        // Black frame detection — if video is mostly black (camera off), skip ML and report no face
        if (checkCtx) {
          checkCanvas.width = 32;
          checkCanvas.height = 32;
          checkCtx.drawImage(videoElement, 0, 0, 32, 32);
          const pixels = checkCtx.getImageData(0, 0, 32, 32).data;
          let brightness = 0;
          for (let i = 0; i < pixels.length; i += 16) { // Sample every 4th pixel
            brightness += pixels[i] + pixels[i + 1] + pixels[i + 2];
          }
          brightness /= (pixels.length / 16) * 3;
          if (brightness < 10) { // Nearly black frame — camera is off
            setFaceCount(0);
            multiFaceCountRef.current = 0;
            const w = windowStatsRef.current;
            w.total_detections += 1;
            w.no_face_count += 1;
            w.no_face_seconds += intervalMs / 1000;
            w.total_frames += 1;
            w.no_face_frames += 1;
            flagsRef.current.left_frame = true;
            return;
          }
        }

        isProcessing = true;
        try {
          // Run both models: Holistic (landmarks, lip, body) + FaceDetection (multi-face count)
          const promises: Promise<void>[] = [
            holisticRef.current.send({ image: videoElement }),
          ];
          if (faceDetectorRef.current) {
            promises.push(faceDetectorRef.current.send({ image: videoElement }));
          }
          await Promise.all(promises);
        } catch (e) {
          console.warn("[useDetection] Frame send error:", e);
        } finally {
          isProcessing = false;
        }
      }, intervalMs);
    };

    init();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [enabled, videoElement, intervalMs, cleanup]);

  return {
    status,
    faceCount,
    lipMoving,
    audioActive,
    movementScore,
    extractAndResetPayload
  };
}
