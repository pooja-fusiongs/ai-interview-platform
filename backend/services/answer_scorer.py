"""
Answer Scoring Service
Scores candidate answers using keyword matching + TF-IDF cosine similarity.
Produces 4 dimension scores (relevance, completeness, accuracy, clarity)
and an overall 0-10 score with written feedback.
"""

import re
import math
from collections import Counter
from typing import Dict, Tuple


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
    # Filter out very short / stopword-like tokens from reference
    stopwords = {
        "a", "an", "the", "is", "it", "in", "on", "at", "to", "of", "and",
        "or", "for", "with", "that", "this", "are", "was", "be", "by", "as",
        "from", "has", "have", "had", "not", "but", "can", "do", "does",
        "will", "would", "should", "could", "may", "might", "shall",
    }
    meaningful_ref = ref_set - stopwords
    if not meaningful_ref:
        return 0.5  # All stopwords – neutral score
    answer_set = set(answer_tokens)
    found = meaningful_ref & answer_set
    return len(found) / len(meaningful_ref)


def _assess_clarity(text: str) -> float:
    """Heuristic clarity score based on sentence structure."""
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    if not sentences:
        return 0.0
    # Reward: multiple sentences, moderate length
    avg_len = sum(len(s.split()) for s in sentences) / len(sentences)
    # Ideal sentence length 8-25 words
    if 8 <= avg_len <= 25:
        length_score = 1.0
    elif avg_len < 4:
        length_score = 0.3
    elif avg_len < 8:
        length_score = 0.6
    else:
        length_score = 0.7
    # Reward having more than one sentence
    count_score = min(len(sentences) / 3, 1.0)
    return (length_score * 0.6 + count_score * 0.4)


def score_answer(
    answer_text: str,
    sample_answer: str,
    question_text: str = "",
) -> Dict[str, float | str]:
    """
    Score a single answer against the sample/gold-standard answer.

    Returns dict with keys:
      score, relevance_score, completeness_score, accuracy_score,
      clarity_score, feedback
    All scores are 0.0 – 10.0.
    """
    answer_tokens = _tokenize(answer_text)
    sample_tokens = _tokenize(sample_answer)
    question_tokens = _tokenize(question_text)

    # Handle empty answers
    if not answer_tokens:
        return {
            "score": 0.0,
            "relevance_score": 0.0,
            "completeness_score": 0.0,
            "accuracy_score": 0.0,
            "clarity_score": 0.0,
            "feedback": "No answer provided.",
        }

    # --- Relevance: cosine similarity between answer and question ---
    if question_tokens:
        relevance_raw = _cosine_similarity(answer_tokens, question_tokens)
    else:
        relevance_raw = _cosine_similarity(answer_tokens, sample_tokens)
    relevance = min(relevance_raw * 1.5, 1.0)  # scale up, cap at 1

    # --- Completeness: keyword overlap with sample answer ---
    completeness = _keyword_overlap(answer_tokens, sample_tokens)

    # --- Accuracy: cosine similarity between answer and sample answer ---
    accuracy = _cosine_similarity(answer_tokens, sample_tokens)

    # --- Clarity: heuristic based on sentence structure ---
    clarity = _assess_clarity(answer_text)

    # Convert to 0-10 scale
    relevance_score = round(relevance * 10, 1)
    completeness_score = round(completeness * 10, 1)
    accuracy_score = round(accuracy * 10, 1)
    clarity_score = round(clarity * 10, 1)

    # Weighted overall score
    overall = (
        relevance_score * 0.30
        + completeness_score * 0.25
        + accuracy_score * 0.30
        + clarity_score * 0.15
    )
    overall = round(min(overall, 10.0), 1)

    # Generate feedback
    feedback_parts = []
    if relevance_score >= 7:
        feedback_parts.append("Good relevance to the question.")
    elif relevance_score >= 4:
        feedback_parts.append("Partially relevant — try to address the question more directly.")
    else:
        feedback_parts.append("Answer does not appear to address the question.")

    if completeness_score >= 7:
        feedback_parts.append("Covers the key points well.")
    elif completeness_score >= 4:
        feedback_parts.append("Some key concepts are missing.")
    else:
        feedback_parts.append("Many important points are not covered.")

    if accuracy_score >= 7:
        feedback_parts.append("Technically accurate response.")
    elif accuracy_score >= 4:
        feedback_parts.append("Accuracy could be improved with more precise details.")
    else:
        feedback_parts.append("Content does not align well with the expected answer.")

    if clarity_score >= 7:
        feedback_parts.append("Well-structured and clearly expressed.")
    elif clarity_score >= 4:
        feedback_parts.append("Consider using more complete sentences for clarity.")
    else:
        feedback_parts.append("Answer is too brief or poorly structured.")

    return {
        "score": overall,
        "relevance_score": relevance_score,
        "completeness_score": completeness_score,
        "accuracy_score": accuracy_score,
        "clarity_score": clarity_score,
        "feedback": " ".join(feedback_parts),
    }
