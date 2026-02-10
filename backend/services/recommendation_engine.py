"""
Recommendation Engine
Aggregates per-question scores into an overall score (0-100),
produces a recommendation (select / next_round / reject),
and generates strengths/weaknesses summaries.
"""

from typing import List, Dict, Optional
from config import SCORE_SELECT_THRESHOLD, SCORE_NEXT_ROUND_THRESHOLD


def generate_recommendation(
    answer_scores: List[Dict],
) -> Dict[str, object]:
    """
    Given a list of scored answers (each dict has score, relevance_score, etc.),
    produce an overall recommendation.

    Returns:
        {
            "overall_score": float,
            "recommendation": "select" | "next_round" | "reject",
            "strengths": str,
            "weaknesses": str,
        }
    """
    if not answer_scores:
        return {
            "overall_score": 0.0,
            "recommendation": "reject",
            "strengths": "No answers to evaluate.",
            "weaknesses": "Candidate did not provide any answers.",
        }

    # Aggregate scores
    total = len(answer_scores)
    avg_score = sum(a.get("score", 0) for a in answer_scores) / total
    avg_relevance = sum(a.get("relevance_score", 0) for a in answer_scores) / total
    avg_completeness = sum(a.get("completeness_score", 0) for a in answer_scores) / total
    avg_accuracy = sum(a.get("accuracy_score", 0) for a in answer_scores) / total
    avg_clarity = sum(a.get("clarity_score", 0) for a in answer_scores) / total

    overall_score = round(avg_score, 1)

    # Recommendation
    if overall_score >= SCORE_SELECT_THRESHOLD:
        recommendation = "select"
    elif overall_score >= SCORE_NEXT_ROUND_THRESHOLD:
        recommendation = "next_round"
    else:
        recommendation = "reject"

    # Strengths
    strengths = []
    if avg_relevance >= 70:
        strengths.append("Answers are consistently relevant to the questions asked")
    if avg_completeness >= 70:
        strengths.append("Demonstrates comprehensive knowledge of key concepts")
    if avg_accuracy >= 70:
        strengths.append("Technically accurate responses")
    if avg_clarity >= 70:
        strengths.append("Clear and well-structured communication")

    # Count high-scoring answers
    high_scores = sum(1 for a in answer_scores if a.get("score", 0) >= 75)
    if high_scores > 0:
        strengths.append(f"Scored above 75 on {high_scores} out of {total} questions")

    if not strengths:
        strengths.append("Shows willingness to attempt all questions")

    # Weaknesses
    weaknesses = []
    if avg_relevance < 50:
        weaknesses.append("Answers often miss the focus of the question")
    if avg_completeness < 50:
        weaknesses.append("Responses lack coverage of important concepts")
    if avg_accuracy < 50:
        weaknesses.append("Technical accuracy needs improvement")
    if avg_clarity < 50:
        weaknesses.append("Communication could be clearer and more structured")

    low_scores = sum(1 for a in answer_scores if a.get("score", 0) < 40)
    if low_scores > 0:
        weaknesses.append(f"Scored below 40 on {low_scores} out of {total} questions")

    if not weaknesses:
        weaknesses.append("No significant weaknesses identified")

    return {
        "overall_score": overall_score,
        "recommendation": recommendation,
        "strengths": ". ".join(strengths) + ".",
        "weaknesses": ". ".join(weaknesses) + ".",
    }
