"""
Real-time transcription WebSocket endpoint.
Each participant (recruiter + candidate) connects separately and sends their own
local mic audio. This ensures high-quality audio without WebRTC degradation.
Backend creates one Deepgram streamer per connection and labels chunks by role.
"""

import asyncio
import json
import os
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import get_safe_db
from models import VideoInterview, TranscriptChunk
from services.realtime_transcription import DeepgramStreamer, is_noise_chunk, compile_transcript

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Real-Time Transcription"])

# Room-based connections: broadcast transcripts to all participants in the same interview
_interview_connections: dict[int, list[WebSocket]] = {}


@router.websocket("/ws/transcription/{interview_id}")
async def transcription_websocket(websocket: WebSocket, interview_id: int):
    """
    WebSocket endpoint for real-time transcription.
    Both recruiter and candidate connect separately, each sending their own mic.

    Protocol:
    1. Client connects
    2. Client sends JSON config: {"type": "config", "role": "recruiter"|"candidate"}
    3. Server sends: {"type": "ready"} when Deepgram is connected
    4. Client sends binary audio (raw WebM/Opus chunks — no prefix byte needed)
    5. Server sends JSON: {"type": "transcript", "speaker": "...", "text": "...", "is_final": bool}
    6. Client sends JSON: {"type": "stop"} to end, or simply disconnects
    """
    await websocket.accept()
    print(f"[transcription_ws] WebSocket accepted for interview {interview_id}")

    deepgram_key = os.getenv("DEEPGRAM_API_KEY", "")
    if not deepgram_key:
        print(f"[transcription_ws] ERROR: DEEPGRAM_API_KEY not found in env!")
        await websocket.send_json({
            "type": "error",
            "message": "Deepgram API key not configured. Set DEEPGRAM_API_KEY in backend/.env"
        })
        await websocket.close(code=4003)
        return

    # Wait for config message
    try:
        config_msg = await asyncio.wait_for(websocket.receive_json(), timeout=10)
    except asyncio.TimeoutError:
        print(f"[transcription_ws] Config message timeout for interview {interview_id}")
        await websocket.send_json({"type": "error", "message": "Config message timeout"})
        await websocket.close(code=4001)
        return
    except Exception as e:
        print(f"[transcription_ws] Config receive error: {type(e).__name__}: {e}")
        await websocket.close(code=4001)
        return

    role = config_msg.get("role", "recruiter")
    speaker_label = role  # "recruiter" or "candidate"
    print(f"[transcription_ws] Config received: role={role}, interview={interview_id}")

    db = get_safe_db()
    chunk_counter = [0]

    # Verify interview exists
    interview = db.query(VideoInterview).filter(VideoInterview.id == interview_id).first()
    if not interview:
        await websocket.send_json({"type": "error", "message": "Interview not found"})
        await websocket.close(code=4004)
        db.close()
        return

    # Get current max sequence number to avoid conflicts with other connections
    try:
        max_seq = (
            db.query(TranscriptChunk.sequence_number)
            .filter(TranscriptChunk.video_interview_id == interview_id)
            .order_by(TranscriptChunk.sequence_number.desc())
            .first()
        )
        chunk_counter[0] = (max_seq[0] + 1) if max_seq else 0
    except Exception:
        chunk_counter[0] = 0

    # Register this connection in the room
    if interview_id not in _interview_connections:
        _interview_connections[interview_id] = []
    _interview_connections[interview_id].append(websocket)

    # Callback: when Deepgram returns a transcript result
    async def on_transcript(speaker: str, text: str, is_final: bool,
                            timestamp_start: float, timestamp_end: float,
                            confidence: float = 1.0):
        # Save final chunks to DB, skipping silence-hallucination / filler noise
        # so they don't interleave with the other speaker's real turn.
        cleaned = text.strip()
        if is_final and cleaned and not is_noise_chunk(cleaned, confidence):
            try:
                chunk = TranscriptChunk(
                    video_interview_id=interview_id,
                    speaker=speaker,
                    text=cleaned,
                    timestamp_start=timestamp_start,
                    timestamp_end=timestamp_end,
                    is_final=True,
                    sequence_number=chunk_counter[0],
                )
                db.add(chunk)
                db.commit()
                chunk_counter[0] += 1
            except Exception as e:
                logger.error(f"DB save error: {e}")
                db.rollback()

        # Broadcast to ALL participants in this interview room
        msg = {
            "type": "transcript",
            "speaker": speaker,
            "text": text,
            "is_final": is_final,
            "timestamp_start": timestamp_start,
            "timestamp_end": timestamp_end,
            "sequence": chunk_counter[0],
        }
        for ws in _interview_connections.get(interview_id, []):
            try:
                await ws.send_json(msg)
            except Exception:
                pass  # Client may have disconnected

    # Single Deepgram streamer for this participant's local mic
    streamer = DeepgramStreamer(deepgram_key, speaker_label, on_transcript)
    audio_bytes_received = [0]
    audio_chunks_received = [0]

    try:
        print(f"[transcription_ws] Connecting to Deepgram for {role}...")
        await streamer.connect()
        print(f"[transcription_ws] ✅ Deepgram connected for {role}!")
        await websocket.send_json({"type": "ready"})
        print(f"[transcription_ws] ✅ Real-time transcription started for interview {interview_id}, role={role}")

        # Main loop: receive audio from frontend
        while True:
            try:
                msg = await websocket.receive()

                if msg.get("type") == "websocket.disconnect":
                    break

                if "bytes" in msg:
                    raw = msg["bytes"]
                    if len(raw) < 1:
                        continue
                    # Accept raw audio bytes (no speaker prefix needed anymore)
                    # For backward compat: if first byte is 0x01 or 0x02 and
                    # rest looks like audio, strip prefix; otherwise send as-is
                    if len(raw) > 2 and raw[0] in (1, 2):
                        # Legacy prefix format — strip the prefix byte
                        audio = raw[1:]
                    else:
                        audio = raw
                    audio_bytes_received[0] += len(audio)
                    audio_chunks_received[0] += 1
                    if audio_chunks_received[0] % 20 == 0:
                        print(f"[transcription_ws] 📊 {role}: {audio_chunks_received[0]} chunks, {audio_bytes_received[0] / 1024:.1f} KB total")
                    await streamer.send_audio(audio)

                elif "text" in msg:
                    try:
                        text_msg = json.loads(msg["text"])
                        if text_msg.get("type") == "stop":
                            break
                    except json.JSONDecodeError:
                        pass

            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Client receive error: {e}")
                break

    except Exception as e:
        print(f"[transcription_ws] ❌ Error for {role}: {type(e).__name__}: {e}")
        logger.error(f"Transcription WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass

    finally:
        # Remove from room connections
        if interview_id in _interview_connections:
            _interview_connections[interview_id] = [ws for ws in _interview_connections[interview_id] if ws != websocket]
            if not _interview_connections[interview_id]:
                del _interview_connections[interview_id]

        # Close Deepgram connection
        print(f"[transcription_ws] 🔚 {role} closing: {audio_chunks_received[0]} chunks, {audio_bytes_received[0] / 1024:.1f} KB received")
        await streamer.close()

        # Compile all final chunks into VideoInterview.transcript.
        # Sort by wall-clock `created_at` — recruiter's and candidate's Deepgram
        # streams have independent `timestamp_start` clocks, so only the DB
        # server clock gives a reliable global order across both participants.
        try:
            chunks = (
                db.query(TranscriptChunk)
                .filter(
                    TranscriptChunk.video_interview_id == interview_id,
                    TranscriptChunk.is_final == True,
                )
                .order_by(TranscriptChunk.created_at, TranscriptChunk.id)
                .all()
            )

            if chunks:
                full_transcript = compile_transcript(chunks)
                interview_obj = db.query(VideoInterview).filter(
                    VideoInterview.id == interview_id
                ).first()
                if interview_obj:
                    interview_obj.transcript = full_transcript
                    interview_obj.transcript_source = "realtime"
                    interview_obj.transcript_generated_at = datetime.now(timezone.utc)
                    db.commit()
                    logger.info(
                        f"Compiled real-time transcript for interview {interview_id} "
                        f"({len(chunks)} chunks)"
                    )
        except Exception as e:
            logger.error(f"Error compiling transcript: {e}")
            db.rollback()
        finally:
            db.close()

        logger.info(f"Real-time transcription ended for interview {interview_id}, role={role}")


@router.get("/api/video/interviews/{interview_id}/transcript-chunks")
async def get_transcript_chunks(interview_id: int):
    """Retrieve all saved transcript chunks for an interview."""
    db = get_safe_db()
    try:
        chunks = (
            db.query(TranscriptChunk)
            .filter(
                TranscriptChunk.video_interview_id == interview_id,
                TranscriptChunk.is_final == True,
            )
            .order_by(TranscriptChunk.created_at, TranscriptChunk.id)
            .all()
        )
        return [
            {
                "speaker": c.speaker,
                "text": c.text,
                "timestamp_start": c.timestamp_start,
                "timestamp_end": c.timestamp_end,
                "sequence": c.sequence_number,
            }
            for c in chunks
        ]
    finally:
        db.close()
