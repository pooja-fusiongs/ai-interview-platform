"""
AI service for interview report cards and transcript scoring.
Merged from client's iHire codebase.
Uses OpenAI GPT-4o-mini for transcript evaluation and report card generation.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

from config import OPENAI_API_KEY

logger = logging.getLogger("ihire.ai")


def _safe_parse_json(content: str) -> dict | list:
    """Robustly parse JSON from OpenAI response, stripping fences and fixing common issues."""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    array_match = re.search(r'\[[\s\S]*\]', cleaned)
    if array_match:
        try:
            return json.loads(array_match.group())
        except json.JSONDecodeError:
            pass

    obj_match = re.search(r'\{[\s\S]*\}', cleaned)
    if obj_match:
        try:
            return json.loads(obj_match.group())
        except json.JSONDecodeError:
            pass

    raise json.JSONDecodeError("Could not parse JSON from OpenAI response", cleaned, 0)


def score_transcript(
    transcript: str,
    job_title: str,
    job_description: str,
    candidate_name: str,
    questions_and_answers: list[dict],
) -> dict:
    """Score an interview transcript using OpenAI. Returns {score: float, feedback: str}."""
    questions_context = ""
    for i, qa in enumerate(questions_and_answers, 1):
        questions_context += f"\nQ{i}: {qa.get('question', '')}\nExpected: {qa.get('suggested_answer', '')}\n"

    prompt = f"""You are a senior hiring manager evaluating an interview transcript.
Score the candidate out of 10 based on the actual quality of their responses.

Position: {job_title}
Candidate: {candidate_name}

Job Description:
{job_description[:3000]}

Interview Questions & Expected Answers:
{questions_context[:4000]}

Actual Interview Transcript:
{transcript[:8000]}

EVALUATION CRITERIA:
1) Technical Competence (30%)
2) Problem-Solving Ability (25%)
3) Communication Skills (15%)
4) Experience Relevance (15%)
5) Cultural Fit & Enthusiasm (15%)

SCORING GUIDELINES:
- 9-10: Exceptional — deep expertise, specific examples, strong reasoning
- 7-8: Strong — solid answers with good examples but minor gaps
- 5-6: Average — surface-level answers, missing depth or specifics
- 3-4: Below average — vague, unclear, or incorrect in key areas
- 1-2: Poor — unable to answer most questions meaningfully

Return strict JSON object with:
- score: number (1-10, decimals allowed)
- feedback: string (4-6 sentences citing specific moments from the transcript)
"""

    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert interviewer. Return valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=1200,
        )

        content = response.choices[0].message.content or ""
        result = _safe_parse_json(content)

        score = float(result.get("score", 5))
        score = max(1.0, min(10.0, score))
        return {
            "score": round(score, 1),
            "feedback": result.get("feedback", "Unable to generate detailed feedback."),
        }
    except Exception as e:
        logger.error(f"Transcript scoring error: {e}")
        return {
            "score": 5.0,
            "feedback": f"Scoring encountered an error: {str(e)}. Default score of 5 assigned.",
        }


def generate_report_card(
    candidate_name: str,
    job_title: str,
    score_breakdown: list[dict],
    strengths_context: list[str],
    improvements_context: list[str],
    transcript_feedback: str,
    transcript_text: str = "",
) -> dict:
    """Generate a professional interview report card."""
    transcript_qa_seed = _extract_transcript_qa_pairs(transcript_text)
    has_transcript = bool(transcript_text and transcript_text.strip())

    prompt = f"""You are generating a professional interview report card.

Candidate: {candidate_name}
Role: {job_title}

Scores (pre-calculated — use as-is):
{json.dumps(score_breakdown, ensure_ascii=True)}

{"FULL INTERVIEW TRANSCRIPT:" if has_transcript else "NO TRANSCRIPT AVAILABLE — return empty arrays."}
{transcript_text[:12000] if has_transcript else ''}

{"AI evaluation feedback:" if transcript_feedback else ""}
{transcript_feedback if transcript_feedback else ""}

GENERATE A REPORT WITH EXACTLY THESE SECTIONS:

1. "scores" — Return the 3 pre-calculated scores as-is.
   Array of: {{ "label": str, "score": number|null }}

2. "performed_well" — 4-6 bullets on where the candidate excelled.
   Based EXCLUSIVELY on the transcript. Empty array if no transcript.

3. "areas_to_improve" — 3-5 bullets on gaps observed.
   Based EXCLUSIVELY on the transcript. Empty array if no transcript.

4. "transcript_qa" — Questions actually asked during the interview.
   For each: "question" and "answer_summary" (2-3 sentence observation).
   Empty array if no transcript.

Return strict JSON:
{{ "scores": [...], "performed_well": [...], "areas_to_improve": [...], "transcript_qa": [...] }}
"""

    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You write polished, professional interview report cards. "
                        "Evidence-based, concise, and presentable. "
                        "Return valid JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=5000,
        )

        content = response.choices[0].message.content or ""
        result = _safe_parse_json(content)

        fallback_qa = [
            {"question": p["question"], "answer_summary": p["answer"]}
            for p in transcript_qa_seed
        ] if has_transcript else []

        return {
            "scores": result.get("scores", score_breakdown),
            "performed_well": result.get("performed_well", []) if has_transcript else [],
            "areas_to_improve": result.get("areas_to_improve", []) if has_transcript else [],
            "transcript_qa": result.get("transcript_qa", fallback_qa) if has_transcript else [],
        }
    except Exception as e:
        logger.error(f"Report card generation error: {e}")
        fallback_qa = [
            {"question": p["question"], "answer_summary": p["answer"]}
            for p in transcript_qa_seed
        ] if has_transcript else []

        return {
            "scores": score_breakdown,
            "performed_well": [],
            "areas_to_improve": [],
            "transcript_qa": fallback_qa,
        }


def _extract_transcript_qa_pairs(transcript_text: str) -> list[dict]:
    """Extract Q&A pairs from transcript text."""
    if not transcript_text or not transcript_text.strip():
        return []

    question_markers = ("recruiter:", "interviewer:", "hiring manager:", "q:")
    answer_markers = ("candidate:", "a:", "answer:")

    pairs: list[dict] = []
    current_question = ""
    current_answer_parts: list[str] = []

    lines = [line.strip() for line in transcript_text.splitlines() if line.strip()]
    for line in lines:
        lower = line.lower()
        if lower.startswith(question_markers):
            if current_question:
                pairs.append({
                    "question": current_question,
                    "answer": " ".join(current_answer_parts).strip()
                })
            current_question = re.sub(
                r"^(recruiter:|interviewer:|hiring manager:|q:)\s*", "", line, flags=re.IGNORECASE
            )
            current_answer_parts = []
            continue

        if lower.startswith(answer_markers):
            cleaned = re.sub(r"^(candidate:|a:|answer:)\s*", "", line, flags=re.IGNORECASE)
            current_answer_parts.append(cleaned)
            continue

        if current_question:
            current_answer_parts.append(line)

    if current_question:
        pairs.append({
            "question": current_question,
            "answer": " ".join(current_answer_parts).strip()
        })

    return [p for p in pairs if p["question"] and p["answer"]]
