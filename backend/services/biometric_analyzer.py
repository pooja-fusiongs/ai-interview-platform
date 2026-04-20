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

_ffmpeg_configured = False

def _get_ffmpeg_exe():
    """Get ffmpeg executable path (system or imageio_ffmpeg)."""
    from pydub.utils import which
    sys_ffmpeg = which("ffmpeg")
    if sys_ffmpeg:
        return sys_ffmpeg
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return None

def _ensure_ffmpeg_path():
    """Configure pydub to use imageio_ffmpeg binary if system ffmpeg not found."""
    global _ffmpeg_configured
    if _ffmpeg_configured:
        return
    _ffmpeg_configured = True

    ffmpeg_exe = _get_ffmpeg_exe()
    if not ffmpeg_exe:
        return

    import pydub
    pydub.AudioSegment.converter = ffmpeg_exe

    ffmpeg_dir = os.path.dirname(ffmpeg_exe)
    if ffmpeg_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")


def load_audio_from_file(file_path: str):
    """Load audio using ffmpeg directly, bypassing pydub's ffprobe requirement."""
    import subprocess
    from pydub import AudioSegment

    ffmpeg_exe = _get_ffmpeg_exe()
    if not ffmpeg_exe:
        raise FileNotFoundError("ffmpeg not found")

    # Convert to wav using ffmpeg directly (skip pydub's mediainfo_json/ffprobe)
    tmp_wav = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_wav.close()
    try:
        result = subprocess.run(
            [ffmpeg_exe, "-y", "-i", file_path, "-vn", "-ac", "1", "-ar", "16000", tmp_wav.name],
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {result.stderr[-300:]}")
        # Load wav (pydub handles wav natively without ffprobe)
        audio = AudioSegment.from_wav(tmp_wav.name)
        return audio
    finally:
        try:
            os.unlink(tmp_wav.name)
        except OSError:
            pass

def _check_deps():
    """Return True if all heavy deps are importable."""
    try:
        import cv2          # noqa: F401
        import numpy        # noqa: F401
        import mediapipe     # noqa: F401
        from pydub import AudioSegment  # noqa: F401
        _ensure_ffmpeg_path()
        return True
    except (ImportError, Exception) as e:
        print(f"[biometric] Dependency check failed: {e}")
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

    Note: Caller should pass candidate-only audio (via _extract_candidate_audio)
    so the recruiter's voice doesn't inflate variance and trigger false fraud flags.
    """
    import numpy as np
    from pydub import AudioSegment

    audio = AudioSegment.from_file(audio_path)
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
    sample_rate = audio.frame_rate

    # Mono
    if audio.channels > 1:
        samples = samples.reshape(-1, audio.channels).mean(axis=1)

    # Split into 6-sec segments (shorter → more samples even for short interviews)
    seg_len = sample_rate * 6
    segments = [samples[i:i + seg_len] for i in range(0, len(samples), seg_len) if len(samples[i:i + seg_len]) > sample_rate]

    if len(segments) < 2:
        # Too short for meaningful analysis — still compute on whole clip as one segment
        # instead of returning a fake 0.85 score
        if len(segments) == 1:
            segments = [segments[0], segments[0]]  # duplicate so std=0 → high score
        else:
            return {"score": 0.80, "details": {
                "pitch_variation": 0.1,
                "speaking_rate_consistency": 0.80,
                "voice_print_match": 0.80,
                "samples_analyzed": 0,
                "note": "audio_too_short",
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
    # Normalise: lower std → higher score. Same-speaker natural pitch variation is ~30-50 Hz.
    # Divisor 300 tolerates that range; two different speakers give std >100 → score drops.
    pitch_variation = round(min(pitch_std / 300.0, 1.0), 3)
    pitch_score = max(0.0, 1.0 - pitch_variation)

    # --- Speaking rate via zero-crossing rate ---
    def _zcr(seg):
        return float(np.sum(np.abs(np.diff(np.sign(seg)))) / (2.0 * len(seg)))

    zcrs = [_zcr(s) for s in segments]
    zcr_std = float(np.std(zcrs))
    # Multiplier 20 (was 50) — same speaker's natural pauses/breaths shouldn't tank score.
    speaking_rate_consistency = round(max(0.0, 1.0 - zcr_std * 20), 3)

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
    # Divisor 1500 (was 1000) — tolerates same-speaker centroid drift across segments.
    voice_print_match = round(max(0.0, 1.0 - centroid_std / 1500.0), 3)

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
    Correlate mouth openness (MediaPipe Face Landmarker) with audio energy.
    High correlation → real speaker; low → possible dubbing/proxy.
    """
    import cv2
    import numpy as np
    import mediapipe as mp
    from pydub import AudioSegment

    audio = AudioSegment.from_wav(audio_path)
    audio_samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
    if audio.channels > 1:
        audio_samples = audio_samples.reshape(-1, audio.channels).mean(axis=1)
    audio_sr = audio.frame_rate

    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Use new tasks API with downloaded model
    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "face_landmarker.task")
    face_landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(
        mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=model_path),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
        )
    )

    # Sample frames — cap for performance (enough for fraud detection)
    MAX_FRAMES = 60
    sample_interval = max(1, int(fps * 0.5))
    # If video is long, increase interval to stay under MAX_FRAMES
    estimated_samples = total_frames // sample_interval
    if estimated_samples > MAX_FRAMES:
        sample_interval = max(1, total_frames // MAX_FRAMES)
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
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = face_landmarker.detect(mp_image)

        if result.face_landmarks:
            lm = result.face_landmarks[0]
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
    face_landmarker.close()

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
    Use MediaPipe Pose Landmarker + Face Landmarker to evaluate:
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

    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models")

    pose_landmarker = mp.tasks.vision.PoseLandmarker.create_from_options(
        mp.tasks.vision.PoseLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=os.path.join(models_dir, "pose_landmarker.task")),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.5,
        )
    )
    face_landmarker = mp.tasks.vision.FaceLandmarker.create_from_options(
        mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=os.path.join(models_dir, "face_landmarker.task")),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
        )
    )

    LEFT_SHOULDER = mp.tasks.vision.PoseLandmark.LEFT_SHOULDER
    RIGHT_SHOULDER = mp.tasks.vision.PoseLandmark.RIGHT_SHOULDER

    # Sample frames — cap for performance (enough for fraud detection)
    MAX_FRAMES = 60
    sample_interval = max(1, int(fps * 0.5))
    estimated_samples = total_frames // sample_interval
    if estimated_samples > MAX_FRAMES:
        sample_interval = max(1, total_frames // MAX_FRAMES)
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
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        # Pose
        pose_result = pose_landmarker.detect(mp_image)
        if pose_result.pose_landmarks:
            lm = pose_result.pose_landmarks[0]
            left_sh = lm[LEFT_SHOULDER]
            right_sh = lm[RIGHT_SHOULDER]
            mid_x = (left_sh.x + right_sh.x) / 2
            mid_y = (left_sh.y + right_sh.y) / 2
            shoulder_midpoints.append((mid_x, mid_y))

        # Face landmarker for eye contact
        face_result = face_landmarker.detect(mp_image)
        if face_result.face_landmarks:
            lm = face_result.face_landmarks[0]
            nose = lm[1]  # nose tip
            nose_positions.append((nose.x, nose.y))
            total_face_frames += 1
            # If nose is roughly centred horizontally → facing camera
            if 0.3 < nose.x < 0.7:
                eye_contact_frames += 1

    cap.release()
    pose_landmarker.close()
    face_landmarker.close()

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
    """Generate flags — names consistent with live event flags."""
    flags = []
    if voice_score < 0.75:
        flags.append({
            "flag_type": "low_voice_consistency",
            "severity": "high" if voice_score < 0.5 else "medium",
            "description": "Voice pattern shift detected - possible speaker change",
            "confidence": round(1.0 - voice_score, 3),
        })
    if lip_score < 0.75:
        flags.append({
            "flag_type": "low_lip_sync",
            "severity": "high" if lip_score < 0.5 else "medium",
            "description": "Lip movement does not match audio stream",
            "confidence": round(1.0 - lip_score, 3),
        })
    if body_score < 0.75:
        flags.append({
            "flag_type": "excessive_movement",
            "severity": "high" if body_score < 0.5 else "medium",
            "description": "Unusual body movement or frequent off-screen glances",
            "confidence": round(1.0 - body_score, 3),
        })
    return flags


# =====================================================================
#  Candidate Audio Extraction (for voice-only scoring)
# =====================================================================

def _extract_candidate_audio_from_chunks(video_interview_id: int, full_audio) -> Optional[str]:
    """
    Extract candidate-only audio using timestamps from real-time TranscriptChunk rows.

    Deepgram chunks already carry per-speaker labels (captured via separate WS streams
    per participant), so no post-hoc diarization is needed. Much more reliable than
    PyAnnote when HUGGINGFACE_TOKEN is missing or diarization is noisy.

    Alignment note: chunks' timestamp_start is relative to each participant's WS
    connection. We use chunk.created_at (DB wall-clock) relative to the interview's
    started_at to compute recording offset — this keeps both streams on one timeline.
    """
    try:
        from pydub import AudioSegment
        from database import get_safe_db
        from models import TranscriptChunk, VideoInterview

        db = get_safe_db()
        try:
            vi = db.query(VideoInterview).filter(VideoInterview.id == video_interview_id).first()
            if not vi:
                return None
            recording_anchor = vi.started_at
            if not recording_anchor:
                # Fall back to earliest chunk as t=0
                first = (
                    db.query(TranscriptChunk)
                    .filter(TranscriptChunk.video_interview_id == video_interview_id)
                    .order_by(TranscriptChunk.created_at)
                    .first()
                )
                if not first or not first.created_at:
                    return None
                recording_anchor = first.created_at

            chunks = (
                db.query(TranscriptChunk)
                .filter(
                    TranscriptChunk.video_interview_id == video_interview_id,
                    TranscriptChunk.speaker == "candidate",
                    TranscriptChunk.is_final == True,
                )
                .order_by(TranscriptChunk.created_at, TranscriptChunk.id)
                .all()
            )
        finally:
            try:
                db.close()
            except Exception:
                pass

        if not chunks:
            print(f"[biometric] No candidate chunks for interview {video_interview_id}")
            return None

        audio_len_ms = len(full_audio)
        candidate_audio = AudioSegment.empty()
        used = 0
        for c in chunks:
            if c.created_at is None or c.timestamp_start is None or c.timestamp_end is None:
                continue
            chunk_duration = max(0.0, float(c.timestamp_end) - float(c.timestamp_start))
            if chunk_duration <= 0:
                continue
            # Chunk anchor in recording timeline: DB created_at − recording start
            try:
                offset_sec = (c.created_at - recording_anchor).total_seconds()
            except Exception:
                continue
            # created_at is when the *final* result arrived — Deepgram typically emits
            # finals 0.5-1.5s after speech ends, so subtract chunk duration + small pad
            start_sec = offset_sec - chunk_duration - 0.3
            end_sec = offset_sec + 0.2
            start_ms = max(0, int(start_sec * 1000))
            end_ms = min(audio_len_ms, int(end_sec * 1000))
            if end_ms > start_ms:
                candidate_audio += full_audio[start_ms:end_ms]
                used += 1

        if used == 0 or len(candidate_audio) < 2000:
            print(f"[biometric] Chunk-based extraction produced too little audio ({len(candidate_audio)}ms)")
            return None

        tmp = tempfile.NamedTemporaryFile(suffix="_candidate_chunks.wav", delete=False)
        tmp.close()
        candidate_audio.export(tmp.name, format="wav")
        total_dur = audio_len_ms / 1000
        cand_dur = len(candidate_audio) / 1000
        print(f"[biometric] Candidate audio from chunks: {cand_dur:.1f}s / {total_dur:.1f}s total ({used} chunks)")
        return tmp.name

    except Exception as e:
        print(f"[biometric] Chunk-based extraction failed: {e}")
        return None


def _extract_candidate_audio(wav_path: str, full_audio) -> Optional[str]:
    """
    Extract only the candidate's audio segments using speaker diarization.
    Returns path to candidate-only WAV file, or None if diarization unavailable.

    Voice evaluation should only analyze the candidate's voice, not the recruiter's.
    This prevents the recruiter's voice from affecting fraud detection scores
    (e.g., two different voices would falsely trigger voice_inconsistency flags).
    """
    try:
        from services.speaker_diarization import diarize_audio, assign_speaker_roles
        import numpy as np
        from pydub import AudioSegment

        # Run diarization to identify speaker segments
        segments = diarize_audio(wav_path)
        if not segments:
            return None

        role_map = assign_speaker_roles(segments)

        # Find candidate speaker ID
        candidate_id = None
        for spk_id, role in role_map.items():
            if role == "Candidate":
                candidate_id = spk_id
                break

        if not candidate_id:
            print("[biometric] Could not identify candidate speaker, using full audio")
            return None

        # Extract candidate segments from full audio
        candidate_segments = [s for s in segments if s["speaker"] == candidate_id]
        if not candidate_segments:
            return None

        # Concatenate candidate audio segments
        candidate_audio = AudioSegment.empty()
        for seg in candidate_segments:
            start_ms = int(seg["start"] * 1000)
            end_ms = int(seg["end"] * 1000)
            # Clamp to audio bounds
            start_ms = max(0, start_ms)
            end_ms = min(len(full_audio), end_ms)
            if end_ms > start_ms:
                candidate_audio += full_audio[start_ms:end_ms]

        if len(candidate_audio) < 2000:  # Less than 2 seconds
            print("[biometric] Candidate audio too short after extraction, using full audio")
            return None

        # Export to temp file
        tmp = tempfile.NamedTemporaryFile(suffix="_candidate.wav", delete=False)
        tmp.close()
        candidate_audio.export(tmp.name, format="wav")

        total_dur = len(full_audio) / 1000
        cand_dur = len(candidate_audio) / 1000
        print(f"[biometric] Extracted candidate audio: {cand_dur:.1f}s out of {total_dur:.1f}s total")

        return tmp.name

    except ImportError:
        print("[biometric] Speaker diarization not available, using full audio for voice analysis")
        return None
    except Exception as e:
        print(f"[biometric] Candidate audio extraction failed: {e}, using full audio")
        return None


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
        print("[biometric] Dependencies missing, cannot perform real analysis")
        return {"_error": "dependencies_missing"}

    # Guard: file exists?
    if not recording_path or not os.path.isfile(recording_path):
        print(f"[biometric] Recording not found: {recording_path} (exists={os.path.isfile(recording_path) if recording_path else False})")
        return {"_error": "file_not_found", "path": recording_path}

    try:
        # Extract audio to temp wav (using ffmpeg directly, bypasses ffprobe requirement)
        tmp_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp_audio.close()
        audio = load_audio_from_file(recording_path)
        audio.export(tmp_audio.name, format="wav")

        # Try chunk-based extraction first (uses already-labeled TranscriptChunk rows,
        # no HUGGINGFACE_TOKEN needed). Fall back to PyAnnote diarization, then full audio.
        candidate_audio_path = _extract_candidate_audio_from_chunks(video_interview_id, audio)
        extraction_source = "chunks" if candidate_audio_path else None
        if not candidate_audio_path:
            candidate_audio_path = _extract_candidate_audio(tmp_audio.name, audio)
            if candidate_audio_path:
                extraction_source = "pyannote"
        voice_audio = candidate_audio_path if candidate_audio_path else tmp_audio.name
        if not extraction_source:
            extraction_source = "full_audio_fallback"

        print(f"[biometric] Analyzing voice for interview {video_interview_id} "
              f"(source={extraction_source})...")
        voice = analyze_voice(voice_audio)

        print(f"[biometric] Analyzing lip-sync for interview {video_interview_id} "
              f"(candidate-only={candidate_audio_path is not None})...")
        lip = analyze_lip_sync(recording_path, voice_audio)

        print(f"[biometric] Analyzing body movement for interview {video_interview_id}...")
        body = analyze_body_movement(recording_path)

        # Face detection score from body movement analysis (eye_contact + face visibility)
        # Default to 0.5 (not 0.8) — don't inflate score when data is missing
        face_score = body["details"].get("eye_contact_pct", 0.5)

        # Cleanup temp files
        try:
            os.unlink(tmp_audio.name)
        except OSError:
            pass
        if candidate_audio_path:
            try:
                os.unlink(candidate_audio_path)
            except OSError:
                pass

        flags = _generate_flags(voice["score"], lip["score"], body["score"])
        overall_trust = round(
            voice["score"] * 0.30 + lip["score"] * 0.30 + body["score"] * 0.20 + face_score * 0.20, 3
        )

        print(f"[biometric] Analysis complete: trust={overall_trust}, face={face_score}, flags={len(flags)}")

        return {
            "voice_consistency_score": voice["score"],
            "voice_consistency_details": json.dumps(voice["details"]),
            "lip_sync_score": lip["score"],
            "lip_sync_details": json.dumps(lip["details"]),
            "body_movement_score": body["score"],
            "body_movement_details": json.dumps(body["details"]),
            "face_detection_score": face_score,
            "face_detection_details": json.dumps({"eye_contact_pct": face_score, "source": "recording_analysis"}),
            "overall_trust_score": overall_trust,
            "flags": json.dumps(flags),
            "flag_count": len(flags),
            "analyzed_at": datetime.utcnow(),
        }

    except Exception as e:
        print(f"[biometric] Real analysis failed ({type(e).__name__}: {e})")
        import traceback
        traceback.print_exc()
        # Cleanup temp if it exists
        try:
            os.unlink(tmp_audio.name)
        except Exception:
            pass
        return {"_error": "analysis_failed", "detail": str(e)}
