# useLipDetection Hook

## Purpose

`useLipDetection` is a React hook that performs **real-time lip-sync fraud detection** during video interviews. It detects whether a candidate's lip movements match their audio activity — helping identify cases where someone else might be speaking on behalf of the candidate (e.g., AI-generated voice, someone off-screen answering).

## How It Works

The hook runs two parallel analyses every **750ms**:

### 1. Lip Movement Detection (via MediaPipe)
- Uses **MediaPipe FaceLandmarker** (GPU-accelerated, WASM) to detect face landmarks in the candidate's video feed
- Calculates **mouth openness** from lip landmarks (upper lip #13, lower lip #14) normalized by face height
- If mouth openness > `0.012` threshold → lips are "moving"

### 2. Audio Activity Detection (via Web Audio API)
- Creates an `AudioContext` + `AnalyserNode` from the candidate's microphone stream
- Computes **RMS (Root Mean Square)** of the audio waveform
- If RMS > `0.008` threshold → audio is "active" (speech detected)

### 3. Cross-Comparison (Fraud Signal)
Each frame is categorized into one of four buckets:

| Lips Moving? | Audio Active? | Category               | Meaning                        |
|:---:|:---:|-------------------------------|--------------------------------|
| Yes | Yes | `lipMovingWithAudio`          | Normal speaking                |
| No  | Yes | `lipStillWithAudio`           | **Suspicious** — someone else speaking? |
| Yes | No  | `lipMovingNoAudio`            | Muted / mouthing words         |
| No  | No  | `lipStillNoAudio`             | Silence — normal               |

If **4+ consecutive** frames show a mismatch (audio active but lips not moving), a `lip_not_moving` alert is raised.

## Dependencies

| Library | Purpose |
|---------|---------|
| `@mediapipe/tasks-vision` | Face landmark detection (FaceLandmarker) |
| Web Audio API (browser-native) | Microphone audio analysis |
| React hooks (`useRef`, `useState`, `useEffect`, `useCallback`) | State management & lifecycle |

## Usage

```tsx
import { useLipDetection } from '../hooks/useLipDetection';

const { lipMoving, audioActive, status, alerts, stats, getLatestStats } = useLipDetection({
  videoElement: videoRef.current,   // HTMLVideoElement with candidate's camera feed
  audioStream: micStream,           // MediaStream from candidate's microphone
  enabled: true,                    // Toggle detection on/off
  intervalMs: 750,                  // Detection interval (default: 750ms)
});
```

## Return Values

| Field | Type | Description |
|-------|------|-------------|
| `lipMoving` | `boolean` | Whether candidate's lips are currently moving |
| `audioActive` | `boolean` | Whether audio (speech) is currently detected |
| `status` | `'idle' \| 'loading' \| 'running' \| 'error'` | Hook lifecycle state |
| `alerts` | `LipSyncAlert[]` | Active alerts (`lip_not_moving`, `lip_no_face`) |
| `stats` | `LipDetectionStats` | Cumulative detection statistics |
| `getLatestStats()` | `() => LipDetectionStats` | Get latest stats (ref-based, no re-render) |

## Where It's Used

1. **[FaceDetectionOverlay.tsx](../components/video/FaceDetectionOverlay.tsx)** — The primary consumer. Runs during live video interviews on the **candidate's side**. Shows a "Lip sync mismatch" warning chip in the UI when alerts fire.

2. **[fraudDetectionService.ts](../services/fraudDetectionService.ts)** — Stats are sent to the backend every 30 seconds via `submitLipEvents()` API call (`POST /api/video/fraud/{id}/lip-events`).

3. **[LipSyncPanel.tsx](../components/fraud/LipSyncPanel.tsx)** — Displays the post-interview lip-sync analysis results on the fraud dashboard (scores for audio-visual sync, mouth movement accuracy, phoneme correlation, temporal alignment).

## Data Flow

```
Candidate's Camera (HTMLVideoElement)
        │
        ▼
  MediaPipe FaceLandmarker ──→ Lip landmark positions ──→ Mouth openness calculation
        │
        ▼
  Cross-compare with Audio RMS ──→ Frame categorization ──→ Mismatch detection
        │                                                         │
        ▼                                                         ▼
  Stats accumulated (statsRef)                           Alerts raised in UI
        │
        ▼ (every 30s)
  POST /api/video/fraud/{id}/lip-events ──→ Backend stores for fraud analysis
```

## Configuration Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `LIP_MOVEMENT_THRESHOLD` | `0.012` | Minimum mouth openness to count as "moving" |
| `AUDIO_RMS_THRESHOLD` | `0.008` | Minimum audio RMS to count as "speech" |
| `MISMATCH_CONSECUTIVE` | `4` | Consecutive mismatch frames before alert (~3 seconds) |
| `intervalMs` | `750` (default) | Detection loop interval in milliseconds |
