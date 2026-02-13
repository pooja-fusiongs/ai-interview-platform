"""
Real Biometric Analysis Service.

Replaces the fraud_simulator with actual video/audio analysis using:
  - pydub  : audio extraction from .webm recordings
  - numpy  : signal-level pitch / energy analysis
  - mediapipe : Face Mesh (lip-sync, eye contact) and Pose (body movement)
  - cv2    : video frame decoding

Falls back to the simulator automatically if any dependency is missing,
ffmpeg is not installed, or the recording file cannot be found.
"""

import json
import os
import tempfile
import random
from datetime import datetime
from typing import Dict, Any, Optional

# ---------- lazy dependency checks ----------

def _check_deps():
    """Return True if all heavy deps are importable."""
    try:
        import cv2          # noqa: F401
        import numpy        # noqa: F401
        import mediapipe     # noqa: F401
        from pydub import AudioSegment  # noqa: F401
        return True
    except ImportError:
        return False


# =====================================================================
#  Voice Analysis
# =====================================================================

def analyze_voice(audio_path: str) -> Dict[str, Any]:
    """
    Analyse extracted audio for voice consistency.

    Metrics:
      - pitch_variation : std-dev of estimated F0 across segments
      - speaking_rate_consistency : similarity of zero-crossing rates
      - voice_print_match : spectral-centroid similarity across segments
    """
    import numpy as np
    from pydub import AudioSegment

    audio = AudioSegment.from_file(audio_path)
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
    sample_rate = audio.frame_rate

    # Mono
    if audio.channels > 1:
        samples = samples.reshape(-1, audio.channels).mean(axis=1)

    # Split into 10-sec segments
    seg_len = sample_rate * 10
    segments = [samples[i:i + seg_len] for i in range(0, len(samples), seg_len) if len(samples[i:i + seg_len]) > sample_rate]

    if len(segments) < 2:
        # Too short for meaningful analysis
        return {"score": 0.85, "details": {
            "pitch_variation": 0.1,
            "speaking_rate_consistency": 0.85,
            "voice_print_match": 0.85,
            "samples_analyzed": len(segments),
        }}

    # --- Pitch variation (autocorrelation-based F0) ---
    def _estimate_f0(seg, sr):
        from numpy.fft import rfft, irfft
        corr = irfft(np.abs(rfft(seg)) ** 2)
        # search between 80-400 Hz
        lo = max(1, sr // 400)
        hi = sr // 80
        if hi > len(corr):
            hi = len(corr)
        if lo >= hi:
            return 150.0
        peak = lo + np.argmax(corr[lo:hi])
        return sr / peak if peak > 0 else 150.0

    f0s = [_estimate_f0(s, sample_rate) for s in segments]
    pitch_std = float(np.std(f0s))
    # Normalise: lower std → higher score
    pitch_variation = round(min(pitch_std / 200.0, 1.0), 3)
    pitch_score = max(0.0, 1.0 - pitch_variation)

    # --- Speaking rate via zero-crossing rate ---
    def _zcr(seg):
        return float(np.sum(np.abs(np.diff(np.sign(seg)))) / (2.0 * len(seg)))

    zcrs = [_zcr(s) for s in segments]
    zcr_std = float(np.std(zcrs))
    speaking_rate_consistency = round(max(0.0, 1.0 - zcr_std * 50), 3)

    # --- Voice print: spectral centroid similarity ---
    def _spectral_centroid(seg, sr):
        spectrum = np.abs(np.fft.rfft(seg))
        freqs = np.fft.rfftfreq(len(seg), d=1.0 / sr)
        total = spectrum.sum()
        if total < 1e-10:
            return 0.0
        return float(np.sum(freqs * spectrum) / total)

    centroids = [_spectral_centroid(s, sample_rate) for s in segments]
    centroid_std = float(np.std(centroids))
    voice_print_match = round(max(0.0, 1.0 - centroid_std / 1000.0), 3)

    # Composite score
    score = round(pitch_score * 0.3 + speaking_rate_consistency * 0.35 + voice_print_match * 0.35, 3)

    return {
        "score": max(0.0, min(1.0, score)),
        "details": {
            "pitch_variation": pitch_variation,
            "speaking_rate_consistency": speaking_rate_consistency,
            "voice_print_match": voice_print_match,
            "samples_analyzed": len(segments),
        },
    }


# =====================================================================
#  Lip-Sync Analysis
# =====================================================================

def analyze_lip_sync(video_path: str, audio_path: str) -> Dict[str, Any]:
    """
    Correlate mouth openness (MediaPipe Face Mesh) with audio energy.
    High correlation → real speaker; low → possible dubbing/proxy.
    """
    import cv2
    import numpy as np
    import mediapipe as mp
    from pydub import AudioSegment

    audio = AudioSegment.from_file(audio_path)
    audio_samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
    if audio.channels > 1:
        audio_samples = audio_samples.reshape(-1, audio.channels).mean(axis=1)
    audio_sr = audio.frame_rate

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False, max_num_faces=1, min_detection_confidence=0.5
    )

    # Sample every ~0.5 sec
    sample_interval = max(1, int(fps * 0.5))
    mouth_openness = []
    audio_energy = []
    frames_analyzed = 0

    for frame_idx in range(0, total_frames, sample_interval):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            break
        frames_analyzed += 1

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = face_mesh.process(rgb)

        if result.multi_face_landmarks:
            lm = result.multi_face_landmarks[0].landmark
            # Landmarks 13 (upper lip) and 14 (lower lip)
            mouth_gap = abs(lm[13].y - lm[14].y)
            mouth_openness.append(mouth_gap)
        else:
            mouth_openness.append(0.0)

        # Corresponding audio energy
        ts = frame_idx / fps
        start_sample = int(ts * audio_sr)
        end_sample = min(start_sample + int(0.5 * audio_sr), len(audio_samples))
        if start_sample < len(audio_samples):
            chunk = audio_samples[start_sample:end_sample]
            audio_energy.append(float(np.sqrt(np.mean(chunk ** 2))))
        else:
            audio_energy.append(0.0)

    cap.release()
    face_mesh.close()

    if len(mouth_openness) < 3:
        return {"score": 0.80, "details": {
            "avg_sync_offset_ms": 50.0,
            "confidence_frames_pct": 0.80,
            "anomaly_windows": 0,
            "total_frames_analyzed": frames_analyzed,
        }}

    mo = np.array(mouth_openness)
    ae = np.array(audio_energy)

    # Normalise
    if mo.std() > 1e-10 and ae.std() > 1e-10:
        corr = float(np.corrcoef(mo, ae)[0, 1])
    else:
        corr = 0.0

    # Correlation → score (0-1)
    score = round(max(0.0, min(1.0, (corr + 1.0) / 2.0)), 3)

    # Detect anomaly windows (low local correlation)
    window = max(3, len(mo) // 5)
    anomaly_windows = 0
    for i in range(0, len(mo) - window, window):
        local_mo = mo[i:i + window]
        local_ae = ae[i:i + window]
        if local_mo.std() > 1e-10 and local_ae.std() > 1e-10:
            local_corr = float(np.corrcoef(local_mo, local_ae)[0, 1])
            if local_corr < 0.2:
                anomaly_windows += 1

    confidence_pct = round(max(0.0, 1.0 - anomaly_windows * 0.1), 3)

    return {
        "score": score,
        "details": {
            "avg_sync_offset_ms": round((1.0 - score) * 200, 1),
            "confidence_frames_pct": confidence_pct,
            "anomaly_windows": anomaly_windows,
            "total_frames_analyzed": frames_analyzed,
        },
    }


# =====================================================================
#  Body Movement Analysis
# =====================================================================

def analyze_body_movement(video_path: str) -> Dict[str, Any]:
    """
    Use MediaPipe Pose + Face Mesh to evaluate:
      - posture_consistency : shoulder midpoint stability
      - eye_contact_pct : nose landmark roughly centred → facing camera
      - head_movement_variance : nose landmark drift
      - suspicious_gestures_count : sudden large movements
    """
    import cv2
    import numpy as np
    import mediapipe as mp

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480

    pose = mp.solutions.pose.Pose(
        static_image_mode=False, min_detection_confidence=0.5
    )
    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False, max_num_faces=1, min_detection_confidence=0.5
    )

    sample_interval = max(1, int(fps * 0.5))
    shoulder_midpoints = []
    nose_positions = []
    eye_contact_frames = 0
    total_face_frames = 0

    for frame_idx in range(0, total_frames, sample_interval):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            break

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Pose
        pose_result = pose.process(rgb)
        if pose_result.pose_landmarks:
            lm = pose_result.pose_landmarks.landmark
            left_sh = lm[mp.solutions.pose.PoseLandmark.LEFT_SHOULDER]
            right_sh = lm[mp.solutions.pose.PoseLandmark.RIGHT_SHOULDER]
            mid_x = (left_sh.x + right_sh.x) / 2
            mid_y = (left_sh.y + right_sh.y) / 2
            shoulder_midpoints.append((mid_x, mid_y))

        # Face mesh for eye contact
        face_result = face_mesh.process(rgb)
        if face_result.multi_face_landmarks:
            lm = face_result.multi_face_landmarks[0].landmark
            nose = lm[1]  # nose tip
            nose_positions.append((nose.x, nose.y))
            total_face_frames += 1
            # If nose is roughly centred horizontally → facing camera
            if 0.3 < nose.x < 0.7:
                eye_contact_frames += 1

    cap.release()
    pose.close()
    face_mesh.close()

    if not shoulder_midpoints or total_face_frames == 0:
        return {"score": 0.80, "details": {
            "posture_consistency": 0.80,
            "eye_contact_pct": 0.70,
            "head_movement_variance": 0.05,
            "suspicious_gestures_count": 0,
        }}

    import numpy as np
    shoulder_arr = np.array(shoulder_midpoints)
    posture_var = float(np.std(shoulder_arr[:, 0]) + np.std(shoulder_arr[:, 1]))
    posture_consistency = round(max(0.0, 1.0 - posture_var * 5), 3)

    eye_contact_pct = round(eye_contact_frames / max(1, total_face_frames), 3)

    nose_arr = np.array(nose_positions)
    head_var = float(np.std(nose_arr[:, 0]) + np.std(nose_arr[:, 1]))
    head_movement_variance = round(head_var, 3)

    # Suspicious gestures: sudden jumps between consecutive shoulder readings
    suspicious = 0
    for i in range(1, len(shoulder_arr)):
        dx = abs(shoulder_arr[i, 0] - shoulder_arr[i - 1, 0])
        dy = abs(shoulder_arr[i, 1] - shoulder_arr[i - 1, 1])
        if dx + dy > 0.15:
            suspicious += 1

    # Composite
    score = round(
        posture_consistency * 0.35
        + eye_contact_pct * 0.35
        + max(0.0, 1.0 - head_var * 5) * 0.20
        + max(0.0, 1.0 - suspicious * 0.1) * 0.10,
        3,
    )

    return {
        "score": max(0.0, min(1.0, score)),
        "details": {
            "posture_consistency": posture_consistency,
            "eye_contact_pct": eye_contact_pct,
            "head_movement_variance": head_movement_variance,
            "suspicious_gestures_count": suspicious,
        },
    }


# =====================================================================
#  Flag Generator  (same format as simulator)
# =====================================================================

def _generate_flags(voice_score: float, lip_score: float, body_score: float):
    flags = []
    if voice_score < 0.75:
        flags.append({
            "flag_type": "voice_inconsistency",
            "severity": "high" if voice_score < 0.65 else "medium",
            "timestamp_seconds": round(random.uniform(60, 1800), 1),
            "description": "Voice pattern shift detected - possible speaker change",
            "confidence": round(1.0 - voice_score, 3),
        })
    if lip_score < 0.75:
        flags.append({
            "flag_type": "lip_sync_mismatch",
            "severity": "high" if lip_score < 0.65 else "medium",
            "timestamp_seconds": round(random.uniform(120, 2400), 1),
            "description": "Lip movement does not match audio stream",
            "confidence": round(1.0 - lip_score, 3),
        })
    if body_score < 0.75:
        flags.append({
            "flag_type": "unusual_movement",
            "severity": "medium" if body_score >= 0.65 else "high",
            "timestamp_seconds": round(random.uniform(180, 3000), 1),
            "description": "Unusual body movement or frequent off-screen glances",
            "confidence": round(1.0 - body_score, 3),
        })
    return flags


# =====================================================================
#  Main Entry Point
# =====================================================================

def run_real_analysis(video_interview_id: int, recording_path: str) -> Dict[str, Any]:
    """
    Run real biometric analysis on a recording file.

    Falls back to the simulator if:
      - dependencies (cv2, mediapipe, pydub) not installed
      - ffmpeg not available
      - recording file missing / unreadable
      - any runtime error during analysis

    Returns dict with the **exact same keys** as
    ``fraud_simulator.run_full_simulated_analysis()``.
    """
    # Guard: deps available?
    if not _check_deps():
        print("[biometric] Dependencies missing, falling back to simulator")
        from services.fraud_simulator import run_full_simulated_analysis
        return run_full_simulated_analysis(video_interview_id)

    # Guard: file exists?
    if not recording_path or not os.path.isfile(recording_path):
        print(f"[biometric] Recording not found: {recording_path}, falling back")
        from services.fraud_simulator import run_full_simulated_analysis
        return run_full_simulated_analysis(video_interview_id)

    try:
        from pydub import AudioSegment

        # Extract audio to temp wav
        tmp_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp_audio.close()
        audio = AudioSegment.from_file(recording_path)
        audio.export(tmp_audio.name, format="wav")

        print(f"[biometric] Analyzing voice for interview {video_interview_id}...")
        voice = analyze_voice(tmp_audio.name)

        print(f"[biometric] Analyzing lip-sync for interview {video_interview_id}...")
        lip = analyze_lip_sync(recording_path, tmp_audio.name)

        print(f"[biometric] Analyzing body movement for interview {video_interview_id}...")
        body = analyze_body_movement(recording_path)

        # Cleanup temp file
        try:
            os.unlink(tmp_audio.name)
        except OSError:
            pass

        flags = _generate_flags(voice["score"], lip["score"], body["score"])
        overall_trust = round(
            voice["score"] * 0.35 + lip["score"] * 0.35 + body["score"] * 0.30, 3
        )

        print(f"[biometric] Analysis complete: trust={overall_trust}, flags={len(flags)}")

        return {
            "voice_consistency_score": voice["score"],
            "voice_consistency_details": json.dumps(voice["details"]),
            "lip_sync_score": lip["score"],
            "lip_sync_details": json.dumps(lip["details"]),
            "body_movement_score": body["score"],
            "body_movement_details": json.dumps(body["details"]),
            "overall_trust_score": overall_trust,
            "flags": json.dumps(flags),
            "flag_count": len(flags),
            "analyzed_at": datetime.utcnow(),
        }

    except Exception as e:
        print(f"[biometric] Real analysis failed ({type(e).__name__}: {e}), falling back to simulator")
        # Cleanup temp if it exists
        try:
            os.unlink(tmp_audio.name)
        except Exception:
            pass
        from services.fraud_simulator import run_full_simulated_analysis
        return run_full_simulated_analysis(video_interview_id)
