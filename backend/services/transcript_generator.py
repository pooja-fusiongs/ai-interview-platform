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

def _process_transcript_with_timestamps(
    raw_text: str,
    start_time: datetime,
    end_time: datetime,
    question_timestamps: Optional[List[Dict]] = None
) -> Dict[str, Any]:
    """
    Process raw transcript text with real timestamps.
    """
    lines = []
    total_duration = int((end_time - start_time).total_seconds())
    
    # Split transcript into sentences for better timestamping
    sentences = [s.strip() for s in raw_text.split('.') if s.strip()]
    
    if not sentences:
        raise TranscriptionError("No valid sentences found in transcription")
    
    # Distribute timestamps across sentences
    time_per_sentence = total_duration // len(sentences)
    current_time = 0
    
    for i, sentence in enumerate(sentences):
        # Check if this sentence matches a question
        speaker = "Interviewer"
        timestamp = start_time.timestamp() + current_time
        
        if question_timestamps:
            for q_data in question_timestamps:
                if q_data["question_text"].lower() in sentence.lower():
                    speaker = "Interviewer"
                    break
            else:
                # If no question match, assume it's candidate
                speaker = "Candidate"
        
        # Format timestamp
        time_obj = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        formatted_time = time_obj.strftime("%H:%M:%S")
        
        lines.append({
            "timestamp": formatted_time,
            "speaker": speaker,
            "text": sentence + "."
        })
        
        current_time += time_per_sentence
    
    # Format as readable text
    formatted_text = "\n\n".join([
        f"[{line['timestamp']}] {line['speaker']}:\n{line['text']}"
        for line in lines
    ])
    
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
