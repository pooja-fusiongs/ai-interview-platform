"""
Real-time transcription WebSocket endpoint.
Frontend streams audio via WebSocket -> backend routes to Deepgram -> returns transcript.
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

from database import SessionLocal
from models import VideoInterview, TranscriptChunk
from services.realtime_transcription import DeepgramStreamer

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Real-Time Transcription"])


@router.websocket("/ws/transcription/{interview_id}")
async def transcription_websocket(websocket: WebSocket, interview_id: int):
    """
    WebSocket endpoint for real-time transcription.

    Protocol:
    1. Client connects
    2. Client sends JSON config: {"type": "config", "role": "recruiter"|"candidate"}
    3. Server sends: {"type": "ready"} when Deepgram is connected
    4. Client sends binary audio: [0x01=local | 0x02=remote][audio_bytes]
    5. Server sends JSON: {"type": "transcript", "speaker": "...", "text": "...", "is_final": bool}
    6. Client sends JSON: {"type": "stop"} to end, or simply disconnects
    """
    await websocket.accept()

    deepgram_key = os.getenv("DEEPGRAM_API_KEY", "")
    if not deepgram_key:
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
        await websocket.send_json({"type": "error", "message": "Config message timeout"})
        await websocket.close(code=4001)
        return
    except Exception:
        await websocket.close(code=4001)
        return

    role = config_msg.get("role", "recruiter")
    local_speaker = role
    remote_speaker = "candidate" if role == "recruiter" else "recruiter"

    db = SessionLocal()
    chunk_counter = [0]

    # Verify interview exists
    interview = db.query(VideoInterview).filter(VideoInterview.id == interview_id).first()
    if not interview:
        await websocket.send_json({"type": "error", "message": "Interview not found"})
        await websocket.close(code=4004)
        db.close()
        return

    # Callback: when Deepgram returns a transcript result
    async def on_transcript(speaker: str, text: str, is_final: bool,
                            timestamp_start: float, timestamp_end: float):
        # Save final chunks to DB
        if is_final and text.strip():
            try:
                chunk = TranscriptChunk(
                    video_interview_id=interview_id,
                    speaker=speaker,
                    text=text.strip(),
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

        # Send to frontend
        try:
            await websocket.send_json({
                "type": "transcript",
                "speaker": speaker,
                "text": text,
                "is_final": is_final,
                "timestamp_start": timestamp_start,
                "timestamp_end": timestamp_end,
                "sequence": chunk_counter[0],
            })
        except Exception:
            pass  # Client may have disconnected

    local_streamer = DeepgramStreamer(deepgram_key, local_speaker, on_transcript)
    remote_streamer = DeepgramStreamer(deepgram_key, remote_speaker, on_transcript)

    try:
        # Connect to Deepgram
        await local_streamer.connect()
        await remote_streamer.connect()

        await websocket.send_json({"type": "ready"})
        logger.info(f"Real-time transcription started for interview {interview_id}")

        # Main loop: receive audio from frontend
        while True:
            try:
                msg = await websocket.receive()

                if msg.get("type") == "websocket.disconnect":
                    break

                if "bytes" in msg:
                    raw = msg["bytes"]
                    if len(raw) < 2:
                        continue
                    speaker_id = raw[0]
                    audio = raw[1:]
                    if speaker_id == 1:
                        await local_streamer.send_audio(audio)
                    elif speaker_id == 2:
                        await remote_streamer.send_audio(audio)

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
        logger.error(f"Transcription WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass

    finally:
        # Close Deepgram connections
        await local_streamer.close()
        await remote_streamer.close()

        # Compile all final chunks into VideoInterview.transcript
        try:
            chunks = (
                db.query(TranscriptChunk)
                .filter(
                    TranscriptChunk.video_interview_id == interview_id,
                    TranscriptChunk.is_final == True,
                )
                .order_by(TranscriptChunk.sequence_number)
                .all()
            )

            if chunks:
                full_transcript = "\n".join(
                    f"{c.speaker.capitalize()}: {c.text}" for c in chunks
                )
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

        logger.info(f"Real-time transcription ended for interview {interview_id}")


@router.get("/api/video/interviews/{interview_id}/transcript-chunks")
async def get_transcript_chunks(interview_id: int):
    """Retrieve all saved transcript chunks for an interview."""
    db = SessionLocal()
    try:
        chunks = (
            db.query(TranscriptChunk)
            .filter(
                TranscriptChunk.video_interview_id == interview_id,
                TranscriptChunk.is_final == True,
            )
            .order_by(TranscriptChunk.sequence_number)
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
