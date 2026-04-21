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
from services.realtime_transcription import DeepgramStreamer, compile_transcript

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

    # Buffer for the LAST interim transcript (per this speaker's connection).
    # Deepgram sends interim updates while the user is still speaking; each update
    # replaces the previous one. When a FINAL arrives, it supersedes the interim.
    # If the connection drops BEFORE a final is emitted, the buffered interim is
    # flushed as a best-effort chunk so that content isn't lost. This is what
    # recovers ~90%+ of the transcript even when Deepgram keeps reconnecting.
    last_interim = {"text": "", "start": 0.0, "end": 0.0, "conf": 1.0}

    # Callback: when Deepgram returns a transcript result
    async def on_transcript(speaker: str, text: str, is_final: bool,
                            timestamp_start: float, timestamp_end: float,
                            confidence: float = 1.0):
        cleaned = text.strip()
        if is_final and cleaned:
            # Final result — save immediately, clear any buffered interim (superseded).
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
            # Reset buffer: this utterance has been finalized
            last_interim["text"] = ""
            last_interim["start"] = 0.0
            last_interim["end"] = 0.0
            last_interim["conf"] = 1.0
        elif (not is_final) and cleaned:
            # Interim update. Two cases:
            # (a) Continuation of the same utterance — replace buffer with better guess.
            # (b) New utterance (big timestamp jump) — flush the stale buffered interim
            #     first (it never got a final), then start tracking the new one.
            # This way, mid-call Deepgram reconnects don't silently drop content.
            if last_interim["text"] and abs(timestamp_start - last_interim["start"]) > 1.5:
                try:
                    stale = TranscriptChunk(
                        video_interview_id=interview_id,
                        speaker=speaker,
                        text=last_interim["text"],
                        timestamp_start=last_interim["start"],
                        timestamp_end=last_interim["end"],
                        is_final=True,  # treat as final so compile_transcript picks it up
                        sequence_number=chunk_counter[0],
                    )
                    db.add(stale)
                    db.commit()
                    chunk_counter[0] += 1
                except Exception as e:
                    logger.error(f"Stale-interim flush error: {e}")
                    try:
                        db.rollback()
                    except Exception:
                        pass
            last_interim["text"] = cleaned
            last_interim["start"] = timestamp_start
            last_interim["end"] = timestamp_end
            last_interim["conf"] = confidence

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

        # Flush any unflushed interim transcript as a best-effort chunk BEFORE closing.
        # This is the "fallback" that recovers content when Deepgram connection drops
        # mid-utterance and never emits a final for that content.
        if last_interim["text"]:
            try:
                flush_chunk = TranscriptChunk(
                    video_interview_id=interview_id,
                    speaker=speaker_label,
                    text=last_interim["text"],
                    timestamp_start=last_interim["start"],
                    timestamp_end=last_interim["end"],
                    is_final=True,  # Stored as final so compile_transcript picks it up
                    sequence_number=chunk_counter[0],
                )
                db.add(flush_chunk)
                db.commit()
                chunk_counter[0] += 1
                print(f"[transcription_ws] 💾 Flushed last interim for {role}: \"{last_interim['text'][:50]}...\"")
            except Exception as e:
                logger.error(f"Failed to flush last interim: {e}")
                try:
                    db.rollback()
                except Exception:
                    pass

        # Close Deepgram connection
        print(f"[transcription_ws] 🔚 {role} closing: {audio_chunks_received[0]} chunks, {audio_bytes_received[0] / 1024:.1f} KB received")
        await streamer.close()

        # Close the long-lived WS session — its connection has likely been dropped
        # by Cloud SQL during the idle interview window.
        try:
            db.close()
        except Exception:
            pass

        # Compile all final chunks into VideoInterview.transcript using a FRESH
        # session. Retry once on stale-connection errors (Cloud SQL drops idle
        # connections after ~10 min — pool_pre_ping won't help mid-use).
        # Sort by wall-clock `created_at` — recruiter's and candidate's Deepgram
        # streams have independent `timestamp_start` clocks, so only the DB
        # server clock gives a reliable global order across both participants.
        for attempt in range(2):
            compile_db = get_safe_db()
            try:
                chunks = (
                    compile_db.query(TranscriptChunk)
                    .filter(
                        TranscriptChunk.video_interview_id == interview_id,
                        TranscriptChunk.is_final == True,
                    )
                    .order_by(TranscriptChunk.created_at, TranscriptChunk.id)
                    .all()
                )

                if chunks:
                    full_transcript = compile_transcript(chunks)
                    interview_obj = compile_db.query(VideoInterview).filter(
                        VideoInterview.id == interview_id
                    ).first()
                    if interview_obj:
                        interview_obj.transcript = full_transcript
                        interview_obj.transcript_source = "realtime"
                        interview_obj.transcript_generated_at = datetime.now(timezone.utc)
                        compile_db.commit()
                        logger.info(
                            f"Compiled real-time transcript for interview {interview_id} "
                            f"({len(chunks)} chunks)"
                        )
                break
            except Exception as e:
                logger.error(f"Error compiling transcript (attempt {attempt+1}/2): {e}")
                try:
                    compile_db.rollback()
                except Exception:
                    pass
                if attempt == 1:
                    logger.error(f"Transcript compile failed after retry for interview {interview_id}")
            finally:
                try:
                    compile_db.close()
                except Exception:
                    pass

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
