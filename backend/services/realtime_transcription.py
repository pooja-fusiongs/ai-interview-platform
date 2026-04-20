"""
Real-time transcription service using Deepgram Streaming API.
Manages WebSocket connections to Deepgram for live speech-to-text.
"""

import asyncio
import json
import logging
from typing import Optional, Callable, Awaitable

import websockets

logger = logging.getLogger(__name__)

DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"


class DeepgramStreamer:
    """Manages a single Deepgram WebSocket connection for one audio source."""

    def __init__(
        self,
        api_key: str,
        speaker: str,
        on_transcript: Callable[..., Awaitable[None]],
    ):
        self.api_key = api_key
        self.speaker = speaker
        self.on_transcript = on_transcript
        self.ws: Optional[websockets.ClientConnection] = None
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._keepalive_task: Optional[asyncio.Task] = None
        self._reconnecting = False
        self._reconnect_attempts = 0

    async def connect(self):
        """Open a WebSocket connection to Deepgram and start receiving."""
        params = "&".join([
            "model=nova-2",
            "language=en",
            "smart_format=true",
            "punctuate=true",
            "interim_results=true",
            "endpointing=800",
            "utterance_end_ms=3000",
            "vad_events=true",
            "filler_words=false",
            "no_delay=true",
            "multichannel=false",
            "diarize=false",
        ])
        url = f"{DEEPGRAM_WS_URL}?{params}"
        headers = {"Authorization": f"Token {self.api_key}"}

        self.ws = await websockets.connect(url, additional_headers=headers)
        self._running = True
        # Reset retry counter on successful connect — otherwise the streamer
        # silently dies after 3 cumulative drops over the interview lifetime,
        # freezing live captions ~halfway through.
        self._reconnect_attempts = 0
        self._task = asyncio.create_task(self._receive_loop())
        self._keepalive_task = asyncio.create_task(self._keepalive_loop())
        logger.info(f"Deepgram connected for speaker: {self.speaker}")

    async def send_audio(self, audio_data: bytes):
        """Forward audio bytes to Deepgram. Auto-reconnects on connection drop."""
        if not self._running and not self._reconnecting:
            # Try to reconnect
            await self._try_reconnect()

        if self.ws and self._running:
            try:
                await self.ws.send(audio_data)
            except websockets.exceptions.ConnectionClosed:
                logger.warning(f"Deepgram connection closed for {self.speaker}, will reconnect")
                self._running = False
                await self._try_reconnect()
            except Exception as e:
                logger.error(f"Error sending audio to Deepgram ({self.speaker}): {e}")

    async def _try_reconnect(self):
        """Attempt to reconnect to Deepgram (max 10 attempts per drop event).
        Counter resets to 0 on successful connect — long interviews can drop many
        times over the call's lifetime without permanently freezing live captions.
        """
        if self._reconnecting or self._reconnect_attempts >= 10:
            return
        self._reconnecting = True
        self._reconnect_attempts += 1
        try:
            logger.info(f"Reconnecting to Deepgram for {self.speaker} (attempt {self._reconnect_attempts}/10)...")
            # Close old connection
            if self.ws:
                try:
                    await self.ws.close()
                except Exception:
                    pass
            # Cancel old tasks
            for task in [self._task, self._keepalive_task]:
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
            # Reconnect
            await self.connect()
            logger.info(f"Deepgram reconnected for {self.speaker}")
        except Exception as e:
            logger.error(f"Deepgram reconnect failed for {self.speaker}: {e}")
        finally:
            self._reconnecting = False

    async def _keepalive_loop(self):
        """Send KeepAlive messages to prevent Deepgram from closing idle connections."""
        try:
            while self._running:
                await asyncio.sleep(8)  # Deepgram timeout is ~10s, send keepalive every 8s
                if self.ws and self._running:
                    try:
                        await self.ws.send(json.dumps({"type": "KeepAlive"}))
                    except Exception:
                        break
        except asyncio.CancelledError:
            pass

    async def _receive_loop(self):
        """Continuously receive transcript results from Deepgram."""
        try:
            async for msg in self.ws:
                if not self._running:
                    break
                try:
                    data = json.loads(msg)
                except json.JSONDecodeError:
                    continue

                msg_type = data.get("type", "")

                if msg_type == "Results":
                    channel = data.get("channel", {})
                    alternatives = channel.get("alternatives", [{}])
                    transcript = alternatives[0].get("transcript", "")
                    if transcript:
                        is_final = data.get("is_final", False)
                        start = data.get("start", 0)
                        duration = data.get("duration", 0)
                        confidence = alternatives[0].get("confidence", 1.0)
                        await self.on_transcript(
                            speaker=self.speaker,
                            text=transcript,
                            is_final=is_final,
                            timestamp_start=start,
                            timestamp_end=start + duration,
                            confidence=confidence,
                        )

        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Deepgram receive loop ended (closed) for {self.speaker}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Deepgram receive error ({self.speaker}): {e}")
        finally:
            self._running = False

    async def close(self):
        """Gracefully shut down the Deepgram connection.

        Order matters: send CloseStream FIRST so Deepgram flushes pending finals
        (like the candidate's final "yeah thank you"). Give the receive loop a
        moment to process those finals BEFORE cancelling it — otherwise the last
        utterance gets dropped from the transcript.
        """
        # 1. Stop keepalive immediately (not needed anymore)
        if self._keepalive_task and not self._keepalive_task.done():
            self._keepalive_task.cancel()
            try:
                await self._keepalive_task
            except asyncio.CancelledError:
                pass

        # 2. Ask Deepgram to finalise pending audio and flush final transcripts
        if self.ws:
            try:
                await self.ws.send(json.dumps({"type": "CloseStream"}))
            except Exception:
                pass

        # 3. Wait briefly for the receive loop to process the flushed finals.
        #    Deepgram typically emits final transcripts within 500-1500ms after
        #    CloseStream; we wait up to 3s for the loop to exit naturally (it
        #    exits on ConnectionClosed once Deepgram closes from its side).
        if self._task and not self._task.done():
            try:
                await asyncio.wait_for(self._task, timeout=3.0)
            except asyncio.TimeoutError:
                # Loop still running after 3s — force cancel so we don't hang
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
            except asyncio.CancelledError:
                pass

        # 4. Now it's safe to close the socket
        self._running = False
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass
        logger.info(f"Deepgram closed for speaker: {self.speaker}")


# ─── Transcript cleaning helpers ───────────────────────────────────────────────
#
# Deepgram ke chunks me teen problems aate hain:
#   1. Silence me ghost/filler words (uh, hmm, the) — candidate chup hai phir bhi
#      uska mic chunk bhej deta hai. Ye recruiter ke turn ke beech me ghus jaate
#      hain aur transcript interleaved lagta hai.
#   2. Ek speaker ka sentence Deepgram pause pe 2-3 chunks me tod deta hai.
#   3. Recruiter aur candidate ke `timestamp_start` alag clocks pe hain — stream
#      start ke relative. Isliye wall-clock (`created_at`) se sort karna zaroori
#      hai, Deepgram timestamp se nahi.

_FILLER_WORDS = {
    "uh", "um", "umm", "uhh", "hmm", "hm", "mm", "mhm", "ah", "oh",
    "er", "eh", "the", "a", "an", "so", "yeah", "ok", "okay",
}


def is_noise_chunk(text: str, confidence: float = 1.0) -> bool:
    """True if a chunk looks like silence hallucination / filler noise.

    Deepgram sometimes emits tiny low-confidence chunks while a participant is
    silent (background noise, breathing, brief acknowledgements). Dropping them
    before save is the cleanest fix — otherwise they leak into the other
    speaker's turn when we sort chronologically.
    """
    cleaned = (text or "").strip().lower().rstrip(".,!?")
    if not cleaned:
        return True
    words = cleaned.split()
    # Single filler word, regardless of confidence
    if len(words) == 1 and words[0] in _FILLER_WORDS:
        return True
    # Very short + low confidence → likely hallucinated
    if len(words) <= 2 and confidence < 0.6:
        return True
    # All words are fillers (e.g. "uh um", "hmm the")
    if words and all(w in _FILLER_WORDS for w in words):
        return True
    return False


def compile_transcript(chunks) -> str:
    """Merge consecutive same-speaker chunks into clean speaker turns.

    Expects chunks already ordered chronologically (by wall-clock created_at).
    Returns lines like: "Recruiter: ...\\nCandidate: ...".
    Never emits "Speaker:" — if a chunk has no role, alternate from the previous one
    (interview always starts with Recruiter).
    """
    lines: list[str] = []
    prev_speaker = None
    buffer: list[str] = []
    last_resolved_role = None  # For alternation when speaker is missing

    def _normalize(raw_speaker: str | None) -> str:
        """Map any speaker value to 'recruiter' or 'candidate' — never returns 'speaker'."""
        nonlocal last_resolved_role
        s = (raw_speaker or "").strip().lower()
        if s in ("recruiter", "candidate"):
            last_resolved_role = s
            return s
        # Missing/unknown role → alternate from last resolved role; first turn = recruiter
        next_role = "candidate" if last_resolved_role == "recruiter" else "recruiter"
        last_resolved_role = next_role
        return next_role

    for c in chunks:
        speaker = _normalize(c.speaker)
        text = (c.text or "").strip()
        if not text:
            continue
        if speaker == prev_speaker:
            buffer.append(text)
        else:
            if prev_speaker and buffer:
                lines.append(f"{prev_speaker.capitalize()}: {' '.join(buffer)}")
            prev_speaker = speaker
            buffer = [text]

    if prev_speaker and buffer:
        lines.append(f"{prev_speaker.capitalize()}: {' '.join(buffer)}")

    return "\n".join(lines)
