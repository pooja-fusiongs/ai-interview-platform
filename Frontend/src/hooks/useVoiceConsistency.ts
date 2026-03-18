import { useRef, useState, useEffect, useCallback } from 'react';

export interface VoiceConsistencyStats {
  totalSegments: number;
  consistentSegments: number;
  inconsistentSegments: number;
  silentSegments: number;
  avgPitch: number;
  pitchShiftCount: number;       // Number of sudden pitch changes
  maxPitchDeviation: number;     // Largest deviation from average
  inconsistentSeconds: number;
}

export interface VoiceAlert {
  type: 'voice_change';
  timestamp: number;
}

interface UseVoiceConsistencyOptions {
  audioStream: MediaStream | null;
  enabled: boolean;
  intervalMs?: number;
}

interface UseVoiceConsistencyResult {
  status: 'idle' | 'loading' | 'running' | 'error';
  alerts: VoiceAlert[];
  stats: VoiceConsistencyStats;
  getLatestStats: () => VoiceConsistencyStats;
}

// Thresholds
const AUDIO_RMS_THRESHOLD = 0.005;    // Minimum RMS to consider as speech (lowered for virtual audio cables)
const PITCH_SHIFT_THRESHOLD = 0.35;   // 35% pitch deviation = voice change
const ALERT_CONSECUTIVE = 3;          // 3 consecutive shifts before alert

const emptyStats: VoiceConsistencyStats = {
  totalSegments: 0,
  consistentSegments: 0,
  inconsistentSegments: 0,
  silentSegments: 0,
  avgPitch: 0,
  pitchShiftCount: 0,
  maxPitchDeviation: 0,
  inconsistentSeconds: 0,
};

/**
 * Detect fundamental frequency (pitch) using autocorrelation.
 * Returns frequency in Hz, or 0 if no pitch detected.
 */
function detectPitch(analyser: AnalyserNode, sampleRate: number, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer);

  // Check if there's enough signal
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);
  if (rms < AUDIO_RMS_THRESHOLD) return 0; // Silence

  // Autocorrelation method for pitch detection
  const SIZE = buffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);
  let bestOffset = -1;
  let bestCorrelation = 0;
  let foundGoodCorrelation = false;

  // Search for pitch between 80Hz and 500Hz (human voice range)
  const minPeriod = Math.floor(sampleRate / 500); // ~500Hz upper bound
  const maxPeriod = Math.floor(sampleRate / 80);  // ~80Hz lower bound

  for (let offset = minPeriod; offset < Math.min(maxPeriod, MAX_SAMPLES); offset++) {
    let correlation = 0;
    let norm1 = 0;
    let norm2 = 0;

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
      // Past the peak, stop searching
      break;
    }
  }

  if (bestOffset === -1 || bestCorrelation < 0.7) return 0;
  return sampleRate / bestOffset;
}

export function useVoiceConsistency({
  audioStream,
  enabled,
  intervalMs = 1500,
}: UseVoiceConsistencyOptions): UseVoiceConsistencyResult {
  const [status, setStatus] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [alerts, setAlerts] = useState<VoiceAlert[]>([]);
  const [stats, setStats] = useState<VoiceConsistencyStats>({ ...emptyStats });

  const statsRef = useRef<VoiceConsistencyStats>({ ...emptyStats });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  // Track pitch history for consistency analysis
  const pitchHistoryRef = useRef<number[]>([]); // Recent pitch values (non-zero only)
  const baselinePitchRef = useRef<number>(0);   // Established baseline pitch
  const baselineCountRef = useRef<number>(0);   // How many segments contributed to baseline
  const shiftHistoryRef = useRef<boolean[]>([]);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    bufferRef.current = null;
    pitchHistoryRef.current = [];
    baselinePitchRef.current = 0;
    baselineCountRef.current = 0;
    shiftHistoryRef.current = [];
  }, []);

  useEffect(() => {
    if (!audioStream || !enabled) {
      cleanup();
      setStatus('idle');
      setAlerts([]);
      return;
    }

    let cancelled = false;

    try {
      const audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 4096; // Larger FFT for better pitch resolution
      analyser.smoothingTimeConstant = 0.1;

      const source = audioCtx.createMediaStreamSource(audioStream);
      source.connect(analyser);

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      bufferRef.current = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;

      setStatus('running');

      const intervalSeconds = intervalMs / 1000;

      intervalRef.current = setInterval(() => {
        if (!analyserRef.current || !bufferRef.current || !audioCtxRef.current) return;

        const pitch = detectPitch(analyserRef.current, audioCtxRef.current.sampleRate, bufferRef.current);
        const s = statsRef.current;
        s.totalSegments += 1;

        if (pitch === 0) {
          // Silence — no voice detected
          s.silentSegments += 1;
          shiftHistoryRef.current.push(false);
        } else {
          // Voice detected — track pitch
          pitchHistoryRef.current.push(pitch);
          // Keep last 60 pitch values (~90 seconds)
          if (pitchHistoryRef.current.length > 60) {
            pitchHistoryRef.current = pitchHistoryRef.current.slice(-60);
          }

          // Establish baseline from first 10 voiced segments
          if (baselineCountRef.current < 10) {
            baselineCountRef.current += 1;
            baselinePitchRef.current =
              (baselinePitchRef.current * (baselineCountRef.current - 1) + pitch) / baselineCountRef.current;
            s.avgPitch = baselinePitchRef.current;
            s.consistentSegments += 1;
            shiftHistoryRef.current.push(false);
          } else {
            // Compare current pitch with baseline
            const deviation = Math.abs(pitch - baselinePitchRef.current) / baselinePitchRef.current;

            if (deviation > s.maxPitchDeviation) {
              s.maxPitchDeviation = deviation;
            }

            // Update running average
            s.avgPitch = (s.avgPitch * 0.95) + (pitch * 0.05);

            if (deviation > PITCH_SHIFT_THRESHOLD) {
              // Significant pitch change
              s.inconsistentSegments += 1;
              s.pitchShiftCount += 1;
              s.inconsistentSeconds += intervalSeconds;
              shiftHistoryRef.current.push(true);
            } else {
              s.consistentSegments += 1;
              // Slowly update baseline with consistent samples
              baselinePitchRef.current = baselinePitchRef.current * 0.98 + pitch * 0.02;
              shiftHistoryRef.current.push(false);
            }
          }
        }

        // Keep last 10 entries for alert detection
        if (shiftHistoryRef.current.length > 10) {
          shiftHistoryRef.current = shiftHistoryRef.current.slice(-10);
        }

        // Generate alerts
        const newAlerts: VoiceAlert[] = [];
        const recent = shiftHistoryRef.current.slice(-ALERT_CONSECUTIVE);
        if (recent.length >= ALERT_CONSECUTIVE && recent.every(v => v)) {
          newAlerts.push({ type: 'voice_change', timestamp: Date.now() });
        }
        setAlerts(newAlerts);

        // Update React state every 10 segments
        if (s.totalSegments % 10 === 0) {
          setStats({ ...s });
        }
      }, intervalMs);
    } catch {
      if (!cancelled) setStatus('error');
    }

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [audioStream, enabled, intervalMs, cleanup]);

  useEffect(() => cleanup, [cleanup]);

  const getLatestStats = useCallback(() => ({ ...statsRef.current }), []);

  return { status, alerts, stats, getLatestStats };
}
