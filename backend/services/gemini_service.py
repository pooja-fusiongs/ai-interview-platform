"""
Google Gemini LLM Service
Provides question generation and transcript scoring using Gemini API.
Falls back to rule-based methods if API key is missing or call fails.
"""

import json
import re
from typing import List, Dict, Any, Optional
import config
from services.llm_utils import extract_json as _extract_json

# Global client instance
_gemini_client = None

def _get_client():
    """Initialize and return the Gemini client (new google-genai package)."""
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        _gemini_client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _gemini_client

def _generate_content(prompt: str, temperature: float = 0.3) -> str:
    """Generate content using Gemini API with gemini-2.0-flash model."""
    from google.genai import types
    client = _get_client()
    response = client.models.generate_content(
        model='gemini-2.0-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=4096,
        ),
    )
    return response.text


def generate_questions_with_gemini(
    job_description: str,
    skills_required: List[str],
    resume_text: str,
    experience_years: int,
    total_questions: int = 10
) -> List[Dict[str, str]]:
    """
    Generate interview questions using Gemini LLM.
    Returns list of dicts with: question_text, sample_answer, question_type, difficulty, skill_focus
    """
    if not config.GEMINI_API_KEY:
        print("[WARN] [generate_questions] GEMINI_API_KEY is not set!")
        return None  # Caller should fall back to rule-based

    print(f"[OK] [generate_questions] GEMINI_API_KEY found")

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
        response_text = _generate_content(prompt)
        questions = _extract_json(response_text)

        if not questions or not isinstance(questions, list):
            print(f"Gemini returned invalid format, falling back")
            return None

        # Validate and normalize each question
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
        return result

    except Exception as e:
        print(f"Gemini question generation failed: {e}")
        return None


def _manual_parse_transcript(
    transcript_text: str,
    questions: List[Dict[str, str]],
    existing_results: List[Dict]
) -> List[Dict]:
    """
    Manually parse transcript to extract answers for each question.
    Falls back when Gemini returns duplicate answers.
    """
    # Parse transcript into lines
    lines = transcript_text.strip().split('\n')
    qa_pairs = []

    current_speaker = None
    current_text = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Try to extract speaker and text
        # Format: [00:00:00] Speaker: text
        match = re.match(r'\[?\d{2}:\d{2}(?::\d{2})?\]?\s*([^:]+):\s*(.*)', line)
        if match:
            if current_speaker and current_text:
                qa_pairs.append({
                    "speaker": current_speaker.lower(),
                    "text": ' '.join(current_text)
                })
            current_speaker = match.group(1).strip()
            current_text = [match.group(2).strip()] if match.group(2).strip() else []
        elif current_speaker:
            current_text.append(line)

    if current_speaker and current_text:
        qa_pairs.append({
            "speaker": current_speaker.lower(),
            "text": ' '.join(current_text)
        })

    # Now match questions to answers
    result = []
    for i, q in enumerate(questions):
        q_id = q.get("question_id")
        q_text = q.get("question_text", "").lower()
        q_words = set(q_text.split()[:5])  # First 5 words for matching

        # Find best matching question in transcript
        best_answer = None
        best_score = 0

        for j, pair in enumerate(qa_pairs):
            if "interviewer" in pair["speaker"] or "hiring" in pair["speaker"] or "manager" in pair["speaker"]:
                # This is a question - check if it matches
                pair_words = set(pair["text"].lower().split()[:8])
                overlap = len(q_words & pair_words)

                if overlap >= 2 and j + 1 < len(qa_pairs):
                    # Next entry should be the candidate's answer
                    next_pair = qa_pairs[j + 1]
                    if "candidate" in next_pair["speaker"] or "interviewee" in next_pair["speaker"] or next_pair["speaker"] != pair["speaker"]:
                        if overlap > best_score:
                            best_score = overlap
                            best_answer = next_pair["text"][:500]  # Limit length

        # Update existing result or create new
        existing = next((r for r in existing_results if r.get("question_id") == q_id), None)
        if existing:
            # If existing is a duplicate and we found a better answer, update it
            if best_answer and existing.get("extracted_answer", "").startswith("[Duplicate"):
                existing["extracted_answer"] = best_answer
            # If no answer exists, use best_answer
            elif best_answer and not existing.get("extracted_answer"):
                existing["extracted_answer"] = best_answer
            result.append(existing)
        else:
            if best_answer:
                result.append({
                    "question_id": q_id,
                    "extracted_answer": best_answer,
                    "score": 55,
                    "relevance_score": 55,
                    "completeness_score": 50,
                    "accuracy_score": 55,
                    "clarity_score": 55,
                    "feedback": "Response evaluated from interview discussion"
                })
            else:
                # No answer found - score as 0, no dummy text
                result.append({
                    "question_id": q_id,
                    "extracted_answer": "Question not answered in this interview",
                    "score": 0.0,
                    "relevance_score": 0.0,
                    "completeness_score": 0.0,
                    "accuracy_score": 0.0,
                    "clarity_score": 0.0,
                    "feedback": "No answer found in transcript for this question"
                })

    return result if result else existing_results


def _fallback_scoring(
    transcript_text: str,
    questions_with_answers: List[Dict[str, str]]
) -> Dict[str, Any]:
    """
    Fallback scoring when Gemini API fails (quota exceeded, etc.)
    Uses rule-based scoring with transcript parsing.
    """
    print(f"\n{'='*60}")
    print(f"[FALLBACK] Using rule-based scoring...")
    print(f"   - Questions: {len(questions_with_answers)}")
    print(f"   - Transcript length: {len(transcript_text)} chars")
    
    # Parse transcript to extract Q&A pairs
    per_question = _manual_parse_transcript(transcript_text, questions_with_answers, [])
    
    # Calculate scores based on answer content
    total_score = 0
    for i, pq in enumerate(per_question):
        answer = pq.get("extracted_answer", "")
        q_id = pq.get("question_id")

        if not answer or "not found" in answer.lower() or "not asked" in answer.lower():
            # Question was not answered - score as 0, no dummy text
            pq["extracted_answer"] = "Question not answered in this interview"
            pq["score"] = 0.0
            pq["relevance_score"] = 0.0
            pq["completeness_score"] = 0.0
            pq["accuracy_score"] = 0.0
            pq["clarity_score"] = 0.0
            pq["feedback"] = "No answer found in transcript for this question (rule-based scoring)"
        else:
            # Score based on answer length (simple heuristic)
            word_count = len(answer.split())

            if word_count < 10:
                base_score = 40
                feedback = "Answer is too brief"
            elif word_count < 30:
                base_score = 60
                feedback = "Answer is adequate but could be more detailed"
            elif word_count < 60:
                base_score = 75
                feedback = "Good answer with reasonable detail"
            else:
                base_score = 80
                feedback = "Comprehensive answer with good detail"

            pq["score"] = base_score
            pq["relevance_score"] = base_score
            pq["completeness_score"] = base_score - 5
            pq["accuracy_score"] = base_score
            pq["clarity_score"] = base_score + 5
            pq["feedback"] = feedback + " (rule-based scoring)"

        total_score += pq["score"]

    # Calculate overall score
    overall_score = total_score / len(per_question) if per_question else 0.0

    # Determine recommendation using config thresholds
    if overall_score >= config.SCORE_SELECT_THRESHOLD:
        recommendation = "select"
        strengths = "Candidate provided detailed answers to most questions"
        weaknesses = "Some answers could be more comprehensive"
    elif overall_score >= config.SCORE_NEXT_ROUND_THRESHOLD:
        recommendation = "next_round"
        strengths = "Candidate answered most questions adequately"
        weaknesses = "Several answers lacked depth and detail"
    else:
        recommendation = "reject"
        strengths = "Candidate attempted to answer questions"
        weaknesses = "Most answers were too brief or missing key details"
    
    result = {
        "per_question": per_question,
        "overall_score": round(overall_score, 1),
        "recommendation": recommendation,
        "strengths": strengths + " (Note: AI scoring unavailable, using rule-based scoring)",
        "weaknesses": weaknesses + " (Note: AI scoring unavailable, using rule-based scoring)"
    }
    
    print(f"[OK] [fallback_scoring] Scoring completed")
    print(f"   Overall Score: {result['overall_score']}")
    print(f"   Recommendation: {result['recommendation']}")
    print(f"{'='*60}\n")
    
    return result


def score_transcript_with_gemini(
    transcript_text: str,
    questions_with_answers: List[Dict[str, str]]
) -> Optional[Dict[str, Any]]:
    """
    Score an interview transcript using Gemini LLM.

    Args:
        transcript_text: The full interview transcript
        questions_with_answers: List of dicts with question_text, sample_answer, question_id

    Returns dict with:
        - per_question: list of {question_id, score, relevance_score, completeness_score, accuracy_score, clarity_score, feedback, extracted_answer}
        - overall_score, recommendation, strengths, weaknesses
    """
    print(f"\n{'='*60}")
    print(f"[AI] [score_transcript] Starting transcript scoring...")
    print(f"   - Questions to score: {len(questions_with_answers)}")
    print(f"   - Transcript length: {len(transcript_text)} chars")

    if not config.GEMINI_API_KEY:
        print("[WARN] [score_transcript] GEMINI_API_KEY is NOT SET!")
        return None

    print(f"[OK] [score_transcript] GEMINI_API_KEY found")

    questions_str = ""
    for i, qa in enumerate(questions_with_answers, 1):
        questions_str += f"""
Question {i} (ID: {qa['question_id']}):
Q: {qa['question_text']}
Expected Answer: {qa['sample_answer']}
---"""

    prompt = f"""You are an expert interview evaluator. Your task is to find and extract the SPECIFIC answer given by the candidate for EACH question from the transcript.

QUESTIONS TO EVALUATE:
{questions_str}

INTERVIEW TRANSCRIPT:
{transcript_text}

CRITICAL INSTRUCTIONS - READ CAREFULLY:

1. TRANSCRIPT FORMAT: Each line is "[timestamp] Speaker_Name: what they said"
   - The Interviewer/Hiring Manager ASKS the questions
   - The Candidate/Interviewee ANSWERS the questions

2. FOR EACH QUESTION IN THE LIST ABOVE:
   - Search the transcript for where a SIMILAR question was asked (exact wording may differ)
   - Find the candidate's response that IMMEDIATELY FOLLOWS that question
   - Extract ONLY that specific response - NOT the whole transcript!

3. ANSWER EXTRACTION RULES:
   - Each "extracted_answer" MUST be DIFFERENT for each question
   - Extract only the candidate's words (not timestamps, not speaker labels)
   - Keep it to 1-4 sentences maximum - just the core answer
   - If question not found in transcript, write: "Question not asked in this interview"
   - NEVER copy the same answer for multiple questions
   - NEVER include the full transcript or conversation opening

4. EXAMPLE:
   If transcript has:
   "[00:01:00] Interviewer: What is Python?
   [00:01:30] Candidate: Python is a high-level programming language known for its simplicity."

   Then extracted_answer should be: "Python is a high-level programming language known for its simplicity."
   NOT: "[00:00:00] Interviewer: Hello... [00:01:00] Interviewer: What is Python..."

SCORING (0-100 scale):
- relevance_score: How relevant is the answer to the question? (0-100)
- completeness_score: How complete is the answer? (0-100)
- accuracy_score: How accurate compared to expected answer? (0-100)
- clarity_score: How clear and coherent? (0-100)
- score: Overall weighted average = relevance*{config.WEIGHT_RELEVANCE} + completeness*{config.WEIGHT_COMPLETENESS} + accuracy*{config.WEIGHT_ACCURACY} + clarity*{config.WEIGHT_CLARITY}
- feedback: Brief specific feedback for this answer

OUTPUT FORMAT - Respond ONLY with this JSON:
{{
  "per_question": [
    {{
      "question_id": <id>,
      "extracted_answer": "The specific 1-4 sentence answer the candidate gave for THIS question only",
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
  "strengths": "2-3 sentence summary of strengths",
  "weaknesses": "2-3 sentence summary of weaknesses"
}}

SCORING GUIDELINES:
- 80-100: Excellent, comprehensive answer
- 60-80: Good answer with minor gaps
- 40-60: Adequate but missing key points
- 20-40: Poor answer with significant gaps
- 0-20: No relevant answer or question not asked

RECOMMENDATION:
- select: overall >= 75
- next_round: overall >= 50
- reject: overall < 50

REMEMBER: Each extracted_answer MUST be unique and specific to that question. Do NOT repeat the same text."""

    try:
        print(f"[AI] [score_transcript] Calling Gemini API...")
        print(f"[AI] [score_transcript] Using gemini-2.0-flash model...")
        response_text = _generate_content(prompt)
        print(f"[AI] [score_transcript] Got response, extracting JSON...")
        result = _extract_json(response_text)

        if not result or not isinstance(result, dict):
            print(f"[WARN] [score_transcript] Invalid format returned")
            print(f"   Response text (first 500 chars): {response_text[:500] if response_text else 'EMPTY'}")
            return None

        print(f"[OK] [score_transcript] JSON extracted successfully!")

        # Validate required fields
        if "per_question" not in result or "overall_score" not in result:
            print("Gemini scoring missing required fields")
            return None

        # Validate and clean extracted answers - ensure they are unique per question
        per_question = result.get("per_question", [])
        seen_answers = {}
        duplicate_count = 0

        for pq in per_question:
            extracted = pq.get("extracted_answer", "")
            q_id = pq.get("question_id")

            # Clean up the extracted answer
            if extracted:
                # Remove timestamps and speaker labels if accidentally included
                cleaned = re.sub(r'\[\d{2}:\d{2}:\d{2}\]', '', extracted)
                cleaned = re.sub(r'(Hiring Manager|Interviewer|Manager|Candidate):', '', cleaned, flags=re.IGNORECASE)
                cleaned = cleaned.strip()

                # Check if this answer is a duplicate
                answer_key = cleaned[:80].lower() if cleaned else ""
                if answer_key and answer_key in seen_answers:
                    duplicate_count += 1
                    print(f"[WARN] Duplicate answer for Q{q_id}, same as Q{seen_answers[answer_key]}")
                    pq["extracted_answer"] = f"[Duplicate - see Q{seen_answers[answer_key]}] {cleaned[:100]}..."
                else:
                    pq["extracted_answer"] = cleaned if cleaned else extracted
                    if answer_key:
                        seen_answers[answer_key] = q_id
            else:
                pq["extracted_answer"] = "No answer found in transcript"

        # If too many duplicates, try manual parsing from transcript
        if duplicate_count >= len(per_question) // 2:
            print(f"[WARN] {duplicate_count} duplicates found, attempting manual transcript parsing...")
            per_question = _manual_parse_transcript(transcript_text, questions_with_answers, per_question)
            result["per_question"] = per_question

        # Normalize recommendation
        rec = result.get("recommendation", "reject").lower()
        if rec not in {"select", "next_round", "reject"}:
            score = float(result.get("overall_score", 0))
            rec = "select" if score >= 75 else "next_round" if score >= 50 else "reject"
            result["recommendation"] = rec

        print(f"\n[OK] [score_transcript] SCORING COMPLETED SUCCESSFULLY!")
        print(f"   Overall Score: {result.get('overall_score', 'N/A')}")
        print(f"   Recommendation: {result.get('recommendation', 'N/A')}")
        print(f"   Questions scored: {len(result.get('per_question', []))}")
        print(f"{'='*60}\n")

        return result

    except Exception as e:
        import traceback
        print(f"\n[ERROR] [score_transcript] EXCEPTION OCCURRED")
        print(f"   Error type: {type(e).__name__}")
        print(f"   Error message: {str(e)}")
        
        # Check if it's a quota error
        error_msg = str(e).lower()
        is_quota_error = '429' in error_msg or 'quota' in error_msg or 'resource_exhausted' in error_msg
        
        if is_quota_error:
            print(f"   [WARN] QUOTA EXCEEDED - Using fallback scoring")
            print(f"   Full traceback:")
            traceback.print_exc()
            print(f"{'='*60}\n")
            
            # Return fallback scoring
            return _fallback_scoring(transcript_text, questions_with_answers)
        else:
            print(f"   Full traceback:")
            traceback.print_exc()
            print(f"{'='*60}\n")
            return None
