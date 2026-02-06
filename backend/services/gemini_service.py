"""
Google Gemini LLM Service
Provides question generation and transcript scoring using Gemini API.
Falls back to rule-based methods if API key is missing or call fails.
"""

import json
import re
from typing import List, Dict, Any, Optional
import config


def _get_model():
    """Initialize and return the Gemini model."""
    import google.generativeai as genai
    genai.configure(api_key=config.GEMINI_API_KEY)
    return genai.GenerativeModel("gemini-1.5-flash")


def _extract_json(text: str) -> Any:
    """Extract JSON from LLM response text, handling markdown code blocks."""
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Try extracting from ```json ... ``` blocks
    match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', text)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    # Try finding array or object
    for pattern in [r'(\[[\s\S]*\])', r'(\{[\s\S]*\})']:
        match = re.search(pattern, text)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                continue
    return None


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
        return None  # Caller should fall back to rule-based

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

For each question, provide a detailed sample answer (3-5 sentences) that a strong candidate would give.

Respond ONLY with a JSON array in this exact format:
[
  {{
    "question_text": "The interview question",
    "sample_answer": "A detailed expected answer",
    "question_type": "technical|scenario|conceptual|behavioral",
    "difficulty": "basic|intermediate|advanced",
    "skill_focus": "the primary skill being tested or null"
  }}
]"""

    try:
        model = _get_model()
        response = model.generate_content(prompt)
        questions = _extract_json(response.text)

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
    if not config.GEMINI_API_KEY:
        return None

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

SCORING (0-10 scale):
- relevance_score: How relevant is the answer to the question?
- completeness_score: How complete is the answer?
- accuracy_score: How accurate compared to expected answer?
- clarity_score: How clear and coherent?
- score: Overall weighted average
- feedback: Brief specific feedback for this answer

OUTPUT FORMAT - Respond ONLY with this JSON:
{{
  "per_question": [
    {{
      "question_id": <id>,
      "extracted_answer": "The specific 1-4 sentence answer the candidate gave for THIS question only",
      "score": 7.5,
      "relevance_score": 8.0,
      "completeness_score": 7.0,
      "accuracy_score": 7.5,
      "clarity_score": 8.0,
      "feedback": "Brief specific feedback"
    }}
  ],
  "overall_score": 7.2,
  "recommendation": "select|next_round|reject",
  "strengths": "2-3 sentence summary of strengths",
  "weaknesses": "2-3 sentence summary of weaknesses"
}}

SCORING GUIDELINES:
- 8-10: Excellent, comprehensive answer
- 6-8: Good answer with minor gaps
- 4-6: Adequate but missing key points
- 2-4: Poor answer with significant gaps
- 0-2: No relevant answer or question not asked

RECOMMENDATION:
- select: overall >= 7.5
- next_round: overall >= 5.0
- reject: overall < 5.0

REMEMBER: Each extracted_answer MUST be unique and specific to that question. Do NOT repeat the same text."""

    try:
        model = _get_model()
        response = model.generate_content(prompt)
        result = _extract_json(response.text)

        if not result or not isinstance(result, dict):
            print("Gemini scoring returned invalid format")
            return None

        # Validate required fields
        if "per_question" not in result or "overall_score" not in result:
            print("Gemini scoring missing required fields")
            return None

        # Validate and clean extracted answers - ensure they are unique per question
        per_question = result.get("per_question", [])
        seen_answers = set()
        for pq in per_question:
            extracted = pq.get("extracted_answer", "")
            # Clean up the extracted answer
            if extracted:
                # Remove timestamps and speaker labels if accidentally included
                cleaned = re.sub(r'\[\d{2}:\d{2}:\d{2}\]', '', extracted)
                cleaned = re.sub(r'(Hiring Manager|Interviewer|Manager):', '', cleaned, flags=re.IGNORECASE)
                cleaned = cleaned.strip()

                # Check if this answer is a duplicate or too similar to previous ones
                answer_key = cleaned[:100].lower() if cleaned else ""
                if answer_key in seen_answers and len(per_question) > 1:
                    print(f"⚠️ Duplicate answer detected for question {pq.get('question_id')}, marking as not found")
                    pq["extracted_answer"] = "Answer could not be uniquely extracted from transcript"
                else:
                    pq["extracted_answer"] = cleaned if cleaned else extracted
                    if answer_key:
                        seen_answers.add(answer_key)
            else:
                pq["extracted_answer"] = "No answer found in transcript"

        # Normalize recommendation
        rec = result.get("recommendation", "reject").lower()
        if rec not in {"select", "next_round", "reject"}:
            score = float(result.get("overall_score", 0))
            rec = "select" if score >= 7.5 else "next_round" if score >= 5.0 else "reject"
            result["recommendation"] = rec

        return result

    except Exception as e:
        print(f"Gemini transcript scoring failed: {e}")
        return None
