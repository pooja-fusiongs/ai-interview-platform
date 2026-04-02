"""
Real Transcript Generator Service.

ONLY generates real transcripts from actual interview recordings.
No mock/simulated data - all transcripts must come from real speech-to-text.
"""

import os
import logging
import time
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
import config

logger = logging.getLogger(__name__)

class TranscriptionError(Exception):
    """Custom exception for transcription failures"""
    pass

def transcribe_audio_file(file_path: str) -> str:
    """
    Transcribe audio/video file using real speech-to-text.
    
    Args:
        file_path: Path to the audio/video file
        
    Returns:
        Transcribed text
        
    Raises:
        TranscriptionError: If transcription fails
    """
    if not os.path.exists(file_path):
        raise TranscriptionError(f"Recording file not found: {file_path}")
    
    file_size = os.path.getsize(file_path)
    if file_size < 1000:
        raise TranscriptionError(f"Recording file too small ({file_size} bytes), no valid audio")
    
    logger.info(f"[transcribe] Starting real transcription of {os.path.basename(file_path)} ({file_size} bytes)")

    # Try both services and use the one that captured more words
    groq_result = None
    deepgram_result = None

    if config.DEEPGRAM_API_KEY:
        try:
            deepgram_result = _transcribe_with_deepgram(file_path)
            logger.info(f"[transcribe] DeepGram: {len(deepgram_result.split())} words")
        except TranscriptionError as e:
            logger.warning(f"[transcribe] DeepGram failed: {e}")

    if config.GROQ_API_KEY:
        try:
            groq_result = _transcribe_with_groq(file_path)
            logger.info(f"[transcribe] Groq Whisper: {len(groq_result.split())} words")
        except TranscriptionError as e:
            logger.warning(f"[transcribe] Groq failed: {e}")

    # Use the result with more words (more complete transcript)
    if groq_result and deepgram_result:
        groq_words = len(groq_result.split())
        dg_words = len(deepgram_result.split())
        if dg_words > groq_words:
            logger.info(f"[transcribe] Using DeepGram ({dg_words} > {groq_words} words)")
            return deepgram_result
        else:
            logger.info(f"[transcribe] Using Groq ({groq_words} >= {dg_words} words)")
            return groq_result
    elif deepgram_result:
        return deepgram_result
    elif groq_result:
        return groq_result

    raise TranscriptionError("Transcription failed. Check GROQ_API_KEY and DEEPGRAM_API_KEY in .env")


def transcribe_audio_file_with_timestamps(file_path: str) -> tuple:
    """
    Transcribe and return BOTH raw text AND timestamped segments.
    Used for PyAnnote alignment.

    Returns: (raw_text: str, segments: List[Dict])
        segments: [{"start": float, "end": float, "text": str}, ...]
    Falls back to (raw_text, []) if timestamps unavailable.
    """
    if not os.path.exists(file_path):
        raise TranscriptionError(f"Recording file not found: {file_path}")

    file_size = os.path.getsize(file_path)
    if file_size < 1000:
        raise TranscriptionError(f"Recording file too small ({file_size} bytes)")

    if not config.GROQ_API_KEY:
        raise TranscriptionError("GROQ_API_KEY not configured")

    temp_file = None
    try:
        from groq import Groq
        client = Groq(api_key=config.GROQ_API_KEY)

        file_ext = os.path.splitext(file_path)[1].lower()
        video_extensions = {'.mp4', '.mpeg', '.webm'}
        file_size_mb = file_size / (1024 * 1024)

        # Extract audio if large video
        upload_path = file_path
        if file_ext in video_extensions and file_size_mb > 24:
            try:
                upload_path = _extract_audio_from_video(file_path)
                temp_file = upload_path
            except Exception:
                upload_path = file_path

        logger.info(f"[transcribe+timestamps] Using verbose_json for {os.path.basename(file_path)}")

        # Request verbose_json for timestamps
        with open(upload_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                file=(os.path.basename(upload_path), audio_file),
                model="whisper-large-v3-turbo",
                language="en",
                response_format="verbose_json",
                temperature=0.0,
            )

        # Parse response — verbose_json returns segments with timestamps
        raw_text = ""
        segments = []

        if hasattr(response, 'text'):
            raw_text = response.text.strip()
        if hasattr(response, 'segments') and response.segments:
            for seg in response.segments:
                segments.append({
                    "start": getattr(seg, 'start', 0),
                    "end": getattr(seg, 'end', 0),
                    "text": getattr(seg, 'text', '').strip(),
                })

        if not raw_text:
            raise TranscriptionError("Empty transcription result")

        logger.info(f"[transcribe+timestamps] Got {len(segments)} segments, {len(raw_text)} chars")
        return raw_text, segments

    except TranscriptionError:
        raise
    except Exception as e:
        raise TranscriptionError(f"Timestamped transcription failed: {e}")
    finally:
        # Always clean up temp file (even on exception)
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
            except OSError:
                pass


def _extract_audio_from_video(video_path: str) -> str:
    """
    Extract full audio from video as a single compressed MP3 file using ffmpeg.
    Handles Chrome-recorded .webm files that have Duration: N/A (no duration header).
    Returns path to the extracted audio file.
    """
    import tempfile
    import subprocess

    # Find ffmpeg binary (bundled with imageio-ffmpeg or system PATH)
    ffmpeg_bin = None
    try:
        import imageio_ffmpeg
        ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass

    if not ffmpeg_bin:
        # Try system ffmpeg
        ffmpeg_bin = "ffmpeg"

    output_path = os.path.join(
        tempfile.gettempdir(),
        f"audio_{os.path.splitext(os.path.basename(video_path))[0]}.mp3"
    )

    logger.info(f"[transcribe] Extracting audio from video using ffmpeg: {os.path.basename(video_path)}")

    try:
        result = subprocess.run(
            [
                ffmpeg_bin, "-y",
                "-i", video_path,
                "-vn",                  # No video
                "-ac", "1",             # Mono
                "-ar", "16000",         # 16kHz sample rate (optimal for Whisper)
                "-b:a", "96k",          # Higher bitrate for better word capture
                "-f", "mp3",
                output_path
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            logger.warning(f"[transcribe] ffmpeg stderr: {result.stderr[-500:]}")
            raise TranscriptionError(f"ffmpeg audio extraction failed (exit code {result.returncode})")

        if not os.path.exists(output_path) or os.path.getsize(output_path) < 1000:
            raise TranscriptionError("ffmpeg produced no valid audio output")

        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        logger.info(f"[transcribe] Audio extracted: {size_mb:.1f} MB")
        return output_path

    except subprocess.TimeoutExpired:
        raise TranscriptionError("ffmpeg audio extraction timed out (>5 min)")
    except FileNotFoundError:
        raise TranscriptionError("ffmpeg not found. Install ffmpeg or pip install imageio-ffmpeg")


def _transcribe_with_deepgram(file_path: str) -> str:
    """
    Transcribe using Deepgram pre-recorded API (fallback).
    Fast and reliable REST API.
    """
    import requests

    api_key = config.DEEPGRAM_API_KEY
    if not api_key:
        raise TranscriptionError("Deepgram API key not configured")

    url = "https://api.deepgram.com/v1/listen"
    params = {
        "model": "nova-2",
        "smart_format": "true",
        "punctuate": "true",
        "diarize": "true",
        "language": "en",
    }
    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "application/octet-stream",
    }

    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    logger.info(f"[transcribe] Using Deepgram for {os.path.basename(file_path)} ({file_size_mb:.1f} MB)")

    try:
        with open(file_path, "rb") as f:
            response = requests.post(url, params=params, headers=headers, data=f, timeout=120)

        if response.status_code != 200:
            raise TranscriptionError(f"Deepgram API error {response.status_code}: {response.text[:200]}")

        result = response.json()
        channels = result.get("results", {}).get("channels", [])
        if not channels:
            raise TranscriptionError("Deepgram returned no channels")

        alternatives = channels[0].get("alternatives", [])
        if not alternatives:
            raise TranscriptionError("Deepgram returned no alternatives")

        transcript = alternatives[0].get("transcript", "")
        if not transcript or len(transcript.strip()) < 10:
            raise TranscriptionError("Deepgram transcript too short or empty")

        logger.info(f"[transcribe] Deepgram transcription successful ({len(transcript)} chars)")
        return transcript.strip()

    except requests.exceptions.RequestException as e:
        raise TranscriptionError(f"Deepgram connection error: {e}")
    except TranscriptionError:
        raise
    except Exception as e:
        raise TranscriptionError(f"Deepgram transcription failed: {e}")


def transcribe_with_deepgram_diarized(file_path: str) -> Optional[str]:
    """
    Transcribe using Deepgram with speaker diarization.
    Returns transcript with Recruiter:/Candidate: labels.
    Returns None if diarization data not available.
    """
    import requests

    api_key = config.DEEPGRAM_API_KEY
    if not api_key:
        return None

    url = "https://api.deepgram.com/v1/listen"
    params = {
        "model": "nova-2",
        "smart_format": "true",
        "punctuate": "true",
        "diarize": "true",
        "language": "en",
    }
    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": "application/octet-stream",
    }

    try:
        with open(file_path, "rb") as f:
            response = requests.post(url, params=params, headers=headers, data=f, timeout=120)

        if response.status_code != 200:
            logger.warning(f"[diarized] Deepgram API error {response.status_code}")
            return None

        result = response.json()
        channels = result.get("results", {}).get("channels", [])
        if not channels:
            return None

        alternatives = channels[0].get("alternatives", [])
        if not alternatives:
            return None

        words = alternatives[0].get("words", [])
        if not words or len(words) < 5:
            return None

        # Group words by speaker first, then determine roles
        all_speakers = set(w.get("speaker", 0) for w in words)

        # Build raw speaker segments
        raw_lines = []  # [(speaker_id, text), ...]
        current_speaker_id = None
        current_words = []

        for word_info in words:
            speaker_id = word_info.get("speaker", 0)
            word_text = word_info.get("punctuated_word", word_info.get("word", ""))

            if speaker_id != current_speaker_id:
                if current_words and current_speaker_id is not None:
                    raw_lines.append((current_speaker_id, " ".join(current_words)))
                current_speaker_id = speaker_id
                current_words = [word_text]
            else:
                current_words.append(word_text)

        if current_words and current_speaker_id is not None:
            raw_lines.append((current_speaker_id, " ".join(current_words)))

        # Determine roles: Recruiter asks questions (more "?"), Candidate gives answers
        question_count = {}
        for speaker_id, text in raw_lines:
            question_count[speaker_id] = question_count.get(speaker_id, 0) + text.count("?")

        # Speaker with more question marks = Recruiter
        speaker_role_map = {}
        if len(all_speakers) >= 2:
            sorted_by_questions = sorted(all_speakers, key=lambda s: question_count.get(s, 0), reverse=True)
            speaker_role_map[sorted_by_questions[0]] = "Recruiter"
            for spk in sorted_by_questions[1:]:
                speaker_role_map[spk] = "Candidate"
        elif len(all_speakers) == 1:
            speaker_role_map[list(all_speakers)[0]] = "Speaker"

        logger.info(f"[diarized] Speaker roles: {speaker_role_map}, questions per speaker: {question_count}")

        # Build labeled transcript
        lines = []
        for speaker_id, text in raw_lines:
            role = speaker_role_map.get(speaker_id, "Speaker")
            lines.append(f"{role}: {text}")

        if not lines:
            return None

        labeled_transcript = "\n".join(lines)
        logger.info(f"[diarized] Deepgram diarized transcript: {len(lines)} speaker turns, {len(labeled_transcript)} chars")
        return labeled_transcript

    except Exception as e:
        logger.warning(f"[diarized] Deepgram diarization failed: {e}")
        return None


def _transcribe_with_groq(file_path: str) -> str:
    """
    Transcribe using Groq Whisper API.
    For video files, extracts audio as small chunks and transcribes each.
    """
    try:
        from groq import Groq
        client = Groq(api_key=config.GROQ_API_KEY)

        file_ext = os.path.splitext(file_path)[1].lower()

        supported_extensions = {'.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.ogg', '.wav', '.webm', '.flac'}
        if file_ext not in supported_extensions:
            raise TranscriptionError(
                f"Unsupported format {file_ext}. "
                f"Supported: mp3, mp4, m4a, ogg, wav, webm, flac"
            )

        # For video files: extract audio first (handles Chrome webm with no duration header)
        # For audio files: send directly
        video_extensions = {'.mp4', '.mpeg', '.webm'}
        temp_files = []
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)

        if file_ext in video_extensions:
            if file_size_mb > 24:
                # Large video — must extract audio (Groq 25MB limit)
                logger.info(f"[transcribe] Large video ({file_size_mb:.1f} MB), extracting audio...")
                try:
                    audio_path = _extract_audio_from_video(file_path)
                    temp_files = [audio_path]
                    files_to_transcribe = temp_files
                except Exception as extract_err:
                    logger.warning(f"[transcribe] Audio extraction failed: {extract_err}, trying direct upload...")
                    temp_files = []
                    files_to_transcribe = [file_path]
            else:
                # Small video — try direct upload first (faster)
                files_to_transcribe = [file_path]
        else:
            # Audio file — send directly
            files_to_transcribe = [file_path]

        # Transcribe each chunk
        all_text = []
        model_name = "whisper-large-v3-turbo"  # Turbo is faster and handles chunks better

        for idx, chunk_path in enumerate(files_to_transcribe):
            chunk_size = os.path.getsize(chunk_path) / (1024 * 1024)
            logger.info(f"[transcribe] Transcribing chunk {idx+1}/{len(files_to_transcribe)} ({chunk_size:.1f} MB) with {model_name}")

            # Use original filename for direct uploads, "audio.mp3" for extracted chunks
            upload_filename = os.path.basename(chunk_path) if temp_files else os.path.basename(file_path)

            # Retry loop with exponential backoff for connection errors
            chunk_transcribed = False
            for attempt in range(3):
                try:
                    with open(chunk_path, "rb") as audio_file:
                        transcription = client.audio.transcriptions.create(
                            file=(upload_filename, audio_file),
                            model=model_name,
                            language="en",
                            response_format="text",
                            temperature=0.0,
                        )
                    chunk_text = transcription.strip() if isinstance(transcription, str) else str(transcription).strip()
                    if chunk_text:
                        all_text.append(chunk_text)
                        logger.info(f"[transcribe] Chunk {idx+1} done: {len(chunk_text)} chars")
                    chunk_transcribed = True
                    break
                except Exception as e:
                    is_connection_error = "connection" in str(e).lower() or "timeout" in str(e).lower()
                    if is_connection_error and attempt < 2:
                        wait_time = 2 ** attempt  # 1s, 2s
                        logger.warning(f"[transcribe] Chunk {idx+1} attempt {attempt+1} failed (connection error), retrying in {wait_time}s: {e}")
                        time.sleep(wait_time)
                        continue
                    logger.warning(f"[transcribe] Chunk {idx+1} failed after attempt {attempt+1}: {e}")
                    break

            # Try fallback model if primary model failed
            if not chunk_transcribed:
                try:
                    with open(chunk_path, "rb") as audio_file:
                        transcription = client.audio.transcriptions.create(
                            file=(upload_filename, audio_file),
                            model="whisper-large-v3",
                            language="en",
                            response_format="text",
                            temperature=0.0,
                        )
                    chunk_text = transcription.strip() if isinstance(transcription, str) else str(transcription).strip()
                    if chunk_text:
                        all_text.append(chunk_text)
                except Exception as e2:
                    logger.warning(f"[transcribe] Chunk {idx+1} fallback also failed: {e2}")

        # Clean up temp files
        for f in temp_files:
            try:
                os.unlink(f)
            except OSError:
                pass

        if not all_text:
            raise TranscriptionError("Groq transcription failed: no chunks were transcribed successfully")

        transcription = " ".join(all_text)

        text = transcription.strip() if isinstance(transcription, str) else str(transcription).strip()

        if not text or len(text) < 10:
            raise TranscriptionError("Transcription result is empty or too short")

        logger.info(f"[transcribe] Groq transcription successful ({len(text)} chars)")
        return text

    except ImportError:
        raise TranscriptionError("Groq library not installed")
    except TranscriptionError:
        raise
    except Exception as e:
        raise TranscriptionError(f"Groq transcription failed: {str(e)}")

def create_real_transcript(
    interview_id: int,
    recording_path: str,
    interview_start_time: datetime,
    interview_end_time: datetime,
    question_timestamps: Optional[List[Dict]] = None
) -> Dict[str, Any]:
    """
    Create a real transcript from recording file.
    
    Args:
        interview_id: ID of the interview
        recording_path: Path to recording file
        interview_start_time: When interview started
        interview_end_time: When interview ended
        question_timestamps: List of question timestamps [{question_text, timestamp}, ...]
        
    Returns:
        Dictionary with real transcript data
        
    Raises:
        TranscriptionError: If transcription fails
    """
    try:
        # Get real transcription
        raw_transcript = transcribe_audio_file(recording_path)
        
        # Process transcript with real timestamps
        processed_transcript = _process_transcript_with_timestamps(
            raw_transcript, 
            interview_start_time, 
            interview_end_time,
            question_timestamps
        )
        
        return {
            "transcript_text": processed_transcript["formatted_text"],
            "raw_transcript": raw_transcript,
            "transcript_lines": processed_transcript["lines"],
            "word_count": len(raw_transcript.split()),
            "duration_seconds": int((interview_end_time - interview_start_time).total_seconds()),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": "recording",
            "interview_id": interview_id
        }
        
    except Exception as e:
        logger.error(f"[create_real_transcript] Failed: {e}")
        raise TranscriptionError(f"Failed to create real transcript: {str(e)}")

def _add_speaker_labels(raw_text: str, questions: Optional[List[Dict]] = None) -> str:
    """
    Use Groq LLM to add speaker labels (Recruiter/Candidate) to raw transcript.
    Uses interview questions to identify who said what.
    Falls back to raw text if LLM call fails.
    """
    if not config.GROQ_API_KEY:
        return raw_text

    try:
        from groq import Groq
        client = Groq(api_key=config.GROQ_API_KEY)

        questions_context = ""
        if questions:
            q_list = "\n".join([f"- {q['question_text']}" for q in questions[:10]])
            questions_context = f"\n\nThese are the interview questions the Recruiter was supposed to ask:\n{q_list}"

        prompt = f"""You are a transcript formatter. Below is a raw speech-to-text transcript from a job interview between a Recruiter and a Candidate. Your job is to add speaker labels.

Rules:
- Label each dialogue turn as **Recruiter:** or **Candidate:**
- The Recruiter asks questions, gives instructions, and manages the interview flow
- The Candidate answers questions and talks about their experience
- Keep the EXACT original words - do NOT add, remove, or change any words
- Just add "Recruiter:" or "Candidate:" before each speaker turn
- Put each speaker turn on a new line with a blank line between turns
- If you cannot determine the speaker for a part, label it as "Speaker:"{questions_context}

Raw transcript:
{raw_text}

Formatted transcript with speaker labels:"""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=4000,
        )

        labeled_text = response.choices[0].message.content.strip()
        if len(labeled_text) < len(raw_text) * 0.5:
            logger.warning("[speaker_labels] LLM output too short, using raw text")
            return raw_text

        logger.info(f"[speaker_labels] Successfully added speaker labels ({len(labeled_text)} chars)")
        return labeled_text

    except Exception as e:
        logger.warning(f"[speaker_labels] Failed to add speaker labels: {e}")
        return raw_text


def _process_transcript_with_timestamps(
    raw_text: str,
    start_time: datetime,
    end_time: datetime,
    question_timestamps: Optional[List[Dict]] = None
) -> Dict[str, Any]:
    """
    Process raw transcript text into readable format with speaker labels.
    1. Whisper gives raw text
    2. Groq LLM adds Recruiter/Candidate labels using question context
    """
    total_duration = int((end_time - start_time).total_seconds())

    if not raw_text or not raw_text.strip():
        raise TranscriptionError("No valid text found in transcription")

    # Skip LLM speaker labeling (too slow) — use raw text directly
    labeled_text = raw_text.strip()

    start_str = start_time.strftime("%H:%M:%S")
    end_str = end_time.strftime("%H:%M:%S")

    formatted_text = f"[Interview Start: {start_str}]\n\n{labeled_text}\n\n[Interview End: {end_str}]"

    # Parse labeled text into structured lines
    lines = []
    current_speaker = "Speaker"
    current_text = []

    for line in labeled_text.split("\n"):
        line = line.strip()
        if not line:
            if current_text:
                lines.append({
                    "timestamp": start_str,
                    "speaker": current_speaker,
                    "text": " ".join(current_text)
                })
                current_text = []
            continue

        if line.startswith("Recruiter:"):
            if current_text:
                lines.append({
                    "timestamp": start_str,
                    "speaker": current_speaker,
                    "text": " ".join(current_text)
                })
                current_text = []
            current_speaker = "Recruiter"
            text_after = line[len("Recruiter:"):].strip()
            if text_after:
                current_text.append(text_after)
        elif line.startswith("Candidate:"):
            if current_text:
                lines.append({
                    "timestamp": start_str,
                    "speaker": current_speaker,
                    "text": " ".join(current_text)
                })
                current_text = []
            current_speaker = "Candidate"
            text_after = line[len("Candidate:"):].strip()
            if text_after:
                current_text.append(text_after)
        elif line.startswith("Speaker:"):
            if current_text:
                lines.append({
                    "timestamp": start_str,
                    "speaker": current_speaker,
                    "text": " ".join(current_text)
                })
                current_text = []
            current_speaker = "Speaker"
            text_after = line[len("Speaker:"):].strip()
            if text_after:
                current_text.append(text_after)
        else:
            current_text.append(line)

    if current_text:
        lines.append({
            "timestamp": start_str,
            "speaker": current_speaker,
            "text": " ".join(current_text)
        })

    # Fallback if parsing produced no lines
    if not lines:
        lines = [{"timestamp": start_str, "speaker": "Transcript", "text": labeled_text}]

    return {
        "formatted_text": formatted_text,
        "lines": lines,
        "total_duration": total_duration
    }

def validate_recording_file(file_path: str) -> bool:
    """
    Validate that recording file exists and is usable for transcription.
    
    Args:
        file_path: Path to recording file
        
    Returns:
        True if file is valid
        
    Raises:
        TranscriptionError: If file is invalid
    """
    if not file_path:
        raise TranscriptionError("No recording file path provided")
    
    if not os.path.exists(file_path):
        raise TranscriptionError(f"Recording file not found: {file_path}")
    
    file_size = os.path.getsize(file_path)
    if file_size < 1000:
        raise TranscriptionError(f"Recording file too small: {file_size} bytes")
    
    # Check file extension — Groq Whisper accepts these directly (video + audio, no ffmpeg needed)
    valid_extensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.ogg', '.wav', '.webm', '.flac']
    file_ext = os.path.splitext(file_path)[1].lower()
    if file_ext not in valid_extensions:
        raise TranscriptionError(f"Unsupported file format: {file_ext}. Supported: mp3, mp4, m4a, ogg, wav, webm, flac")
    
    return True
