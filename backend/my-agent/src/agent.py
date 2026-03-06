import logging
import asyncio
import re
import os
import sys
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
from livekit.plugins.turn_detector.multilingual import MultilingualModel

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
    from livekit.plugins import elevenlabs
    HAS_ELEVENLABS = True
except ImportError:
    HAS_ELEVENLABS = False

logger = logging.getLogger("agent")

load_dotenv(".env")
load_dotenv("../.env")
load_dotenv(".env.local")


class InterviewAgent(Agent):
    def __init__(self):
        super().__init__(
            instructions="""You are a professional and friendly AI interviewer for a video interview.
            
            CRITICAL INSTRUCTIONS:
            1. You MUST ask the pre-generated candidate-specific questions provided to you
            2. Ask questions ONE BY ONE in order
            3. Wait for candidate's complete answer before moving to next question
            4. If candidate says "I don't know" or similar:
               - Acknowledge politely: "That's perfectly fine, thank you for your honesty."
               - Move to the next question without dwelling on it
               - Do not repeat the unanswered question
            5. Keep responses encouraging and professional
            6. After all questions are asked, thank the candidate and end the interview
            
            INTERVIEW FLOW:
            - Start with greeting and brief introduction
            - Ask question 1, wait for answer
            - Ask question 2, wait for answer
            - Continue through all questions
            - Thank candidate and conclude interview
            
            DO NOT:
            - Generate your own questions
            - Ask multiple questions at once
            - Repeat questions the candidate can't answer
            - Dwell on unanswered questions""",
        )
        self.current_question_index = 0
        self.questions = []
        self.interview_started = False
        self.candidate_name = "Candidate"
        self.timeout_task: Optional[asyncio.Task] = None
        self.silence_start_time: Optional[float] = None
        self.last_speech_time: Optional[float] = None
        self.silence_detection_task: Optional[asyncio.Task] = None
        self.SILENCE_TIMEOUT = 120  # 120 seconds

    async def fetch_interview_questions(self, video_id: int) -> Optional[List[Dict[str, Any]]]:
        """Fetch candidate-specific questions from backend API"""
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
            logger.error(f"❌ Error fetching interview questions: {e}")
            return None

    def is_dont_know_response(self, text: str) -> bool:
        """Check if response indicates candidate doesn't know the answer"""
        dont_know_patterns = [
            r"i don't know",
            r"i don't have an answer",
            r"i'm not sure",
            r"i am not sure",
            r"no idea",
            r"can't answer",
            r"cannot answer",
            r"don't have experience",
            r"haven't done this",
            r"not familiar with"
        ]
        
        text_lower = text.lower().strip()
        for pattern in dont_know_patterns:
            if re.search(pattern, text_lower):
                return True
        return False

    async def on_enter(self):
        """Called when agent enters the room"""
        # Extract video_id from room name (format: "interview_{video_id}")
        room_name = self.session.room.name
        if room_name.startswith("interview_"):
            video_id = int(room_name.split("_")[1])
            
            # Fetch questions for this specific interview
            questions = await self.fetch_interview_questions(video_id)
            if questions:
                self.questions = questions
                self.current_question_index = 0
                await self.session.say(
                    f"Hello {self.candidate_name}! I'm your AI interviewer today. "
                    "I'll be asking you some specific questions about the position. "
                    "Let's begin when you're ready.",
                    allow_interruptions=True
                )
                await asyncio.sleep(2)  # Brief pause
                await self.ask_next_question()
            else:
                await self.session.say(
                    "I apologize, but I'm having trouble accessing the interview questions. "
                    "Please refresh and try again, or contact support.",
                    allow_interruptions=True
                )
        else:
            await self.session.say(
                "Hello! I'm your AI interviewer. Please ensure you're in the correct interview room.",
                allow_interruptions=True
            )

    async def ask_next_question(self):
        """Ask the next question in the sequence"""
        # Cancel any existing timeout tasks
        if self.timeout_task and not self.timeout_task.done():
            self.timeout_task.cancel()
        if self.silence_detection_task and not self.silence_detection_task.done():
            self.silence_detection_task.cancel()

        if self.current_question_index < len(self.questions):
            question = self.questions[self.current_question_index]
            question_text = question["question_text"]
            
            await self.session.say(
                f"Question {self.current_question_index + 1}: {question_text}",
                allow_interruptions=True
            )
            
            self.interview_started = True
            logger.info(f"🗣️ Asked question {self.current_question_index + 1}: {question_text[:50]}...")
            
            # Start silence detection - wait for candidate response
            self.silence_start_time = asyncio.get_event_loop().time()
            self.last_speech_time = self.silence_start_time
            self.silence_detection_task = asyncio.create_task(self._silence_detection_handler())
        else:
            # All questions asked - conclude interview
            await self.conclude_interview()

    async def _silence_detection_handler(self):
        """Monitor for silence and move to next question after timeout"""
        try:
            while True:
                await asyncio.sleep(1)  # Check every second
                
                current_time = asyncio.get_event_loop().time()
                time_since_last_speech = current_time - self.last_speech_time
                
                if time_since_last_speech >= self.SILENCE_TIMEOUT:
                    logger.info(f"⏱️ {self.SILENCE_TIMEOUT} second silence detected. Moving to next question.")
                    await self.session.say(
                        "Let's move on to the next question.",
                        allow_interruptions=True
                    )
                    await asyncio.sleep(1)
                    self.current_question_index += 1
                    await self.ask_next_question()
                    break
                    
        except asyncio.CancelledError:
            # Task was cancelled - candidate started speaking or question changed
            pass

    async def conclude_interview(self):
        """Thank candidate and end interview"""
        await self.session.say(
            f"Thank you {self.candidate_name}! I've asked all the questions. "
            "Your responses have been recorded. The hiring team will review them and get back to you soon. "
            "Have a great day!",
            allow_interruptions=True
        )
        logger.info(f"✅ Interview concluded with {self.candidate_name}")
        # Optionally disconnect after a short delay
        await asyncio.sleep(3)

    async def on_reply(self, text: str):
        """Handle candidate's response"""
        if not self.interview_started:
            return  # Wait for first question to be asked

        # Update last speech time when candidate responds
        self.last_speech_time = asyncio.get_event_loop().time()
        
        # Cancel the silence detection task since the candidate has responded
        if self.silence_detection_task and not self.silence_detection_task.done():
            self.silence_detection_task.cancel()

        logger.info(f"👂 Candidate response: {text[:100]}...")
        
        # Check if it's a "don't know" response
        if self.is_dont_know_response(text):
            await self.session.say(
                "That's perfectly fine, thank you for your honesty. Let's move to the next question.",
                allow_interruptions=True
            )
            await asyncio.sleep(1)
        else:
            # Normal acknowledgment
            await self.session.say(
                "Thank you for your answer.",
                allow_interruptions=True
            )
            await asyncio.sleep(1)
        
        # Move to next question
        self.current_question_index += 1
        await asyncio.sleep(1)
        await self.ask_next_question()

    async def on_speech_detected(self):
        """Called when speech is detected by VAD"""
        if self.interview_started and self.silence_detection_task and not self.silence_detection_task.done():
            # Update last speech time when speech is detected
            self.last_speech_time = asyncio.get_event_loop().time()
            logger.debug("🎤 Speech detected - resetting silence timer")


async def entrypoint(ctx: JobContext):
    logger.info(f"--- 🚀 Agent starting for room: {ctx.room.name} ---")

    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info(f"✅ Connected to room: {ctx.room.name}")

    participant = await ctx.wait_for_participant()
    logger.info(f"Starting interview with participant: {participant.identity}")

    # Choose STT/LLM/TTS based on available plugins
    if not HAS_ELEVENLABS:
        raise RuntimeError("ElevenLabs plugin required for TTS. Install: uv add livekit-plugins-elevenlabs")
    
    if HAS_GROQ:
        logger.info("Using Groq for STT and LLM, ElevenLabs for TTS")
        stt = groq.STT(model="whisper-large-v3")
        llm = groq.LLM(model="llama-3.3-70b-versatile")
        tts = elevenlabs.TTS()  # Free tier: 10,000 chars/month
    elif HAS_OPENAI:
        logger.info("Using OpenAI for STT and LLM, ElevenLabs for TTS")
        stt = openai.STT(model="whisper-1")
        llm = openai.LLM(model="gpt-4o-mini")
        tts = elevenlabs.TTS()  # Free tier: 10,000 chars/month
    else:
        raise RuntimeError("No STT/LLM provider available. Install livekit-plugins-groq or livekit-plugins-openai")

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=stt,
        llm=llm,
        tts=tts,
        turn_detection=MultilingualModel(),
    )

    agent = InterviewAgent()
    
    # Hook into VAD events for real-time speech detection
    @session.vad.on("speech_started")
    async def on_speech_started():
        await agent.on_speech_detected()

    await session.start(
        room=ctx.room,
        agent=agent,
        room_input_options=RoomInputOptions(
            participant_identity=participant.identity,
        ),
    )

    logger.info("--- AI Agent is now active and interviewing ---")


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="my-agent",
        )
    )
