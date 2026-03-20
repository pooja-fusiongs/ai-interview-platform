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

    async def connect(self):
        """Open a WebSocket connection to Deepgram and start receiving."""
        params = "&".join([
            "model=nova-2",
            "smart_format=true",
            "interim_results=true",
            "endpointing=300",
            "utterance_end_ms=1000",
            "vad_events=true",
        ])
        url = f"{DEEPGRAM_WS_URL}?{params}"
        headers = {"Authorization": f"Token {self.api_key}"}

        self.ws = await websockets.connect(url, additional_headers=headers)
        self._running = True
        self._task = asyncio.create_task(self._receive_loop())
        self._keepalive_task = asyncio.create_task(self._keepalive_loop())
        logger.info(f"Deepgram connected for speaker: {self.speaker}")

    async def send_audio(self, audio_data: bytes):
        """Forward audio bytes to Deepgram."""
        if self.ws and self._running:
            try:
                await self.ws.send(audio_data)
            except websockets.exceptions.ConnectionClosed:
                logger.warning(f"Deepgram connection closed for {self.speaker}, cannot send")
                self._running = False
            except Exception as e:
                logger.error(f"Error sending audio to Deepgram ({self.speaker}): {e}")

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
                        await self.on_transcript(
                            speaker=self.speaker,
                            text=transcript,
                            is_final=is_final,
                            timestamp_start=start,
                            timestamp_end=start + duration,
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
        """Gracefully shut down the Deepgram connection."""
        self._running = False
        for task in [self._task, self._keepalive_task]:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        if self.ws:
            try:
                await self.ws.send(json.dumps({"type": "CloseStream"}))
                await self.ws.close()
            except Exception:
                pass
        logger.info(f"Deepgram closed for speaker: {self.speaker}")
