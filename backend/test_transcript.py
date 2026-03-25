"""
Quick test script to verify transcript and scoring systems work correctly.
Run: python test_transcript.py
"""
import os
import sys
import tempfile
import wave
import struct
import math

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv()

def test_deepgram_connection():
    """Test if Deepgram API key works and can transcribe audio."""
    print("\n" + "="*60)
    print("TEST 1: Deepgram API Connection")
    print("="*60)

    api_key = os.getenv("DEEPGRAM_API_KEY", "")
    if not api_key:
        print("FAIL: DEEPGRAM_API_KEY not set in .env")
        return False

    print(f"API Key: {api_key[:8]}...{api_key[-4:]}")

    # Create a simple test WAV file with a tone (not speech, just connectivity test)
    wav_path = os.path.join(tempfile.gettempdir(), "test_deepgram.wav")
    sample_rate = 16000
    duration = 2  # seconds
    frequency = 440  # Hz (A4 note)

    with wave.open(wav_path, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for i in range(sample_rate * duration):
            sample = int(32767 * 0.5 * math.sin(2 * math.pi * frequency * i / sample_rate))
            wav_file.writeframes(struct.pack('<h', sample))

    print(f"Test audio created: {wav_path} ({duration}s, {sample_rate}Hz)")

    # Test Deepgram pre-recorded API
    try:
        import requests
        url = "https://api.deepgram.com/v1/listen"
        params = {"model": "nova-2", "language": "en"}
        headers = {
            "Authorization": f"Token {api_key}",
            "Content-Type": "application/octet-stream",
        }

        with open(wav_path, "rb") as f:
            response = requests.post(url, params=params, headers=headers, data=f, timeout=30)

        if response.status_code == 200:
            result = response.json()
            channels = result.get("results", {}).get("channels", [])
            if channels:
                transcript = channels[0].get("alternatives", [{}])[0].get("transcript", "")
                print(f"PASS: Deepgram responded (transcript: '{transcript or '(silence/tone detected)'}')")
                return True
            else:
                print("PASS: Deepgram responded (no speech in test tone - expected)")
                return True
        else:
            print(f"FAIL: Deepgram returned status {response.status_code}")
            print(f"  Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")
        return False
    finally:
        try:
            os.unlink(wav_path)
        except:
            pass


def test_groq_transcription():
    """Test if Groq Whisper API works."""
    print("\n" + "="*60)
    print("TEST 2: Groq Whisper API")
    print("="*60)

    import config
    if not config.GROQ_API_KEY:
        print("SKIP: GROQ_API_KEY not set")
        return None

    print(f"API Key: {config.GROQ_API_KEY[:8]}...{config.GROQ_API_KEY[-4:]}")

    # Create test WAV with speech-like audio
    wav_path = os.path.join(tempfile.gettempdir(), "test_groq.wav")
    sample_rate = 16000
    duration = 2

    with wave.open(wav_path, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for i in range(sample_rate * duration):
            t = i / sample_rate
            sample = int(32767 * 0.3 * math.sin(2 * math.pi * 200 * t) * math.sin(2 * math.pi * 3 * t))
            wav_file.writeframes(struct.pack('<h', sample))

    try:
        from groq import Groq
        client = Groq(api_key=config.GROQ_API_KEY)

        with open(wav_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=("test.wav", audio_file),
                model="whisper-large-v3-turbo",
                language="en",
                response_format="text",
            )

        text = transcription.strip() if isinstance(transcription, str) else str(transcription).strip()
        print(f"PASS: Groq responded (transcript: '{text or '(no speech in test tone)'}')")
        return True
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")
        return False
    finally:
        try:
            os.unlink(wav_path)
        except:
            pass


def test_face_scoring():
    """Test face detection scoring formula."""
    print("\n" + "="*60)
    print("TEST 3: Face Detection Scoring Formula")
    print("="*60)

    scenarios = [
        {"name": "Perfect (100% single face)", "single": 10, "no_face": 0, "multi": 0, "looking_away": 0, "expected_min": 0.95},
        {"name": "Good (90% single, 10% no-face)", "single": 9, "no_face": 1, "multi": 0, "looking_away": 0, "expected_min": 0.9},
        {"name": "Looking away 30%", "single": 7, "no_face": 0, "multi": 0, "looking_away": 3, "expected_min": 0.85},
        {"name": "Multi-face 20%", "single": 8, "no_face": 0, "multi": 2, "looking_away": 0, "expected_min": 0.7},
        {"name": "Bad (50% multi-face)", "single": 5, "no_face": 0, "multi": 5, "looking_away": 0, "expected_min": 0.5},
        {"name": "Worst (100% multi-face)", "single": 0, "no_face": 0, "multi": 10, "looking_away": 0, "expected_min": 0.2},
        {"name": "Gone (100% no face)", "single": 0, "no_face": 10, "multi": 0, "looking_away": 0, "expected_min": 0.0},
    ]

    all_pass = True
    for s in scenarios:
        total = s["single"] + s["no_face"] + s["multi"]
        if total == 0:
            continue

        sr = s["single"] / total
        nr = s["no_face"] / total
        mr = s["multi"] / total
        la_ratio = s["looking_away"] / total if total > 0 else 0

        face_score = 1.0
        if nr > 0:
            face_score -= nr * 0.5
        if mr > 0:
            face_score -= mr * 0.7
        if la_ratio > 0:
            face_score -= la_ratio * 0.3
        face_score = max(0.0, min(1.0, face_score))

        status = "PASS" if face_score >= s["expected_min"] else "FAIL"
        if status == "FAIL":
            all_pass = False

        print(f"  {status}: {s['name']} = {face_score:.2f} (expected >= {s['expected_min']})")

    return all_pass


def test_transcript_scoring():
    """Test transcript scoring with Groq LLM."""
    print("\n" + "="*60)
    print("TEST 4: Transcript Scoring (Groq LLM)")
    print("="*60)

    import config
    if not config.GROQ_API_KEY:
        print("SKIP: GROQ_API_KEY not set")
        return None

    # Simulate a transcript with speaker labels
    test_transcript = """
Recruiter: Hello, welcome to the interview. Can you tell me about your experience with React?
Candidate: Thank you. I have been working with React for about 3 years. I have built several single page applications using React hooks, context API, and Redux for state management. I also have experience with Next.js for server-side rendering.
Recruiter: That sounds great. How do you handle performance optimization in React?
Candidate: I use several techniques like React.memo for preventing unnecessary re-renders, useMemo and useCallback hooks for memoization, code splitting with React.lazy and Suspense, and virtual scrolling for large lists.
"""

    test_questions = [
        {
            "question_id": 1,
            "question_text": "Tell me about your experience with React",
            "sample_answer": "Experience with React including hooks, state management, and component architecture"
        },
        {
            "question_id": 2,
            "question_text": "How do you handle performance optimization in React?",
            "sample_answer": "React.memo, useMemo, useCallback, code splitting, lazy loading, virtual scrolling"
        }
    ]

    try:
        from services.groq_service import score_transcript_with_groq
        result = score_transcript_with_groq(test_transcript, test_questions)

        if not result:
            print("FAIL: No result returned")
            return False

        overall = result.get("overall_score", 0)
        recommendation = result.get("recommendation", "unknown")
        per_q = result.get("per_question", [])

        print(f"  Overall Score: {overall}")
        print(f"  Recommendation: {recommendation}")
        print(f"  Questions Scored: {len(per_q)}")

        for pq in per_q:
            qid = pq.get("question_id", "?")
            score = pq.get("score", 0)
            extracted = pq.get("extracted_answer", "")[:80]
            print(f"    Q{qid}: score={score}, answer='{extracted}...'")

        # The test transcript has good answers, score should be > 50
        if overall > 40:
            print(f"PASS: Score {overall} is reasonable for good answers")
            return True
        else:
            print(f"FAIL: Score {overall} is too low for good answers")
            return False

    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")
        return False


def test_database_connection():
    """Test database has the required tables."""
    print("\n" + "="*60)
    print("TEST 5: Database Tables")
    print("="*60)

    try:
        from database import get_safe_db
        from models import VideoInterview, TranscriptChunk, FraudAnalysis

        db = get_safe_db()

        vi_count = db.query(VideoInterview).count()
        tc_count = db.query(TranscriptChunk).count()
        fa_count = db.query(FraudAnalysis).count()

        print(f"  VideoInterviews: {vi_count}")
        print(f"  TranscriptChunks: {tc_count}")
        print(f"  FraudAnalysis: {fa_count}")

        db.close()
        print("PASS: All tables accessible")
        return True
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")
        return False


if __name__ == "__main__":
    print("=" * 60)
    print("  INTERVIEW SYSTEM TEST SUITE")
    print("=" * 60)

    results = {}
    results["Deepgram API"] = test_deepgram_connection()
    results["Groq Whisper"] = test_groq_transcription()
    results["Face Scoring"] = test_face_scoring()
    results["Transcript Scoring"] = test_transcript_scoring()
    results["Database"] = test_database_connection()

    print("\n" + "=" * 60)
    print("  RESULTS SUMMARY")
    print("=" * 60)
    for name, result in results.items():
        status = "PASS" if result is True else ("SKIP" if result is None else "FAIL")
        print(f"  {status}: {name}")

    failed = sum(1 for r in results.values() if r is False)
    if failed:
        print(f"\n{failed} test(s) FAILED!")
        sys.exit(1)
    else:
        print("\nAll tests passed!")
