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
    exp = experience_years or 0

    # Determine experience level and difficulty distribution
    if exp >= 8:
        experience_level = "senior/lead"
        difficulty_guide = "70% advanced, 20% intermediate, 10% basic"
        depth_note = "Ask architecture design, system design, scalability, team leadership, mentoring, and complex problem-solving questions. Expect deep expertise with trade-off analysis."
    elif exp >= 5:
        experience_level = "mid-senior"
        difficulty_guide = "40% advanced, 40% intermediate, 20% basic"
        depth_note = "Ask in-depth technical questions, design patterns, optimization, debugging complex issues, and some system design. Expect practical hands-on expertise."
    elif exp >= 2:
        experience_level = "mid-level"
        difficulty_guide = "20% advanced, 50% intermediate, 30% basic"
        depth_note = "Ask practical implementation questions, core concepts, debugging, and some design questions. Expect solid fundamentals with growing expertise."
    else:
        experience_level = "junior/fresher"
        difficulty_guide = "10% advanced, 30% intermediate, 60% basic"
        depth_note = "Ask fundamental concepts, basic implementation, simple debugging, and learning aptitude questions. Keep questions approachable but test core understanding."

    prompt = f"""You are a technical interview question generator. Generate exactly {total_questions} interview questions tailored to the candidate's experience level.

JOB DESCRIPTION:
{job_description or 'Not provided'}

REQUIRED SKILLS: {skills_str}

CANDIDATE RESUME:
{resume_text or 'Not provided'}

CANDIDATE EXPERIENCE: {exp} years ({experience_level} level)

IMPORTANT - DIFFICULTY DISTRIBUTION based on {exp} years experience:
{difficulty_guide}

EXPERIENCE-APPROPRIATE DEPTH:
{depth_note}

Generate {total_questions} questions with this mix:
- 60% technical/scenario questions testing the required skills
- 20% conceptual questions about core concepts
- 20% behavioral questions about teamwork and problem-solving

CRITICAL RULES:
1. Questions MUST match the candidate's experience level — do NOT ask system design to a fresher or basic syntax to a 10-year veteran.
2. Each question should test a specific skill from the REQUIRED SKILLS list.
3. For each sample_answer, answer as a senior engineer with deep expertise. Your answer MUST:
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

    # Early detection of gibberish/nonsense transcripts
    text_clean = transcript_text.strip().lower()
    words = text_clean.split()

    # Strip speaker labels to count only actual spoken words
    import re
    content_only = re.sub(r'(recruiter|candidate|speaker)\s*:', '', text_clean).strip()
    content_words = [w for w in content_only.split() if len(w) > 1]  # ignore single chars

    # Extract candidate-only words (everything after "Candidate:" labels)
    candidate_parts = re.findall(r'candidate\s*:\s*(.+?)(?=recruiter\s*:|candidate\s*:|$)', text_clean, re.DOTALL)
    candidate_text = ' '.join(candidate_parts).strip()
    candidate_words = [w for w in candidate_text.split() if len(w) > 1]

    # Detect meaningless transcripts:
    # 1. Total content too short (< 10 real words)
    # 2. Candidate said almost nothing (< 5 words)
    # 3. Only greetings/filler words
    greeting_words = {'hello', 'hi', 'hey', 'ok', 'okay', 'yes', 'no', 'yeah', 'bye',
                      'thanks', 'thank', 'you', 'good', 'fine', 'sure', 'um', 'uh',
                      'hmm', 'well', 'so', 'can', 'hear', 'me'}
    candidate_meaningful = [w for w in candidate_words if w not in greeting_words]

    is_nonsense = False
    nonsense_reason = ""

    if len(words) < 5:
        is_nonsense = True
        nonsense_reason = f"Transcript too short ({len(words)} words)"
    elif len(content_words) < 10:
        is_nonsense = True
        nonsense_reason = f"Very little spoken content ({len(content_words)} real words)"
    elif len(candidate_words) < 5:
        is_nonsense = True
        nonsense_reason = f"Candidate barely spoke ({len(candidate_words)} words)"
    elif len(candidate_meaningful) < 3:
        is_nonsense = True
        nonsense_reason = f"Candidate only said greetings/filler ({len(candidate_meaningful)} meaningful words)"

    if is_nonsense:
        print(f"[WARN] [score_transcript_groq] {nonsense_reason}, scoring as nonsense")
        zero_questions = []
        for qa in questions_with_answers:
            zero_questions.append({
                "question_id": qa["question_id"],
                "extracted_answer": "No meaningful answer provided",
                "score": 0, "relevance_score": 0, "completeness_score": 0,
                "accuracy_score": 0, "clarity_score": 0,
                "feedback": f"{nonsense_reason}. No substantive answer given."
            })
        return {
            "per_question": zero_questions,
            "overall_score": 0,
            "recommendation": "reject",
            "strengths": "None identified.",
            "weaknesses": f"{nonsense_reason}. Candidate did not provide meaningful answers."
        }

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
2. Extract ONLY the candidate's words — ignore everything said by the Recruiter/Interviewer.
   The transcript has speaker labels (e.g., "Recruiter:" and "Candidate:"). Only score what the Candidate said.
3. Keep extracted answers to 1-4 sentences - just the core answer.
4. If a question was not asked in the transcript, write: "Question not asked in this interview"
5. Do NOT attribute the recruiter's explanations or prompts as the candidate's answer.

SCORING (0-100 scale):
- relevance_score: How relevant is the answer to the question? (0-100)
- completeness_score: How complete is the answer compared to the expected answer? (0-100)
- accuracy_score: How accurate compared to expected answer? (0-100)
- clarity_score: How clear and coherent? (0-100)
- score: Overall weighted average = relevance*{config.WEIGHT_RELEVANCE} + completeness*{config.WEIGHT_COMPLETENESS} + accuracy*{config.WEIGHT_ACCURACY} + clarity*{config.WEIGHT_CLARITY}
- feedback: Brief specific feedback for this answer

SCORING GUIDELINES:
- 80-100: Excellent, comprehensive answer that closely matches expected answer
- 60-80: Good answer with minor gaps but demonstrates real knowledge
- 40-60: Adequate but missing key points from expected answer
- 20-40: Poor answer with significant gaps or only surface-level knowledge
- 1-20: Very poor — answer is vague, off-topic, or barely related to the question
- 0: Question was NOT asked, candidate did NOT answer, or answer is nonsense/gibberish

STRICT RULES:
- If the transcript contains gibberish, random text, or fake answers (e.g. "xyz", "asdf", "test test"), give 0 for ALL scores.
- If the candidate's answer does not demonstrate actual knowledge of the topic, score below 30.
- Do NOT give high scores just because words exist — compare against the EXPECTED answer.
- Most average candidates should score 30-60, not 60-80. Only genuinely strong answers deserve 60+.

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
            # If question was not asked/answered, force all scores to 0
            extracted = str(pq.get("extracted_answer", "")).lower()
            not_asked = any(phrase in extracted for phrase in [
                "not asked", "not answered", "no answer", "not covered",
                "not discussed", "not mentioned", "question was not"
            ])

            # Also detect meaningless extracted answers (just greetings/filler)
            if not not_asked:
                extracted_words = [w for w in extracted.split() if len(w) > 1]
                _greetings = {'hello', 'hi', 'hey', 'ok', 'okay', 'yes', 'no', 'yeah',
                              'thanks', 'thank', 'you', 'good', 'fine', 'sure', 'um', 'uh', 'bye'}
                meaningful_words = [w for w in extracted_words if w not in _greetings]
                if len(meaningful_words) < 3:
                    not_asked = True
                    pq["feedback"] = "Candidate did not provide a substantive answer to this question."

            for key in ["score", "relevance_score", "completeness_score", "accuracy_score", "clarity_score"]:
                if not_asked:
                    pq[key] = 0.0
                else:
                    val = pq.get(key)
                    if val is None or not isinstance(val, (int, float)):
                        pq[key] = 0.0
                    else:
                        val = float(val)
                        # Only auto-detect 0-10 scale if ALL scores in this question are <=10
                        # (avoids false positive when LLM gives a legitimate low score like 5/100)
                        pq[key] = round(max(0.0, min(100.0, val)), 1)

            if not_asked:
                pq["feedback"] = pq.get("feedback") or "The question was not asked in the interview."
            elif not pq.get("feedback"):
                pq["feedback"] = "Evaluation completed."

        # NOTE: Auto-scale detection REMOVED — it was causing bugs.
        # When LLM gives legitimately low scores (e.g., 10/100 for bad answers),
        # the old code would wrongly multiply by 10 (thinking it was 0-10 scale).
        # The prompt explicitly asks for 0-100 scale. Trust the LLM's output.

        # Validate overall_score — only count questions that were actually asked
        # Discard unanswered questions so partial interviews are scored fairly
        not_asked_phrases = ["not asked", "not answered", "no answer", "not covered",
                             "not discussed", "not mentioned", "question was not"]
        asked_questions = []
        not_asked_questions = []
        for pq in result.get("per_question", []):
            extracted = str(pq.get("extracted_answer", "")).lower()
            is_not_asked = any(phrase in extracted for phrase in not_asked_phrases)
            # Also treat 0-scored questions with no meaningful answer as not asked
            if not is_not_asked:
                extracted_words = [w for w in extracted.split() if len(w) > 1]
                _greetings = {'hello', 'hi', 'hey', 'ok', 'okay', 'yes', 'no', 'yeah',
                              'thanks', 'thank', 'you', 'good', 'fine', 'sure', 'um', 'uh', 'bye'}
                meaningful_words = [w for w in extracted_words if w not in _greetings]
                if len(meaningful_words) < 3 and pq.get("score", 0) == 0:
                    is_not_asked = True
            if is_not_asked:
                not_asked_questions.append(pq)
            else:
                asked_questions.append(pq)

        # Mark not-asked questions explicitly
        for pq in not_asked_questions:
            pq["not_asked"] = True

        asked_scores = [pq.get("score", 0) for pq in asked_questions]

        if not asked_scores:
            overall = 0.0
        else:
            # Always recompute from asked questions only (don't trust AI's overall which includes 0s for unanswered)
            overall = sum(asked_scores) / len(asked_scores)
        result["overall_score"] = round(max(0.0, min(100.0, overall)), 1)

        print(f"   Questions asked: {len(asked_questions)}, Not asked: {len(not_asked_questions)}")

        # Normalize recommendation using 0-100 thresholds
        ov = result["overall_score"]
        rec = result.get("recommendation", "reject").lower()
        if rec not in {"select", "next_round", "reject"} or ov < config.SCORE_NEXT_ROUND_THRESHOLD:
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


def score_transcript_directly(
    transcript_text: str,
    job_title: str = "",
    job_description: str = "",
    skills_required: str = "",
) -> Optional[Dict[str, Any]]:
    """
    Score a transcript WITHOUT pre-defined questions.
    AI reads the transcript, extracts Q&A pairs from the recruiter-candidate conversation,
    and scores the candidate's answers based on the job context.
    """
    print(f"\n{'='*60}")
    print(f"[AI] [score_transcript_direct] Starting direct transcript scoring...")
    print(f"   - Job: {job_title}")
    print(f"   - Transcript length: {len(transcript_text)} chars")

    try:
        from groq import Groq
        if not config.GROQ_API_KEY:
            return None

        job_context = f"Job Title: {job_title}"
        if job_description:
            job_context += f"\nJob Description: {job_description[:500]}"
        if skills_required:
            job_context += f"\nRequired Skills: {skills_required}"

        prompt = f"""You are an expert interview evaluator. Read this interview transcript between a Recruiter and a Candidate.

JOB CONTEXT:
{job_context}

TRANSCRIPT:
{transcript_text}

YOUR TASK:
1. Identify each question the Recruiter asked
2. Extract the Candidate's answer for each question
3. Score each answer based on the job requirements

SCORING (0-100 scale):
- relevance_score: How relevant is the answer to the question and job? (0-100)
- completeness_score: How thorough and complete is the answer? (0-100)
- accuracy_score: How technically accurate is the answer? (0-100)
- clarity_score: How clear and well-communicated? (0-100)
- score: Overall = relevance*{config.WEIGHT_RELEVANCE} + completeness*{config.WEIGHT_COMPLETENESS} + accuracy*{config.WEIGHT_ACCURACY} + clarity*{config.WEIGHT_CLARITY}

SCORING GUIDELINES:
- 80-100: Excellent, comprehensive answer showing deep knowledge
- 60-80: Good answer with minor gaps
- 40-60: Adequate but missing key points
- 20-40: Poor answer with significant gaps
- 0-20: Very weak or no real answer given

Respond ONLY with valid JSON:
{{
  "per_question": [
    {{
      "question_id": 1,
      "question_text": "The actual question the recruiter asked",
      "extracted_answer": "The candidate's actual answer (1-4 sentences)",
      "score": 75,
      "relevance_score": 80,
      "completeness_score": 70,
      "accuracy_score": 75,
      "clarity_score": 80,
      "feedback": "Brief specific feedback about this answer"
    }}
  ],
  "overall_score": 72,
  "recommendation": "select|next_round|reject",
  "strengths": "Summary of candidate's strengths shown in the interview",
  "weaknesses": "Summary of areas where candidate could improve"
}}"""

        client = Groq(api_key=config.GROQ_API_KEY)
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=4000,
        )

        result_text = response.choices[0].message.content
        result = _extract_json(result_text)

        if not result or not isinstance(result, dict):
            print(f"[WARN] [score_transcript_direct] Invalid JSON returned")
            return None

        if "per_question" not in result or "overall_score" not in result:
            print("[WARN] [score_transcript_direct] Missing required fields")
            return None

        # Validate and clamp scores
        for pq in result.get("per_question", []):
            for key in ["score", "relevance_score", "completeness_score", "accuracy_score", "clarity_score"]:
                val = pq.get(key)
                if val is None or not isinstance(val, (int, float)):
                    pq[key] = 0.0
                else:
                    pq[key] = round(max(0.0, min(100.0, float(val))), 1)

        # Auto-detect 0-10 scale
        all_scores = [pq.get(k, 0) for pq in result.get("per_question", [])
                      for k in ["score", "relevance_score", "completeness_score", "accuracy_score", "clarity_score"]
                      if pq.get(k, 0) > 0]
        if all_scores and all(s <= 10.0 for s in all_scores):
            for pq in result.get("per_question", []):
                for key in ["score", "relevance_score", "completeness_score", "accuracy_score", "clarity_score"]:
                    if pq.get(key, 0) > 0:
                        pq[key] = round(pq[key] * 10.0, 1)

        overall = float(result.get("overall_score", 0))
        if all_scores and all(s <= 10.0 for s in all_scores) and overall <= 10.0 and overall > 0:
            overall = overall * 10.0
        result["overall_score"] = round(max(0.0, min(100.0, overall)), 1)

        ov = result["overall_score"]
        result["recommendation"] = (
            "select" if ov >= config.SCORE_SELECT_THRESHOLD
            else "next_round" if ov >= config.SCORE_NEXT_ROUND_THRESHOLD
            else "reject"
        )

        print(f"[OK] [score_transcript_direct] SCORING COMPLETED!")
        print(f"   Overall Score: {result['overall_score']}")
        print(f"   Recommendation: {result['recommendation']}")
        print(f"   Questions found: {len(result.get('per_question', []))}")
        print(f"{'='*60}\n")

        return result

    except Exception as e:
        import traceback
        print(f"[ERROR] [score_transcript_direct] {e}")
        traceback.print_exc()
        return None
