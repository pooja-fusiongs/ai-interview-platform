"""
Speaker Diarization Service using PyAnnote.
Identifies who spoke when in interview recordings.
Falls back gracefully if PyAnnote is not installed or configured.
"""

import os
import logging
import tempfile
import subprocess
from typing import List, Dict, Optional

import config

logger = logging.getLogger(__name__)


class DiarizationError(Exception):
    pass


def diarize_audio(recording_path: str) -> List[Dict]:
    """
    Run PyAnnote speaker diarization on an audio/video file.

    Returns: [{"start": 0.5, "end": 3.2, "speaker": "SPEAKER_00"}, ...]
    """
    if not config.HUGGINGFACE_TOKEN:
        raise DiarizationError("HUGGINGFACE_TOKEN not configured in .env")

    wav_path = None
    try:
        wav_path = _extract_wav(recording_path)
        segments = _run_pyannote(wav_path)
        logger.info(f"[diarization] Got {len(segments)} speaker segments")
        return segments
    except DiarizationError:
        raise
    except Exception as e:
        raise DiarizationError(f"Diarization failed: {e}")
    finally:
        if wav_path and os.path.exists(wav_path):
            try:
                os.unlink(wav_path)
            except OSError:
                pass


def _extract_wav(video_path: str) -> str:
    """Extract 16kHz mono WAV from video/audio file (PyAnnote requirement)."""
    ffmpeg_bin = "ffmpeg"
    try:
        import imageio_ffmpeg
        ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass

    output_path = os.path.join(
        tempfile.gettempdir(),
        f"diarize_{os.path.splitext(os.path.basename(video_path))[0]}.wav"
    )

    result = subprocess.run(
        [ffmpeg_bin, "-y", "-i", video_path,
         "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", output_path],
        capture_output=True, text=True, timeout=300,
    )

    if result.returncode != 0 or not os.path.exists(output_path):
        raise DiarizationError(f"WAV extraction failed: {result.stderr[-300:]}")

    return output_path


def _run_pyannote(wav_path: str) -> List[Dict]:
    """Run PyAnnote diarization pipeline."""
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=config.HUGGINGFACE_TOKEN,
    )

    # num_speakers=2: interviewer + candidate
    diarization = pipeline(wav_path, num_speakers=2)

    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            "start": round(turn.start, 3),
            "end": round(turn.end, 3),
            "speaker": speaker,
        })

    if not segments:
        raise DiarizationError("PyAnnote returned no speaker segments")

    return segments


def assign_speaker_roles(segments: List[Dict]) -> Dict[str, str]:
    """
    Map SPEAKER_00/SPEAKER_01 to Recruiter/Candidate.
    Heuristic: the speaker who talks MORE is the Recruiter (they ask questions + guide the interview).
    Tiebreaker: first speaker = Recruiter.
    """
    if not segments:
        return {}

    speakers = sorted(set(s["speaker"] for s in segments))
    if len(speakers) == 1:
        return {speakers[0]: "Recruiter"}

    # Calculate total talk time per speaker
    talk_time: Dict[str, float] = {}
    for s in segments:
        dur = s.get("end", 0) - s.get("start", 0)
        talk_time[s["speaker"]] = talk_time.get(s["speaker"], 0) + dur

    # Speaker with more talk time = Recruiter (they explain, ask questions, guide)
    sorted_speakers = sorted(speakers, key=lambda spk: talk_time.get(spk, 0), reverse=True)
    recruiter_speaker = sorted_speakers[0]

    role_map = {}
    for spk in speakers:
        role_map[spk] = "Recruiter" if spk == recruiter_speaker else "Candidate"

    print(f"[speaker_diarization] Role assignment: {role_map} (talk_time: {talk_time})")
    return role_map


def align_transcript_with_diarization(
    whisper_segments: List[Dict],
    diarization_segments: List[Dict],
    role_map: Dict[str, str],
) -> str:
    """
    Combine Whisper timestamped segments with PyAnnote speaker labels.

    Args:
        whisper_segments: [{"start": float, "end": float, "text": str}, ...]
        diarization_segments: [{"start": float, "end": float, "speaker": str}, ...]
        role_map: {"SPEAKER_00": "Recruiter", "SPEAKER_01": "Candidate"}

    Returns: Formatted transcript with speaker labels
    """
    lines = []
    prev_role = None

    for wseg in whisper_segments:
        mid_time = (wseg["start"] + wseg["end"]) / 2.0
        speaker_id = _find_speaker_at_time(mid_time, diarization_segments)
        role = role_map.get(speaker_id, "Speaker") if speaker_id else "Speaker"

        text = wseg.get("text", "").strip()
        if not text:
            continue

        if role != prev_role:
            lines.append(f"\n{role}: {text}")
            prev_role = role
        else:
            lines.append(f" {text}")

    return "".join(lines).strip()


def _find_speaker_at_time(t: float, segments: List[Dict]) -> Optional[str]:
    """Find which speaker was talking at time t."""
    for seg in segments:
        if seg["start"] <= t <= seg["end"]:
            return seg["speaker"]
    # Closest segment if between gaps
    best = None
    best_dist = float("inf")
    for seg in segments:
        dist = min(abs(seg["start"] - t), abs(seg["end"] - t))
        if dist < best_dist:
            best_dist = dist
            best = seg["speaker"]
    return best
