"""
Groq LLM Service (Alternative to Gemini)
Provides transcript scoring using Groq API.
FREE, FAST, and NO QUOTA LIMITS!
"""

import json
import os
import re
from typing import List, Dict, Any, Optional
import config
from services.llm_utils import extract_json as _extract_json


def transcribe_audio_with_groq(file_path: str) -> Optional[str]:
    """Transcribe audio/video file using Groq Whisper API (free)."""
    try:
        if not config.GROQ_API_KEY:
            print("[transcribe_audio] GROQ_API_KEY not set, skipping real transcription")
            return None
        if not os.path.exists(file_path):
            print(f"[transcribe_audio] File not found: {file_path}")
            return None
        file_size = os.path.getsize(file_path)
        if file_size < 1000:
            print(f"[transcribe_audio] File too small ({file_size} bytes), likely no real audio")
            return None
        print(f"[transcribe_audio] Transcribing {os.path.basename(file_path)} ({file_size} bytes)...")
        from groq import Groq
        client = Groq(api_key=config.GROQ_API_KEY)
        with open(file_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=(os.path.basename(file_path), audio_file),
                model="whisper-large-v3",
                language="en",
                response_format="text"
            )
        text = transcription.strip() if isinstance(transcription, str) else str(transcription).strip()
        if not text or len(text) < 10:
            print("[transcribe_audio] Transcription too short or empty, falling back to mock")
            return None
        print(f"[transcribe_audio] Real transcription done! ({len(text)} chars)")
        return text
    except ImportError:
        print("[transcribe_audio] groq library not installed")
        return None
    except Exception as e:
        print(f"[transcribe_audio] Transcription failed: {e}")
        return None


def generate_questions_with_groq(
    job_description: str,
    skills_required: List[str],
    resume_text: str,
    experience_years: int,
    total_questions: int = 10
) -> Optional[List[Dict[str, Any]]]:
    """
    Generate interview questions with real sample answers using Groq LLM.
    Returns list of dicts with: question_text, sample_answer, question_type, difficulty, skill_focus
    """
    if not config.GROQ_API_KEY:
        print("[WARN] [generate_questions_groq] GROQ_API_KEY is not set!")
        return None

    print(f"[OK] [generate_questions_groq] GROQ_API_KEY found, generating questions...")

    skills_str = ", ".join(skills_required) if skills_required else "general software development"
    experience_level = "senior" if experience_years and experience_years >= 5 else "junior/mid"

    prompt = f"""You are a technical interview question generator. Based on the job description and candidate resume below, generate exactly {total_questions} interview questions.

JOB DESCRIPTION:
{job_description or 'Not provided'}

REQUIRED SKILLS: {skills_str}

CANDIDATE RESUME:
{resume_text or 'Not provided'}

CANDIDATE EXPERIENCE: {experience_years or 'Unknown'} years ({experience_level} level)

Generate {total_questions} questions with a good mix:
- 60% technical/scenario questions testing the required skills
- 20% conceptual questions about core concepts
- 20% behavioral questions about teamwork and problem-solving

CRITICAL: For each sample_answer, answer as a senior engineer with deep expertise. Your answer MUST:
- Explain the core concept clearly
- Mention specific tools, frameworks, or standards by name
- Include a real-world example or scenario
- Mention best practices and edge cases
- Be 4-6 sentences of actual factual content

BAD example (rubric - DO NOT do this):
"A good answer should explain the core concepts of Python, provide practical examples, and demonstrate understanding."

GOOD example (real answer - DO THIS):
"Python is a high-level, interpreted language built for readability, supporting OOP and functional paradigms. In web development, Django provides a batteries-included framework with ORM and admin panel, while Flask/FastAPI offer lightweight alternatives — FastAPI being the fastest due to ASGI and Pydantic validation. For example, a REST API built with FastAPI can handle ~15k req/sec vs Flask's ~2k. Best practices include using virtual environments (venv/poetry), type hints for maintainability, and pytest for testing. Edge case: Python's GIL limits true CPU parallelism, so use multiprocessing or async for I/O-bound tasks."

Respond ONLY with a JSON array in this exact format:
[
  {{
    "question_text": "The interview question",
    "sample_answer": "Detailed factual answer with tools, examples, and best practices (4-6 sentences)",
    "question_type": "technical|scenario|conceptual|behavioral",
    "difficulty": "basic|intermediate|advanced",
    "skill_focus": "the primary skill being tested or null"
  }}
]"""

    try:
        from groq import Groq
        client = Groq(api_key=config.GROQ_API_KEY)

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=4000
        )

        result_text = response.choices[0].message.content
        questions = _extract_json(result_text)

        if not questions or not isinstance(questions, list):
            print(f"[WARN] [generate_questions_groq] Invalid format returned")
            return None

        valid_types = {"technical", "scenario", "conceptual", "behavioral"}
        valid_difficulties = {"basic", "intermediate", "advanced"}
        result = []
        for q in questions:
            if not isinstance(q, dict) or "question_text" not in q:
                continue
            qt = q.get("question_type", "technical").lower()
            diff = q.get("difficulty", "intermediate").lower()
            result.append({
                "question_text": q["question_text"],
                "sample_answer": q.get("sample_answer", ""),
                "question_type": qt if qt in valid_types else "technical",
                "difficulty": diff if diff in valid_difficulties else "intermediate",
                "skill_focus": q.get("skill_focus")
            })

        if len(result) == 0:
            return None

        print(f"[OK] [generate_questions_groq] Generated {len(result)} questions successfully!")
        return result

    except ImportError:
        print("[WARN] [generate_questions_groq] groq library not installed")
        return None
    except Exception as e:
        print(f"[ERROR] [generate_questions_groq] Failed: {e}")
        return None


def generate_batch_sample_answers_with_groq(questions: List[str]) -> Optional[List[str]]:
    """
    Generate real sample answers for ALL questions in ONE API call (fast).
    Returns list of answer strings, same length as input questions.
    """
    if not config.GROQ_API_KEY or not questions:
        return None

    try:
        from groq import Groq
        client = Groq(api_key=config.GROQ_API_KEY)

        questions_str = ""
        for i, q in enumerate(questions, 1):
            questions_str += f"{i}. {q}\n"

        prompt = f"""You are a senior backend engineer. Answer each interview question below in detail.

Requirements for EACH answer:
- Explain the core concept clearly
- Mention specific tools, frameworks, or standards by name
- Include a real-world example or scenario
- Mention best practices and edge cases
- Avoid generic statements — be specific and technical
- Write 4-6 sentences per answer

BAD: "A good answer should explain the core concepts of Python..."
GOOD: "Python is a high-level, interpreted language built for readability, supporting OOP and functional paradigms. In web development, Django provides a batteries-included framework with ORM, while FastAPI offers high performance via ASGI and Pydantic validation. Best practice: use virtual environments (poetry/venv), type hints, and pytest. Edge case: Python's GIL limits CPU parallelism, so use multiprocessing or async for I/O-bound tasks."

QUESTIONS:
{questions_str}

Respond ONLY with a JSON array of {len(questions)} answer strings:
["Answer to question 1...", "Answer to question 2...", ...]"""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=3000
        )

        result_text = response.choices[0].message.content
        answers = _extract_json(result_text)

        if isinstance(answers, list) and len(answers) == len(questions):
            print(f"[OK] [batch_answers_groq] Generated {len(answers)} answers in one call!")
            return [str(a) for a in answers]

        return None

    except Exception as e:
        print(f"[WARN] [batch_answers_groq] Failed: {e}")
        return None


def score_transcript_with_groq(
    transcript_text: str,
    questions_with_answers: List[Dict[str, str]]
) -> Optional[Dict[str, Any]]:
    """
    Score an interview transcript using Groq LLM.
    
    Args:
        transcript_text: The full interview transcript
        questions_with_answers: List of dicts with question_text, sample_answer, question_id
    
    Returns dict with:
        - per_question: list of scores and feedback
        - overall_score, recommendation, strengths, weaknesses
    """
    print(f"\n{'='*60}")
    print(f"[AI] [score_transcript_groq] Starting transcript scoring...")
    print(f"   - Questions to score: {len(questions_with_answers)}")
    print(f"   - Transcript length: {len(transcript_text)} chars")
    
    try:
        from groq import Groq
        if not config.GROQ_API_KEY:
            print("[WARN] [score_transcript_groq] GROQ_API_KEY is NOT SET!")
            return None
        
        print(f"[OK] [score_transcript_groq] GROQ_API_KEY found")
        
        questions_str = ""
        for i, qa in enumerate(questions_with_answers, 1):
            questions_str += f"""
Question {i} (ID: {qa['question_id']}):
Q: {qa['question_text']}
Expected Answer: {qa['sample_answer']}
---"""
        
        prompt = f"""You are an expert interview evaluator. Extract the candidate's answer for EACH question from the transcript and score them.

QUESTIONS:
{questions_str}

TRANSCRIPT:
{transcript_text}

CRITICAL INSTRUCTIONS:
1. Each question must have a DIFFERENT answer extracted from the transcript.
2. Extract ONLY the candidate's words (no timestamps, no speaker labels).
3. Keep extracted answers to 1-4 sentences - just the core answer.
4. If a question was not asked in the transcript, write: "Question not asked in this interview"

SCORING (0-100 scale):
- relevance_score: How relevant is the answer to the question? (0-100)
- completeness_score: How complete is the answer compared to the expected answer? (0-100)
- accuracy_score: How accurate compared to expected answer? (0-100)
- clarity_score: How clear and coherent? (0-100)
- score: Overall weighted average = relevance*{config.WEIGHT_RELEVANCE} + completeness*{config.WEIGHT_COMPLETENESS} + accuracy*{config.WEIGHT_ACCURACY} + clarity*{config.WEIGHT_CLARITY}
- feedback: Brief specific feedback for this answer

SCORING GUIDELINES:
- 80-100: Excellent, comprehensive answer
- 60-80: Good answer with minor gaps
- 40-60: Adequate but missing key points
- 20-40: Poor answer with significant gaps
- 0-20: No relevant answer or question not asked

Respond ONLY with valid JSON:
{{
  "per_question": [
    {{
      "question_id": <id>,
      "extracted_answer": "The specific answer the candidate gave for THIS question",
      "score": 75,
      "relevance_score": 80,
      "completeness_score": 70,
      "accuracy_score": 75,
      "clarity_score": 80,
      "feedback": "Brief specific feedback"
    }}
  ],
  "overall_score": 72,
  "recommendation": "select|next_round|reject",
  "strengths": "Summary of strengths",
  "weaknesses": "Summary of weaknesses"
}}"""
        
        print(f"[AI] [score_transcript_groq] Calling Groq API...")
        
        client = Groq(api_key=config.GROQ_API_KEY)
        
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=3000
        )
        
        result_text = response.choices[0].message.content
        print(f"[AI] [score_transcript_groq] Got response, extracting JSON...")
        
        result = _extract_json(result_text)
        
        if not result or not isinstance(result, dict):
            print(f"[WARN] [score_transcript_groq] Invalid format returned")
            return None
        
        print(f"[OK] [score_transcript_groq] JSON extracted successfully!")
        
        # Validate required fields
        if "per_question" not in result or "overall_score" not in result:
            print("[WARN] Groq scoring missing required fields")
            return None
        
        # Validate and clamp all per-question scores to 0-100
        for pq in result.get("per_question", []):
            for key in ["score", "relevance_score", "completeness_score", "accuracy_score", "clarity_score"]:
                val = pq.get(key)
                if val is None or not isinstance(val, (int, float)):
                    pq[key] = 0.0
                else:
                    # Auto-detect 0-10 scale and convert to 0-100
                    val = float(val)
                    if val <= 10.0 and val > 0:
                        val = val * 10.0
                    pq[key] = round(max(0.0, min(100.0, val)), 1)
            if not pq.get("feedback"):
                pq["feedback"] = "Evaluation completed."

        # Validate overall_score
        overall = result.get("overall_score")
        if overall is None or not isinstance(overall, (int, float)):
            scores = [pq.get("score", 0) for pq in result.get("per_question", [])]
            overall = sum(scores) / len(scores) if scores else 0.0
        else:
            overall = float(overall)
            if overall <= 10.0 and overall > 0:
                overall = overall * 10.0
        result["overall_score"] = round(max(0.0, min(100.0, overall)), 1)

        # Normalize recommendation using 0-100 thresholds
        rec = result.get("recommendation", "reject").lower()
        if rec not in {"select", "next_round", "reject"}:
            ov = result["overall_score"]
            rec = "select" if ov >= config.SCORE_SELECT_THRESHOLD else "next_round" if ov >= config.SCORE_NEXT_ROUND_THRESHOLD else "reject"
        result["recommendation"] = rec

        print(f"\n[OK] [score_transcript_groq] SCORING COMPLETED!")
        print(f"   Overall Score: {result.get('overall_score', 'N/A')}")
        print(f"   Recommendation: {result.get('recommendation', 'N/A')}")
        print(f"   Questions scored: {len(result.get('per_question', []))}")
        print(f"{'='*60}\n")
        
        return result
    
    except ImportError:
        print(f"\n[WARN] [score_transcript_groq] Groq library not installed!")
        print(f"   Run: pip install groq")
        return None
    
    except Exception as e:
        import traceback
        print(f"\n[ERROR] [score_transcript_groq] EXCEPTION OCCURRED")
        print(f"   Error type: {type(e).__name__}")
        print(f"   Error message: {str(e)}")
        print(f"   Full traceback:")
        traceback.print_exc()
        print(f"{'='*60}\n")
        return None
