"""
Groq LLM Service (Alternative to Gemini)
Provides transcript scoring using Groq API.
FREE, FAST, and NO QUOTA LIMITS!
"""

import json
import re
from typing import List, Dict, Any, Optional

def _extract_json(text: str) -> Any:
    """Extract JSON from LLM response text."""
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
    print(f"🚀 [score_transcript_groq] Starting transcript scoring...")
    print(f"   - Questions to score: {len(questions_with_answers)}")
    print(f"   - Transcript length: {len(transcript_text)} chars")
    
    try:
        from groq import Groq
        import config
        
        if not config.GROQ_API_KEY:
            print("❌ [score_transcript_groq] GROQ_API_KEY is NOT SET!")
            return None
        
        print(f"✅ [score_transcript_groq] GROQ_API_KEY found: {config.GROQ_API_KEY[:20]}...")
        
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

CRITICAL: Each question must have a DIFFERENT answer extracted from the transcript.

Respond ONLY with valid JSON:
{{
  "per_question": [
    {{
      "question_id": <id>,
      "extracted_answer": "The specific answer the candidate gave for THIS question",
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
  "strengths": "Summary of strengths",
  "weaknesses": "Summary of weaknesses"
}}"""
        
        print(f"🤖 [score_transcript_groq] Calling Groq API...")
        
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
        print(f"🤖 [score_transcript_groq] Got response, extracting JSON...")
        
        result = _extract_json(result_text)
        
        if not result or not isinstance(result, dict):
            print(f"❌ [score_transcript_groq] Invalid format returned")
            return None
        
        print(f"✅ [score_transcript_groq] JSON extracted successfully!")
        
        # Validate required fields
        if "per_question" not in result or "overall_score" not in result:
            print("❌ Groq scoring missing required fields")
            return None
        
        # Normalize recommendation
        rec = result.get("recommendation", "reject").lower()
        if rec not in {"select", "next_round", "reject"}:
            score = float(result.get("overall_score", 0))
            rec = "select" if score >= 7.5 else "next_round" if score >= 5.0 else "reject"
            result["recommendation"] = rec
        
        print(f"\n✅✅✅ [score_transcript_groq] SCORING COMPLETED! ✅✅✅")
        print(f"   Overall Score: {result.get('overall_score', 'N/A')}")
        print(f"   Recommendation: {result.get('recommendation', 'N/A')}")
        print(f"   Questions scored: {len(result.get('per_question', []))}")
        print(f"{'='*60}\n")
        
        return result
    
    except ImportError:
        print(f"\n❌ [score_transcript_groq] Groq library not installed!")
        print(f"   Run: pip install groq")
        return None
    
    except Exception as e:
        import traceback
        print(f"\n❌❌❌ [score_transcript_groq] EXCEPTION OCCURRED ❌❌❌")
        print(f"   Error type: {type(e).__name__}")
        print(f"   Error message: {str(e)}")
        print(f"   Full traceback:")
        traceback.print_exc()
        print(f"{'='*60}\n")
        return None
