"""
Answer Scoring Service
Scores candidate answers using Groq AI (primary) with rule-based fallback.
Produces 4 dimension scores (relevance, completeness, accuracy, clarity)
and an overall 0-100 score with written feedback.
"""

import re
import json
import math
from collections import Counter
from typing import Dict, List
import config
from services.llm_utils import extract_json as _extract_json


# ─── Nonsense / Gibberish Detection ─────────────────────────────────────────

def _is_nonsense_answer(answer_text: str, sample_answer: str = "") -> bool:
    """Detect gibberish, random characters, or clearly fake answers."""
    text = answer_text.strip().lower()
    words = text.split()

    # Too short to be a real answer (less than 3 words)
    if len(words) < 3:
        return True

    # Check if mostly non-alphabetic or random characters
    alpha_chars = sum(1 for c in text if c.isalpha())
    if len(text) > 0 and alpha_chars / len(text) < 0.5:
        return True

    # Check for repeated single words/characters (e.g., "xyz xyz xyz", "test test test")
    unique_words = set(words)
    if len(words) >= 3 and len(unique_words) <= 2:
        return True

    # Check if answer has no real English words (at least some common words)
    common_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
                    'on', 'with', 'at', 'by', 'from', 'it', 'this', 'that', 'and', 'or',
                    'but', 'not', 'so', 'if', 'as', 'i', 'we', 'they', 'you', 'my', 'your',
                    'use', 'used', 'using', 'work', 'like', 'also', 'which', 'when', 'how',
                    'what', 'where', 'why', 'about', 'than', 'then', 'very', 'just', 'more'}
    word_set = set(words)
    real_words = word_set & common_words
    # If answer is short and has no common English words, likely gibberish
    if len(words) <= 10 and len(real_words) == 0:
        return True

    # Check for keyword overlap with expected answer — if zero overlap on a long enough answer
    if sample_answer and len(words) >= 3:
        sample_tokens = set(_tokenize(sample_answer.lower()))
        answer_tokens = set(_tokenize(text))
        overlap = len(sample_tokens & answer_tokens)
        # If absolutely zero overlap with expected answer and answer is short, suspicious
        if overlap == 0 and len(words) < 15:
            return True

    return False


# ─── Groq AI Scoring ─────────────────────────────────────────────────────────

def score_answer_with_ai(
    answer_text: str,
    sample_answer: str,
    question_text: str = "",
) -> Dict[str, float | str]:
    """
    Score a single answer using Groq AI.
    Falls back to rule-based scoring if AI fails.
    """
    if not answer_text or not answer_text.strip():
        return {
            "score": 0.0,
            "relevance_score": 0.0,
            "completeness_score": 0.0,
            "accuracy_score": 0.0,
            "clarity_score": 0.0,
            "feedback": "No answer provided.",
        }

    # Detect gibberish/nonsense answers early
    if _is_nonsense_answer(answer_text, sample_answer):
        return {
            "score": 0.0,
            "relevance_score": 0.0,
            "completeness_score": 0.0,
            "accuracy_score": 0.0,
            "clarity_score": 0.0,
            "feedback": "The answer appears to be nonsense, gibberish, or completely unrelated to the question. No meaningful content was provided.",
        }

    try:
        from groq import Groq

        if not config.GROQ_API_KEY:
            print("[AI Scorer] GROQ_API_KEY not set, using rule-based scoring")
            return score_answer(answer_text, sample_answer, question_text)

        client = Groq(api_key=config.GROQ_API_KEY)

        prompt = f"""You are an expert interview evaluator. Score the candidate's answer against the expected answer for the given question.

QUESTION:
{question_text}

EXPECTED ANSWER:
{sample_answer}

CANDIDATE'S ANSWER:
{answer_text}

SCORING INSTRUCTIONS:
- Score each dimension from 0.0 to 100.0
- relevance_score: How directly does the answer address the specific question asked? (0-100)
- completeness_score: How thoroughly does the answer cover the key concepts from the expected answer? (0-100)
- accuracy_score: How technically correct and aligned with the expected answer is the response? (0-100)
- clarity_score: How well-structured, coherent, and professionally communicated is the answer? (0-100)
- score: Weighted overall = relevance*{config.WEIGHT_RELEVANCE} + completeness*{config.WEIGHT_COMPLETENESS} + accuracy*{config.WEIGHT_ACCURACY} + clarity*{config.WEIGHT_CLARITY}
- feedback: Write 2-3 sentences of specific, actionable feedback. Mention what the candidate did well and what they missed. Be constructive, not generic.

IMPORTANT RULES:
- Be fair but STRICT. A vague or off-topic answer should score low.
- If the answer is completely unrelated to the question, ALL scores should be below 10.
- If the answer is nonsense, gibberish, random characters, or clearly fake (e.g. "xyz", "asdf", "test test"), give 0 for ALL scores.
- If the answer is brief but correct, give decent accuracy but lower completeness.
- Do NOT give high scores just because the answer exists - evaluate the actual CONTENT against the expected answer.
- If the answer does not demonstrate knowledge of the topic in the question, score below 20.
- Most mediocre answers should score 30-50, not 60-80. Only genuinely good answers deserve 60+.

Respond ONLY with valid JSON:
{{
  "score": <float>,
  "relevance_score": <float>,
  "completeness_score": <float>,
  "accuracy_score": <float>,
  "clarity_score": <float>,
  "feedback": "<specific feedback string>"
}}"""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=500,
        )

        result_text = response.choices[0].message.content
        result = _extract_json(result_text)

        if not result or not isinstance(result, dict):
            print(f"[WARN][AI Scorer] Invalid JSON from Groq, falling back to rule-based")
            return score_answer(answer_text, sample_answer, question_text)

        # Validate and clamp scores
        for key in ["score", "relevance_score", "completeness_score", "accuracy_score", "clarity_score"]:
            val = result.get(key)
            if val is None or not isinstance(val, (int, float)):
                print(f"[WARN][AI Scorer] Missing {key}, falling back to rule-based")
                return score_answer(answer_text, sample_answer, question_text)
            result[key] = round(max(0.0, min(100.0, float(val))), 1)

        if "feedback" not in result or not result["feedback"]:
            result["feedback"] = "AI evaluation completed."

        # Sanity check: if answer is just repeating the question, cap score
        answer_lower = answer_text.strip().lower()
        question_lower = question_text.strip().lower()
        if question_lower and answer_lower:
            q_tokens = set(_tokenize(question_lower))
            a_tokens = set(_tokenize(answer_lower))
            if q_tokens and a_tokens:
                overlap = len(q_tokens & a_tokens) / max(len(a_tokens), 1)
                if overlap > 0.7:  # answer is >70% question words — likely parroting
                    print(f"[WARN][AI Scorer] Answer appears to parrot the question (overlap={overlap:.0%}), capping score")
                    for key in ["score", "relevance_score", "completeness_score", "accuracy_score", "clarity_score"]:
                        result[key] = min(result[key], 15.0)
                    result["score"] = round(
                        result["relevance_score"] * config.WEIGHT_RELEVANCE
                        + result["completeness_score"] * config.WEIGHT_COMPLETENESS
                        + result["accuracy_score"] * config.WEIGHT_ACCURACY
                        + result["clarity_score"] * config.WEIGHT_CLARITY, 1
                    )
                    if not result["feedback"] or "parrot" not in result["feedback"].lower():
                        result["feedback"] = "The answer appears to repeat the question rather than providing a substantive response. " + (result.get("feedback") or "")

        return result

    except ImportError:
        print("[WARN][AI Scorer] groq library not installed, using rule-based scoring")
        return score_answer(answer_text, sample_answer, question_text)
    except Exception as e:
        print(f"[WARN][AI Scorer] Groq API error: {e}, falling back to rule-based scoring")
        return score_answer(answer_text, sample_answer, question_text)


def score_all_answers_with_ai(
    answers_data: List[Dict[str, str]],
) -> Dict[str, object]:
    """
    Score all answers in a single Groq AI call for efficiency and holistic evaluation.
    Falls back to per-answer rule-based scoring if AI fails.

    Args:
        answers_data: List of dicts with keys: answer_text, sample_answer, question_text

    Returns dict with:
        scored_answers: list of per-answer scores
        overall_score, recommendation, strengths, weaknesses
    """
    if not answers_data:
        return {
            "scored_answers": [],
            "overall_score": 0.0,
            "recommendation": "reject",
            "strengths": "No answers to evaluate.",
            "weaknesses": "Candidate did not provide any answers.",
        }

    try:
        from groq import Groq

        if not config.GROQ_API_KEY:
            print("[WARN][AI Batch Scorer] GROQ_API_KEY not set, using rule-based scoring")
            return _fallback_batch_score(answers_data)

        client = Groq(api_key=config.GROQ_API_KEY)

        # Build the questions block
        questions_block = ""
        for i, qa in enumerate(answers_data, 1):
            questions_block += f"""
--- Question {i} ---
Question: {qa['question_text']}
Expected Answer: {qa['sample_answer']}
Candidate's Answer: {qa['answer_text']}
"""

        prompt = f"""You are an expert interview evaluator. Score each candidate answer below against its expected answer.

{questions_block}

SCORING INSTRUCTIONS:
For EACH answer, score these dimensions (0.0 to 100.0):
- relevance_score: How directly does the answer address the question? (0-100)
- completeness_score: How thoroughly are key concepts covered? (0-100)
- accuracy_score: How technically correct is the response? (0-100)
- clarity_score: How well-structured and coherent? (0-100)
- score: Weighted = relevance*{config.WEIGHT_RELEVANCE} + completeness*{config.WEIGHT_COMPLETENESS} + accuracy*{config.WEIGHT_ACCURACY} + clarity*{config.WEIGHT_CLARITY}
- feedback: 2-3 sentences of specific, actionable feedback per answer

IMPORTANT RULES:
- Be fair but critical. Vague or off-topic answers should score LOW.
- If an answer is completely unrelated to the question (e.g., talking about leadership when asked about Python), relevance should be below 30.
- Evaluate the actual technical content, not just whether words are present.
- A brief but correct answer: decent accuracy, lower completeness.
- A long but irrelevant answer: low relevance, low accuracy.

ALSO provide:
- overall_score: Average of all individual scores (0-100)
- recommendation: "select" if overall >= 75, "next_round" if >= 50, "reject" if < 50
- strengths: 2-3 sentences about what the candidate did well across all answers
- weaknesses: 2-3 sentences about specific areas needing improvement

Respond ONLY with valid JSON:
{{
  "scored_answers": [
    {{
      "score": <float>,
      "relevance_score": <float>,
      "completeness_score": <float>,
      "accuracy_score": <float>,
      "clarity_score": <float>,
      "feedback": "<specific feedback>"
    }}
  ],
  "overall_score": <float>,
  "recommendation": "select|next_round|reject",
  "strengths": "<specific strengths>",
  "weaknesses": "<specific weaknesses>"
}}"""

        print(f"[AI][AI Batch Scorer] Scoring {len(answers_data)} answers with Groq...")

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=3000,
        )

        result_text = response.choices[0].message.content
        result = _extract_json(result_text)

        if not result or not isinstance(result, dict):
            print(f"[WARN][AI Batch Scorer] Invalid JSON, falling back to rule-based")
            return _fallback_batch_score(answers_data)

        scored = result.get("scored_answers", [])
        if len(scored) != len(answers_data):
            print(f"[WARN][AI Batch Scorer] Got {len(scored)} scores for {len(answers_data)} answers, falling back")
            return _fallback_batch_score(answers_data)

        # Validate, clamp, and sanity-check all scores
        for idx, item in enumerate(scored):
            for key in ["score", "relevance_score", "completeness_score", "accuracy_score", "clarity_score"]:
                val = item.get(key)
                if val is None or not isinstance(val, (int, float)):
                    print(f"[WARN][AI Batch Scorer] Missing {key}, falling back to rule-based")
                    return _fallback_batch_score(answers_data)
                item[key] = round(max(0.0, min(100.0, float(val))), 1)
            if not item.get("feedback"):
                item["feedback"] = "AI evaluation completed."

            # Sanity check: if answer parrots the question, cap score
            qa = answers_data[idx]
            a_tokens = set(_tokenize(qa["answer_text"].lower()))
            q_tokens = set(_tokenize(qa["question_text"].lower()))
            if q_tokens and a_tokens:
                overlap = len(q_tokens & a_tokens) / max(len(a_tokens), 1)
                if overlap > 0.7:
                    print(f"[WARN][AI Batch Scorer] Q{idx+1} parrots the question (overlap={overlap:.0%}), capping score")
                    for key in ["score", "relevance_score", "completeness_score", "accuracy_score", "clarity_score"]:
                        item[key] = min(item[key], 15.0)
                    item["score"] = round(
                        item["relevance_score"] * config.WEIGHT_RELEVANCE
                        + item["completeness_score"] * config.WEIGHT_COMPLETENESS
                        + item["accuracy_score"] * config.WEIGHT_ACCURACY
                        + item["clarity_score"] * config.WEIGHT_CLARITY, 1
                    )
                    item["feedback"] = "The answer appears to repeat the question rather than providing a substantive response. " + (item.get("feedback") or "")

        # Always recompute overall_score from individual scores (don't trust AI's overall)
        overall = sum(s["score"] for s in scored) / len(scored)
        result["overall_score"] = round(max(0.0, min(100.0, float(overall))), 1)

        # Always recompute recommendation from actual overall score
        ov = result["overall_score"]
        result["recommendation"] = "select" if ov >= 75 else "next_round" if ov >= 50 else "reject"

        if not result.get("strengths"):
            result["strengths"] = "Evaluation completed."
        if not result.get("weaknesses"):
            result["weaknesses"] = "No specific weaknesses identified."

        print(f"[OK][AI Batch Scorer] Scoring completed! Overall: {result['overall_score']}, Rec: {result['recommendation']}")
        return result

    except ImportError:
        print("[WARN][AI Batch Scorer] groq library not installed, using rule-based")
        return _fallback_batch_score(answers_data)
    except Exception as e:
        print(f"[WARN][AI Batch Scorer] Groq API error: {e}, falling back to rule-based")
        return _fallback_batch_score(answers_data)


def _fallback_batch_score(answers_data: List[Dict[str, str]]) -> Dict[str, object]:
    """Fall back to rule-based scoring for all answers."""
    from services.recommendation_engine import generate_recommendation

    scored_answers = []
    for qa in answers_data:
        result = score_answer(
            answer_text=qa["answer_text"],
            sample_answer=qa["sample_answer"],
            question_text=qa.get("question_text", ""),
        )
        scored_answers.append(result)

    rec = generate_recommendation(scored_answers)
    return {
        "scored_answers": scored_answers,
        "overall_score": rec["overall_score"],
        "recommendation": rec["recommendation"],
        "strengths": rec["strengths"],
        "weaknesses": rec["weaknesses"],
    }


# ─── Rule-based Scoring (Fallback) ───────────────────────────────────────────

def _tokenize(text: str) -> list[str]:
    """Lowercase and split into word tokens, stripping punctuation."""
    return re.findall(r"[a-z0-9]+", text.lower())


def _cosine_similarity(a: list[str], b: list[str]) -> float:
    """Compute cosine similarity between two token lists."""
    counter_a = Counter(a)
    counter_b = Counter(b)
    all_tokens = set(counter_a) | set(counter_b)
    if not all_tokens:
        return 0.0
    dot = sum(counter_a.get(t, 0) * counter_b.get(t, 0) for t in all_tokens)
    mag_a = math.sqrt(sum(v * v for v in counter_a.values()))
    mag_b = math.sqrt(sum(v * v for v in counter_b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _keyword_overlap(answer_tokens: list[str], reference_tokens: list[str]) -> float:
    """Fraction of reference keywords found in the answer."""
    if not reference_tokens:
        return 0.0
    ref_set = set(reference_tokens)
    stopwords = {
        "a", "an", "the", "is", "it", "in", "on", "at", "to", "of", "and",
        "or", "for", "with", "that", "this", "are", "was", "be", "by", "as",
        "from", "has", "have", "had", "not", "but", "can", "do", "does",
        "will", "would", "should", "could", "may", "might", "shall",
    }
    meaningful_ref = ref_set - stopwords
    if not meaningful_ref:
        return 0.5
    answer_set = set(answer_tokens)
    found = meaningful_ref & answer_set
    return len(found) / len(meaningful_ref)


def _assess_clarity(text: str) -> float:
    """Heuristic clarity score based on sentence structure."""
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    if not sentences:
        return 0.0
    avg_len = sum(len(s.split()) for s in sentences) / len(sentences)
    if 8 <= avg_len <= 25:
        length_score = 1.0
    elif avg_len < 4:
        length_score = 0.3
    elif avg_len < 8:
        length_score = 0.6
    else:
        length_score = 0.7
    count_score = min(len(sentences) / 3, 1.0)
    return (length_score * 0.6 + count_score * 0.4)


def score_answer(
    answer_text: str,
    sample_answer: str,
    question_text: str = "",
) -> Dict[str, float | str]:
    """
    Rule-based fallback scorer.
    Score a single answer using keyword matching + TF-IDF cosine similarity.
    """
    answer_tokens = _tokenize(answer_text)
    sample_tokens = _tokenize(sample_answer)
    question_tokens = _tokenize(question_text)

    if not answer_tokens:
        return {
            "score": 0.0,
            "relevance_score": 0.0,
            "completeness_score": 0.0,
            "accuracy_score": 0.0,
            "clarity_score": 0.0,
            "feedback": "No answer provided.",
        }

    # Detect nonsense/gibberish answers
    if _is_nonsense_answer(answer_text, sample_answer):
        return {
            "score": 0.0,
            "relevance_score": 0.0,
            "completeness_score": 0.0,
            "accuracy_score": 0.0,
            "clarity_score": 0.0,
            "feedback": "The answer appears to be nonsense, gibberish, or completely unrelated to the question. No meaningful content was provided.",
        }

    if question_tokens:
        relevance_raw = _cosine_similarity(answer_tokens, question_tokens)
    else:
        relevance_raw = _cosine_similarity(answer_tokens, sample_tokens)
    relevance = min(relevance_raw * 1.5, 1.0)

    completeness = _keyword_overlap(answer_tokens, sample_tokens)
    accuracy = _cosine_similarity(answer_tokens, sample_tokens)
    clarity = _assess_clarity(answer_text)

    relevance_score = round(relevance * 100, 1)
    completeness_score = round(completeness * 100, 1)
    accuracy_score = round(accuracy * 100, 1)
    clarity_score = round(clarity * 100, 1)

    overall = (
        relevance_score * config.WEIGHT_RELEVANCE
        + completeness_score * config.WEIGHT_COMPLETENESS
        + accuracy_score * config.WEIGHT_ACCURACY
        + clarity_score * config.WEIGHT_CLARITY
    )
    overall = round(min(overall, 100.0), 1)

    feedback_parts = []
    if relevance_score >= 70:
        feedback_parts.append("Good relevance to the question.")
    elif relevance_score >= 40:
        feedback_parts.append("Partially relevant — try to address the question more directly.")
    else:
        feedback_parts.append("Answer does not appear to address the question.")

    if completeness_score >= 70:
        feedback_parts.append("Covers the key points well.")
    elif completeness_score >= 40:
        feedback_parts.append("Some key concepts are missing.")
    else:
        feedback_parts.append("Many important points are not covered.")

    if accuracy_score >= 70:
        feedback_parts.append("Technically accurate response.")
    elif accuracy_score >= 40:
        feedback_parts.append("Accuracy could be improved with more precise details.")
    else:
        feedback_parts.append("Content does not align well with the expected answer.")

    if clarity_score >= 70:
        feedback_parts.append("Well-structured and clearly expressed.")
    elif clarity_score >= 40:
        feedback_parts.append("Consider using more complete sentences for clarity.")
    else:
        feedback_parts.append("Answer is too brief or poorly structured.")

    feedback = " ".join(feedback_parts) + " (rule-based scoring)"

    return {
        "score": overall,
        "relevance_score": relevance_score,
        "completeness_score": completeness_score,
        "accuracy_score": accuracy_score,
        "clarity_score": clarity_score,
        "feedback": feedback,
    }
