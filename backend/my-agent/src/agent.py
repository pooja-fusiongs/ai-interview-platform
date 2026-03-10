import logging
import asyncio
import re
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    WorkerOptions,
    cli,
    AgentSession,
    Agent,
    RoomInputOptions,
)
from livekit.plugins import silero

try:
    from livekit.plugins import groq
    HAS_GROQ = True
except ImportError:
    HAS_GROQ = False

try:
    from livekit.plugins import openai
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

try:
    from livekit.plugins import deepgram
    HAS_DEEPGRAM = True
except ImportError:
    HAS_DEEPGRAM = False

try:
    from livekit.plugins import elevenlabs
    HAS_ELEVENLABS = True
except ImportError:
    HAS_ELEVENLABS = False

try:
    from livekit.plugins import cartesia
    HAS_CARTESIA = True
except ImportError:
    HAS_CARTESIA = False

logger = logging.getLogger("agent")

load_dotenv(".env")
load_dotenv("../.env")
load_dotenv(".env.local")

# Global room lock to prevent multiple agents in same room
_active_rooms = set()


class InterviewAgent(Agent):
    def __init__(self, room_name: str = ""):
        super().__init__(
            instructions="""You are a professional AI interviewer conducting a structured video interview.

YOUR ROLE:
- You are ONLY an interviewer. You ask questions and listen.
- You do NOT generate your own questions. Only use the pre-provided questions.
- You ask ONE question at a time and wait patiently for the complete answer.

STRICT BEHAVIOR RULES:
1. After asking a question → STAY SILENT and wait for the candidate to finish completely
2. NEVER say "Thank you for your answer" or any acknowledgment UNTIL the candidate has fully stopped speaking
3. NEVER move to the next question while the candidate is still talking
4. If candidate pauses mid-answer → wait silently, they may continue
5. Only acknowledge AFTER full silence confirms they are done
6. Keep acknowledgments SHORT: "Got it, let's continue." or "Thank you, moving on."
7. If candidate says "I don't know" / "no idea" / "not sure" → say "No problem, let's move to the next one." and continue
8. NEVER repeat a question the candidate couldn't answer
9. NEVER ask multiple questions at once

INTERVIEW FLOW:
- Greet candidate warmly and briefly
- Ask Question 1 → wait → short acknowledgment → Ask Question 2
- Repeat until all questions are done
- Conclude warmly: "Thank you, that completes our interview. Best of luck!"

FORBIDDEN:
- Generating your own questions
- Interrupting the candidate
- Long acknowledgments or feedback after each answer
- Saying "Great answer!" or evaluating responses during interview""",
        )
        self.room_name = room_name
        self.current_question_index = 0
        self.questions = []
        self.interview_started = False
        self.candidate_name = "Candidate"
        self.timeout_task: Optional[asyncio.Task] = None
        self.silence_start_time: Optional[float] = None
        self.last_speech_time: Optional[float] = None
        self.silence_detection_task: Optional[asyncio.Task] = None
        self.SILENCE_TIMEOUT = 120

        # Debounce variables
        self._answer_task: Optional[asyncio.Task] = None
        self._accumulated_text: str = ""
        self._waiting_for_answer: bool = False

        # Transcript tracking
        self.interview_start_time: Optional[datetime] = None
        self.question_timestamps: List[Dict[str, Any]] = []
        self.transcript_lines = []

    async def fetch_interview_questions(self, video_id: int) -> Optional[List[Dict[str, Any]]]:
        try:
            import httpx
            backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
            api_url = f"{backend_url}/api/video/interviews/{video_id}/ai-questions"
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(api_url)
                if response.status_code == 200:
                    data = response.json()
                    questions = data.get("questions", [])
                    self.candidate_name = data.get("candidate_name", "Candidate")
                    logger.info(f"📋 Fetched {len(questions)} questions for {self.candidate_name}")
                    return questions
                else:
                    logger.error(f"❌ Failed to fetch questions: {response.status_code}")
                    return None
        except Exception as e:
            logger.error(f"❌ Error fetching questions: {e}")
            return None

    def is_dont_know_response(self, text) -> bool:
        if isinstance(text, list):
            text = ' '.join(str(item) for item in text)
        text = str(text)
        patterns = [
            r"i don't know", r"i don't have an answer", r"i'm not sure",
            r"i am not sure", r"no idea", r"can't answer", r"cannot answer",
            r"don't have experience", r"haven't done this", r"not familiar with",
            r"sorry.*no idea", r"sorry.*don't know"
        ]
        text_lower = text.lower().strip()
        for pattern in patterns:
            if re.search(pattern, text_lower):
                return True
        return False

    def is_filler_response(self, text: str) -> bool:
        filler_phrases = {
            "hello", "hi", "hey", "okay", "ok", "yes", "no", "sure", "alright",
            "okay thank you bye", "okay thank you", "thank you bye", "bye",
            "thank you", "thanks", "all in", "um", "uh", "okay bye", "yeah",
            "yeah thank you", "yeah thank you bye"
        }
        word_count = len(text.strip().split())
        text_clean = text.strip().lower().rstrip('.')
        if word_count <= 4 and text_clean in filler_phrases:
            return True
        if word_count <= 2:
            return True
        return False

    async def on_enter(self):
        logger.info("🎬 on_enter() called")
        room_name = self.room_name
        logger.info(f"🏠 Room name: {room_name}")

        if room_name.startswith("interview_"):
            video_id = int(room_name.split("_")[1])
            logger.info(f"🎯 Extracted video_id: {video_id}")
            self.interview_start_time = datetime.utcnow()

            questions = await self.fetch_interview_questions(video_id)
            if questions:
                self.questions = questions
                self.current_question_index = 0
                logger.info(f"✅ Ready with {len(questions)} questions")
                await self.session.say(
                    f"Hello {self.candidate_name}! I'm your AI interviewer today. "
                    "I'll be asking you some questions. Please take your time to answer each one fully. "
                    "Let's begin!",
                    allow_interruptions=False
                )
                await asyncio.sleep(2)
                await self.ask_next_question()
            else:
                await self.session.say(
                    "I apologize, I'm having trouble accessing the interview questions. "
                    "Please refresh and try again.",
                    allow_interruptions=True
                )
        else:
            await self.session.say(
                "Hello! Please ensure you're in the correct interview room.",
                allow_interruptions=True
            )

    async def ask_next_question(self):
        for task in [self.timeout_task, self.silence_detection_task, self._answer_task]:
            if task and not task.done():
                task.cancel()

        self._accumulated_text = ""

        if self.current_question_index < len(self.questions):
            question = self.questions[self.current_question_index]
            question_text = question["question_text"]

            self.question_timestamps.append({
                "question_text": question_text,
                "timestamp": datetime.utcnow().isoformat(),
                "question_index": self.current_question_index + 1,
                "candidate_answer": "",
                "answer_timestamp": None
            })

            # Set flag BEFORE session.say()
            self.interview_started = True
            self._waiting_for_answer = True
            self.silence_start_time = asyncio.get_event_loop().time()
            self.last_speech_time = self.silence_start_time
            self.silence_detection_task = asyncio.create_task(self._silence_detection_handler())

            logger.info(f"🗣️ Asking Q{self.current_question_index + 1}: {question_text[:60]}...")

            await self.session.say(
                f"Question {self.current_question_index + 1}: {question_text}",
                allow_interruptions=False
            )

            logger.info(f"✅ Q{self.current_question_index + 1} asked, waiting for answer...")

        else:
            await self.conclude_interview()

    async def _silence_detection_handler(self):
        try:
            while True:
                await asyncio.sleep(1)
                current_time = asyncio.get_event_loop().time()
                if current_time - self.last_speech_time >= self.SILENCE_TIMEOUT:
                    logger.info(f"⏱️ {self.SILENCE_TIMEOUT}s silence. Moving on.")
                    self._waiting_for_answer = False
                    await self.session.say("Let's move on to the next question.", allow_interruptions=True)
                    await asyncio.sleep(1)
                    self.current_question_index += 1
                    await self.ask_next_question()
                    break
        except asyncio.CancelledError:
            pass

    async def on_user_turn_completed(self, turn_ctx, new_message):
        content = new_message.content if hasattr(new_message, 'content') else str(new_message)
        text = content[0] if isinstance(content, list) else content
        if not isinstance(text, str):
            text = str(text)
        text = text.strip()

        if not text or not self.interview_started:
            return

        if not self._waiting_for_answer:
            logger.info(f"⏭️ Not waiting for answer, ignoring: '{text[:50]}'")
            return

        self.last_speech_time = asyncio.get_event_loop().time()
        self._accumulated_text = (self._accumulated_text + " " + text).strip()
        logger.info(f"📝 Accumulated: '{self._accumulated_text[:120]}'")

        if self._answer_task and not self._answer_task.done():
            self._answer_task.cancel()

        async def process_after_silence():
            await asyncio.sleep(3)
            full_answer = self._accumulated_text.strip()
            self._accumulated_text = ""
            await self._process_complete_answer(full_answer)

        self._answer_task = asyncio.create_task(process_after_silence())

    async def _process_complete_answer(self, text: str):
        logger.info(f"✅ Complete answer: '{text[:120]}'")

        self._waiting_for_answer = False

        if self.silence_detection_task and not self.silence_detection_task.done():
            self.silence_detection_task.cancel()

        if self.is_filler_response(text):
            logger.info(f"⚠️ Filler ignored ({len(text.split())} words): '{text}'")
            self._waiting_for_answer = True
            self.silence_detection_task = asyncio.create_task(self._silence_detection_handler())
            return

        # Save to local transcript
        current_question = (
            self.questions[self.current_question_index]["question_text"]
            if self.current_question_index < len(self.questions) else "Unknown"
        )
        self.transcript_lines.append(f"Q{self.current_question_index + 1}: {current_question}")
        self.transcript_lines.append(f"Candidate: {text}")

        if self.current_question_index < len(self.question_timestamps):
            self.question_timestamps[self.current_question_index]["candidate_answer"] = text
            self.question_timestamps[self.current_question_index]["answer_timestamp"] = datetime.utcnow().isoformat()

        logger.info(f"💾 Answer saved for Q{self.current_question_index + 1}")

        # ✅ HAR ANSWER KE BAAD TURANT DB SAVE - Chahe bich mein disconnect ho
        asyncio.create_task(self._save_interview_data())

        # Acknowledge
        is_last_question = self.current_question_index + 1 >= len(self.questions)

        if not is_last_question:
            if self.is_dont_know_response(text):
                await self.session.say(
                    "No problem, let's move to the next one.",
                    allow_interruptions=False
                )
            else:
                await self.session.say(
                    "Got it, let's continue.",
                    allow_interruptions=False
                )
            await asyncio.sleep(1.5)

        self.current_question_index += 1
        await self.ask_next_question()

    async def on_speech_detected(self):
        if self.interview_started:
            self.last_speech_time = asyncio.get_event_loop().time()

    async def conclude_interview(self):
        logger.info("🏁 Concluding interview...")
        await self.session.say(
            f"Thank you {self.candidate_name}! We've completed all the questions. "
            "Your responses have been recorded and the hiring team will review them soon. "
            "Best of luck, and have a great day!",
            allow_interruptions=True
        )
        asyncio.create_task(self._save_interview_data(is_final=True))
        logger.info(f"✅ Interview concluded with {self.candidate_name}")
        await asyncio.sleep(8)

    async def _save_interview_data(self, is_final: bool = False):
        """Save interview data to backend with retry logic"""
        try:
            import httpx
            if not self.room_name.startswith("interview_"):
                logger.warning("⚠️ Invalid room name format, skipping save")
                return
            
            video_id = int(self.room_name.split("_")[1])
            backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
            api_url = f"{backend_url}/api/video/interviews/{video_id}/ai-submit"

            interview_data = {
                "video_id": video_id,
                "interview_start_time": self.interview_start_time.isoformat() if self.interview_start_time else None,
                "interview_end_time": datetime.utcnow().isoformat(),
                "question_timestamps": self.question_timestamps,
                "total_questions": len(self.questions),
                "completed_questions": len([
                    q for q in self.question_timestamps
                    if q.get("candidate_answer") and q.get("candidate_answer").strip()
                ]),
                "is_final": is_final
            }

            logger.info(f"📤 Attempting to save to: {api_url}")
            logger.info(f"📤 Data: {len(self.question_timestamps)} questions, {interview_data['completed_questions']} answered, is_final: {is_final}")

            async with httpx.AsyncClient(timeout=60.0) as client:
                for attempt in range(1, 4):
                    try:
                        logger.info(f"🔄 Save attempt {attempt}/3...")
                        response = await client.post(api_url, json=interview_data)
                        logger.info(f"📡 Response status: {response.status_code}")
                        
                        if response.status_code == 200:
                            logger.info("✅ Interview data saved to DB successfully!")
                            return
                        else:
                            logger.error(f"❌ Attempt {attempt} failed: {response.status_code}")
                            logger.error(f"Response: {response.text[:500]}")
                    except httpx.ConnectError as e:
                        logger.error(f"❌ Attempt {attempt} - Connection error: {e}")
                        logger.error(f"   Backend URL: {backend_url}")
                    except httpx.TimeoutException as e:
                        logger.error(f"❌ Attempt {attempt} - Timeout: {e}")
                    except Exception as e:
                        logger.error(f"❌ Attempt {attempt} - Unexpected error: {e}")
                        import traceback
                        traceback.print_exc()
                    
                    if attempt < 3:
                        logger.info(f"⏳ Waiting 2 seconds before retry...")
                        await asyncio.sleep(2)
                
                logger.error("❌ All 3 save attempts failed!")
        except Exception as e:
            logger.error(f"❌ Critical error in _save_interview_data: {e}")
            import traceback
            traceback.print_exc()
            logger.error("❌ All 3 save attempts failed!")
        except Exception as e:
            logger.error(f"❌ Save error: {e}")
            import traceback
            traceback.print_exc()


async def entrypoint(ctx: JobContext):
    logger.info(f"--- 🚀 Agent starting for room: {ctx.room.name} ---")

    # ROOM LOCK: Prevent multiple agents in same room
    if ctx.room.name in _active_rooms:
        logger.warning(f"⚠️ Room {ctx.room.name} already has active agent! Skipping...")
        return

    _active_rooms.add(ctx.room.name)
    logger.info(f"🔒 Locked room: {ctx.room.name}")

    try:
        await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
        logger.info(f"✅ Connected to room: {ctx.room.name}")

        participant = await ctx.wait_for_participant()
        logger.info(f"Starting interview with participant: {participant.identity}")

        if HAS_GROQ:
            logger.info("Using Groq for STT and LLM")
            stt = groq.STT(model="whisper-large-v3")
            llm = groq.LLM(model="llama-3.3-70b-versatile")
            if HAS_DEEPGRAM:
                tts = deepgram.TTS(model="aura-asteria-en")
                logger.info("✅ Using Deepgram TTS")
            elif HAS_CARTESIA:
                tts = cartesia.TTS(voice="79a125e8-cd45-4c13-8a67-188112f4dd22")
            elif HAS_ELEVENLABS:
                tts = elevenlabs.TTS()
            else:
                raise RuntimeError("No TTS provider available")
        elif HAS_OPENAI:
            stt = openai.STT(model="whisper-1")
            llm = openai.LLM(model="gpt-4o-mini")
            tts = openai.TTS(voice="alloy")
        else:
            raise RuntimeError("No STT/LLM provider available")

        session = AgentSession(
            vad=silero.VAD.load(),
            stt=stt,
            tts=tts,
        )

        agent = InterviewAgent(room_name=ctx.room.name)

        @session.vad.on("speech_started")
        def on_speech_started():
            asyncio.create_task(agent.on_speech_detected())

        await session.start(
            room=ctx.room,
            agent=agent,
            room_input_options=RoomInputOptions(
                participant_identity=participant.identity,
            ),
        )

        logger.info("--- ✅ AI Agent is now active ---")

        # Use an event to track when disconnect save is complete
        disconnect_save_complete = asyncio.Event()

        async def _save_on_disconnect(agent):
            try:
                if agent.interview_started and len(agent.question_timestamps) > 0:
                    logger.info(f"💾 Saving on disconnect: {len(agent.question_timestamps)} questions")
                    await agent._save_interview_data(is_final=True)
                    logger.info("✅ Disconnect save successful!")
                else:
                    logger.info("⏭️ No data to save")
            except Exception as e:
                logger.error(f"❌ Disconnect save failed: {e}")
                import traceback
                traceback.print_exc()
            finally:
                disconnect_save_complete.set()

        @ctx.room.on("disconnected")
        def on_room_disconnected():
            logger.info("💾 Room disconnected - triggering save...")
            asyncio.create_task(_save_on_disconnect(agent))

        # Wait for disconnect event with timeout
        try:
            await asyncio.wait_for(disconnect_save_complete.wait(), timeout=300.0)  # 5 min max
            logger.info("✅ Disconnect save completed")
        except asyncio.TimeoutError:
            logger.warning("⏰ Session timeout - forcing save...")
            await _save_on_disconnect(agent)

    finally:
        _active_rooms.discard(ctx.room.name)
        logger.info(f"🔓 Unlocked room: {ctx.room.name}")


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="my-agent",
        )
    )