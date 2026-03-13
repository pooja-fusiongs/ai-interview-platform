"""
Real Transcript Generator Service.

ONLY generates real transcripts from actual interview recordings.
No mock/simulated data - all transcripts must come from real speech-to-text.
"""

import os
import logging
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
    
    # Try Groq Whisper first (free, fast, reliable)
    try:
        if config.GROQ_API_KEY:
            return _transcribe_with_groq(file_path)
    except Exception as e:
        logger.warning(f"[transcribe] Groq transcription failed: {e}")
    
    # Try other services as fallback
    try:
        # Add other transcription services here if needed
        pass
    except Exception as e:
        logger.warning(f"[transcribe] Fallback transcription failed: {e}")
    
    # If all fail, raise error - NO MOCK DATA
    raise TranscriptionError("All transcription services failed. No transcript generated.")

def _transcribe_with_groq(file_path: str) -> str:
    """Transcribe using Groq Whisper API"""
    try:
        from groq import Groq
        client = Groq(api_key=config.GROQ_API_KEY)
        
        with open(file_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=(os.path.basename(file_path), audio_file),
                model="whisper-large-v3",
                language="en",
                response_format="text",
                temperature=0.0  # More deterministic output
            )
        
        text = transcription.strip() if isinstance(transcription, str) else str(transcription).strip()
        
        if not text or len(text) < 10:
            raise TranscriptionError("Transcription result is empty or too short")
        
        logger.info(f"[transcribe] Groq transcription successful ({len(text)} chars)")
        return text
        
    except ImportError:
        raise TranscriptionError("Groq library not installed")
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

    # Add speaker labels using LLM
    labeled_text = _add_speaker_labels(raw_text.strip(), question_timestamps)

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
    
    # Check file extension
    valid_extensions = ['.webm', '.mp4', '.wav', '.mp3', '.m4a', '.ogg']
    file_ext = os.path.splitext(file_path)[1].lower()
    if file_ext not in valid_extensions:
        raise TranscriptionError(f"Unsupported file format: {file_ext}")
    
    return True
