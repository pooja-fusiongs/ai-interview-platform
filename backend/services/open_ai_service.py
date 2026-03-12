from __future__ import annotations

import json
import logging
import random
import traceback
from typing import Optional
import re
from openai import OpenAI
import config
OPENAI_API_KEY = config.OPENAI_API_KEY

logger = logging.getLogger("ihire.ai")


def _safe_parse_json(content: str) -> dict | list:
    """Robustly parse JSON from OpenAI response, stripping fences and fixing common issues."""
    cleaned = content.strip()
    # Strip markdown code fences
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try to extract JSON array or object
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


# ═══════════════════════════════════════════════════════════════
# THE 7 INTERVIEW PHASES
# ═══════════════════════════════════════════════════════════════
INTERVIEW_PHASES = [
    "Persona",
    "Context",
    "Workflow",
    "Choice",
    "Internal",
    "Proof",
    "Lifecycle",
]

PHASE_DESCRIPTIONS = {
    "Persona": "Background, scope of experience, self-awareness",
    "Context": "Real ownership — did they actually do it or just observe it?",
    "Workflow": "How they think about process, systems, and execution",
    "Choice": "Decision-making — why this over that? What tradeoffs did they make?",
    "Internal": "Deep domain knowledge — the stuff you can't fake",
    "Proof": "Show me — real examples, real outcomes, real numbers",
    "Lifecycle": "End-to-end thinking — delivery, edge cases, failure, monitoring",
}


def get_difficulty_level(years_experience: int) -> tuple[int, str]:
    if years_experience <= 5:
        return 1, "Level 1 - Foundational"
    if years_experience <= 10:
        return 2, "Level 2 - Advanced"
    return 3, "Level 3 - Expert"


def get_question_count(duration_minutes: int) -> int:
    return 10 if duration_minutes <= 30 else 20


def _normalize_skill_weights(skill_weights: Optional[list[dict]]) -> list[dict]:
    if not skill_weights:
        return []

    cleaned = []
    for item in skill_weights:
        skill = str(item.get("skill", "")).strip()
        if not skill:
            continue
        try:
            weight = float(item.get("weightage", 0))
        except (TypeError, ValueError):
            continue
        if weight <= 0:
            continue
        cleaned.append({"skill": skill, "weightage": weight})

    total = sum(i["weightage"] for i in cleaned)
    if total <= 0:
        return []

    for item in cleaned:
        item["weightage"] = (item["weightage"] / total) * 100
    return cleaned


def _distribute_counts(total: int, weighted_items: list[dict], value_key: str) -> dict[str, int]:
    if total <= 0 or not weighted_items:
        return {}

    raw = []
    floor_sum = 0
    for item in weighted_items:
        exact = (item[value_key] / 100.0) * total
        floor_val = int(exact)
        floor_sum += floor_val
        raw.append({"key": item["key"], "floor": floor_val, "rem": exact - floor_val})

    remaining = total - floor_sum
    raw.sort(key=lambda x: x["rem"], reverse=True)
    for i in range(remaining):
        raw[i % len(raw)]["floor"] += 1

    result = {entry["key"]: entry["floor"] for entry in raw}

    # Ensure at least one question per skill whenever possible
    if total >= len(result):
        zeros = [k for k, v in result.items() if v == 0]
        while zeros:
            donor = max(result, key=lambda k: result[k])
            if result[donor] <= 1:
                break
            receiver = zeros.pop(0)
            result[donor] -= 1
            result[receiver] += 1

    return result


def _build_randomized_phase_counts(num_questions: int) -> dict[str, int]:
    """Build a randomized phase distribution — no two sessions should be identical."""
    if num_questions <= 0:
        return {}

    num_phases = len(INTERVIEW_PHASES)

    if num_questions <= num_phases:
        # Fewer questions than phases — randomly pick which phases to include
        selected_phases = random.sample(INTERVIEW_PHASES, num_questions)
        return {phase: 1 for phase in selected_phases}

    # Assign at least 1 per phase, then distribute remaining randomly
    counts = {phase: 1 for phase in INTERVIEW_PHASES}
    remaining = num_questions - num_phases

    # Distribute remaining questions randomly across phases with slight bias
    for _ in range(remaining):
        # Weighted random — give a slight bias to middle phases (Workflow, Choice, Internal)
        # but still keep it random per session
        weights = []
        for phase in INTERVIEW_PHASES:
            base = 1.0
            if phase in ("Workflow", "Choice", "Internal"):
                base = 1.5  # Slight bias toward depth-testing phases
            weights.append(base)

        total_weight = sum(weights)
        probs = [w / total_weight for w in weights]
        chosen = random.choices(INTERVIEW_PHASES, weights=probs, k=1)[0]
        counts[chosen] += 1

    return counts


def _build_question_plan(num_questions: int, skill_weights: Optional[list[dict]]) -> list[dict]:
    phase_counts = _build_randomized_phase_counts(num_questions)
    normalized_skills = _normalize_skill_weights(skill_weights)

    skill_counts: dict[str, int] = {}
    if normalized_skills:
        weighted = [{"key": s["skill"], "weight": s["weightage"]} for s in normalized_skills]
        skill_counts = _distribute_counts(num_questions, weighted, "weight")

    plan: list[dict] = []

    # Build phase sequence in order for natural interview flow
    phase_sequence: list[str] = []
    for phase in INTERVIEW_PHASES:
        phase_sequence.extend([phase] * phase_counts.get(phase, 0))
    phase_sequence = phase_sequence[:num_questions]

    # Interleave skills evenly across questions
    skill_bag = _interleave_skills(skill_counts, num_questions)

    for i in range(num_questions):
        plan.append(
            {
                "order_number": i + 1,
                "phase": phase_sequence[i] if i < len(phase_sequence) else INTERVIEW_PHASES[-1],
                "skill_focus": skill_bag[i] if i < len(skill_bag) else "",
            }
        )

    return plan


def _interleave_skills(skill_counts: dict[str, int], total: int) -> list[str]:
    """Spread skills evenly across the question list instead of grouping them."""
    if not skill_counts:
        return []

    result: list[str] = [""] * total
    sorted_skills = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)

    filled = [False] * total
    for skill, count in sorted_skills:
        if count <= 0:
            continue
        spacing = total / count
        for j in range(count):
            ideal = int(j * spacing)
            pos = ideal
            while pos < total and filled[pos]:
                pos += 1
            if pos >= total:
                pos = 0
                while pos < total and filled[pos]:
                    pos += 1
            if pos < total:
                filled[pos] = True
                result[pos] = skill

    return result


def _build_previous_questions_block(previous_questions: Optional[list[str]]) -> str:
    """Build a prompt section that instructs the AI to generate diverse questions when regenerating."""
    if not previous_questions:
        return ""

    prev_list = "\n".join(f"  - {q}" for q in previous_questions[:25])
    return f"""
REGENERATION DIVERSITY — CRITICAL:
The following questions were previously generated for this candidate. You are now regenerating.
Your new set MUST be meaningfully different — vary the angles, scenarios, and phrasing.
Some overlap is acceptable (up to ~30%), but the majority must be fresh perspectives.
Use different sub-topics, different resume anchors, different scenario framings, and different depth angles.

Previously generated questions (DO NOT repeat most of these):
{prev_list}

Strategies for diversity:
- If a previous question asked about architecture, ask about debugging or scaling instead
- If a previous question referenced Project X from the resume, reference Project Y instead
- If a previous question was scenario-based, try a comparison or deep-dive question instead
- Vary the phase style even for the same skill — e.g., switch from "tell me about" to "walk me through" to "compare and contrast"
"""


# ═══════════════════════════════════════════════════════════════
# EXPERIENCE LEVEL CALIBRATION
# ═══════════════════════════════════════════════════════════════
LEVEL_CALIBRATION = {
    1: {
        "label": "Level 1 (0-5 yrs)",
        "tone": "Foundational knowledge, task-level execution, learning ability. "
                "Ask about how they approach problems, what they've learned, and how they execute day-to-day tasks. "
                "Questions should be practical and grounded — not academic. Test their ability to debug, follow process, and grow.",
    },
    2: {
        "label": "Level 2 (5-10 yrs)",
        "tone": "Ownership, cross-functional thinking, process depth. "
                "Ask about systems they've designed, trade-offs they've navigated, and how they work across teams. "
                "Questions should probe whether they can own problems end-to-end, mentor others, and make principled decisions.",
    },
    3: {
        "label": "Level 3 (10-30 yrs)",
        "tone": "Strategic thinking, systems-level judgment, leadership and trade-off decisions. "
                "Ask about organization-level impact, technical strategy, scaling challenges, and how they've influenced direction. "
                "Questions should test their ability to reason about complex systems, navigate ambiguity, and make decisions with incomplete information.",
    },
}


def generate_interview_questions(
    job_title: str,
    company: str,
    job_description: str,
    years_experience: int,
    duration_minutes: int,
    candidate_name: str = "",
    resume_text: str = "",
    skill_weights: Optional[list[dict]] = None,
    previous_questions: Optional[list[str]] = None,
) -> list[dict]:
    """Generate interview questions using the 7-phase framework with the refined system prompt engine."""

    difficulty_level, difficulty_label = get_difficulty_level(years_experience)
    num_questions = get_question_count(duration_minutes)
    question_plan = _build_question_plan(num_questions, skill_weights)
    normalized_skill_weights = _normalize_skill_weights(skill_weights)
    level_config = LEVEL_CALIBRATION[difficulty_level]

    # ── Build resume block ──
    resume_block = ""
    if resume_text and resume_text.strip():
        resume_block = f"""
=== CANDIDATE RESUME (READ CAREFULLY — USE THIS TO PERSONALIZE EVERY QUESTION) ===
{resume_text[:6000]}
=== END RESUME ===

You have read this candidate's resume. Now use it like a real interviewer would:
- Reference their companies by name (e.g., "At [Company]...")
- Reference their projects and achievements specifically
- Connect their listed technologies/tools to the skills being tested
- Ground abstract skill questions in their actual work experience
At least 70% of your questions MUST reference specific details from this resume.
"""
    else:
        resume_block = "No resume provided. Generate strong skill-focused questions based on JD context."

    plan_json = json.dumps(question_plan, ensure_ascii=True, indent=2)
    skill_json = json.dumps(normalized_skill_weights, ensure_ascii=True)

    # ── Build skill allocation summary ──
    skill_allocation_text = ""
    if normalized_skill_weights:
        skill_alloc_parts = []
        for item in question_plan:
            if item.get("skill_focus"):
                skill_alloc_parts.append(f"  Question {item['order_number']}: MUST be about {item['skill_focus']}")
        skill_allocation_text = "\n".join(skill_alloc_parts)

    # ── Phase descriptions for the prompt ──
    phase_desc_text = ""
    for phase, desc in PHASE_DESCRIPTIONS.items():
        phase_desc_text += f"  {phase}: {desc}\n"

    # ════════════════════════════════════════════════════════════
    # SYSTEM PROMPT — The Expert Interviewer Engine
    # ════════════════════════════════════════════════════════════
    system_prompt = f"""You are an expert interviewer. Your job is to generate interview questions the way a seasoned domain expert would — questions that feel natural, probe intelligently, and reveal whether a candidate truly knows their craft.

You are building this interview on behalf of a recruiter who may not be a domain expert themselves. Your output must be good enough that an expert in the field would look at these questions and say: "Yes, this is exactly what I would ask."

EXPERIENCE LEVEL CALIBRATION:
{level_config['tone']}
The tone, framing, and depth of every question must reflect this level — not just the topic.

THE 7 INTERVIEW PHASES (thinking framework — questions must feel like a natural conversation, not a checklist):
{phase_desc_text}

CORE QUESTION LOGIC — 3-LAYER SYSTEM:

Layer 1 — Skill Weightage (ONLY when explicitly defined by the recruiter):
If skills and percentage weights are defined, this is the PRIMARY driver of question distribution. Enforce it strictly.

Layer 2 — Job Description:
When no weightage is defined, extract core skills and expectations from the JD. This drives question topics.

Layer 3 — Resume (PERSONALIZATION LAYER):
A great interviewer reads the candidate's resume before the interview and uses it to make every question feel personal, specific, and grounded in their real experience. You MUST do the same.

RESUME USAGE — THIS IS CRITICAL:
You MUST actively reference the candidate's resume throughout the interview. Use specific company names, project names, technologies, tools, achievements, and metrics mentioned in the resume.
- Reference their previous/current companies by name: "During your time at [Company]...", "At [Company], you worked on..."
- Reference specific projects: "You built [Project] — walk me through..."
- Reference specific technologies from their stack: "You've used [Tool/Framework] at [Company]..."
- Reference specific achievements or scale: "You mentioned scaling to [X] users..."
- Cross-reference resume with skills: "Your experience with [resume_tool] connects to [skill_being_tested] — how did you..."

A GOOD QUESTION grounds the skill being tested in the candidate's actual experience:
- Skill=Statistics, Resume mentions Random Forest at Company X → "At [Company X], you built models using Random Forest. Walk me through how you evaluated model performance — what statistical methods did you use for feature importance and bias-variance analysis?"
- Skill=Python, Resume mentions data pipeline at Company Y → "At [Company Y], you built a data pipeline in Python. How did you handle error recovery and data validation at scale?"
- Skill=Deployment, Resume mentions AWS + ML models → "You deployed ML models on AWS at [Company]. Walk me through your deployment pipeline — from model training to production serving."

WHEN NOT to force a resume reference:
- When the resume has NO relevant connection to the skill at all (e.g., Skill=Statistics, Resume only mentions "Worked at Deloitte" with no stats context) → Ask a clean, rigorous skill question without forcing the company name in.
- When the skill isn't mentioned anywhere in the resume → Frame it as a professional competency question. Don't say "as mentioned in your resume" for skills not listed. But you CAN still reference their company context: "In a role like the one you held at [Company], how would you approach [skill topic]?"

THE GOAL: At least 70% of questions should reference something specific from the resume — a company, project, tool, or achievement. The remaining questions can be clean skill questions when no meaningful resume connection exists.

NEVER mention the candidate's job title or position name in questions.

OUTPUT FORMAT — Return ONLY a JSON array of {num_questions} objects with exactly these keys:
- "skill": The skill name (exactly as defined by recruiter or derived from JD)
- "phase": The phase name from the plan
- "question_text": The interview question
- "expected_answer": What a strong candidate would say — written clearly enough for a non-domain recruiter to follow and evaluate (3-5 sentences)
- "strong_indicators": What a good answer looks like (2-3 bullet points as a single string, separated by newlines)
- "red_flags": What should concern you (2-3 bullet points as a single string, separated by newlines)
- "key_concepts": Comma-separated list of 6-10 terms, frameworks, or reasoning patterns that signal real understanding

Always return strict valid JSON only."""

    # ════════════════════════════════════════════════════════════
    # USER PROMPT
    # ════════════════════════════════════════════════════════════
    user_prompt = f"""Generate exactly {num_questions} interview questions following the 7-phase interview framework.

POSITION:
- Title: {job_title}
- Company: {company}
- Experience: {years_experience} years
- Duration: {duration_minutes} minutes
- Candidate: {candidate_name or 'Candidate'}

JOB DESCRIPTION:
{job_description or f'Standard requirements for a {job_title} role'}

{resume_block}

MANDATORY QUESTION PLAN (follow this EXACTLY — each question's order, phase, and skill_focus are non-negotiable):
{plan_json}

{"STRICT SKILL ALLOCATION (each question MUST focus on the assigned skill):" if skill_allocation_text else "No specific skill weights defined — derive topics from JD and resume context."}
{skill_allocation_text}

{"Skill Weightage (normalized):" if normalized_skill_weights else ""}
{skill_json if normalized_skill_weights else ""}

REMEMBER:
- Every question must match its assigned phase's PURPOSE (Persona=background, Context=ownership, Workflow=process, Choice=tradeoffs, Internal=deep knowledge, Proof=real examples, Lifecycle=end-to-end)
- If a question has skill_focus assigned, the ENTIRE question must be about that skill — the phase only determines question STYLE
- ACTIVELY reference the candidate's resume: use their company names, project names, technologies, and achievements to personalize questions. At least 70% of questions must reference something specific from the resume.
- When a skill intersects with resume content, ALWAYS ground the question in their real experience (e.g., "At [Company], you used [Tool] for [Project]. How did you...")
- Only skip resume references when there is genuinely no meaningful connection between the skill and resume content
- Never say "as mentioned in your resume" for skills not in the resume — but you CAN still reference their company context even for new skills
- Expected answers must be clear enough for a non-domain recruiter to evaluate
- Include specific evaluation signals (strong indicators, red flags, key concepts) for each question

UNIQUENESS — CRITICAL:
Every single question MUST be unique. Even when two questions share the same skill or phase, they must ask about DIFFERENT topics, scenarios, or angles.
NEVER produce two questions with the same or nearly identical wording — even across different skills. If two skills could share a topic (e.g., "walk me through an end-to-end request flow"), differentiate them by focusing on the specific skill's perspective, using different resume projects, or asking about entirely different aspects.

BAD question (too generic): "What best practices do you follow when writing Python code?"
GOOD question (personalized): "At [Company from resume], you built [specific project]. Walk me through how you structured the Python codebase — what patterns did you use for maintainability and testing?"
{_build_previous_questions_block(previous_questions)}"""

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.8,
            max_tokens=12000,
        )

        content = response.choices[0].message.content or ""
        questions = _safe_parse_json(content)
        result = []
        for i, q in enumerate(questions[:num_questions]):
            plan_item = question_plan[i] if i < len(question_plan) else {"phase": "General", "skill_focus": ""}

            # ── Build the suggested_answer field with Evaluation Signals ──
            expected_answer = q.get("expected_answer", "").strip()
            strong_indicators = q.get("strong_indicators", "").strip()
            red_flags = q.get("red_flags", "").strip()
            key_concepts = q.get("key_concepts", "").strip()

            suggested_answer = _format_suggested_answer(
                expected_answer=expected_answer,
                strong_indicators=strong_indicators,
                red_flags=red_flags,
                key_concepts=key_concepts,
                fallback_index=i,
            )

            skill_name = q.get("skill", "").strip() or plan_item.get("skill_focus", "").strip()
            result.append(
                {
                    "question_text": q.get('question_text', '').strip(),
                    "suggested_answer": suggested_answer,
                    "category": plan_item["phase"],
                    "difficulty": difficulty_label,
                    "order_number": i + 1,
                    "skill_focus": skill_name or None,
                }
            )

        # ── Deduplicate: remove questions with identical question_text ──
        seen_texts: set[str] = set()
        deduped: list[dict] = []
        for q_item in result:
            raw_text = q_item["question_text"]
            normalised = re.sub(r'^\[[^\]]*\]\s*', '', raw_text).strip().lower()
            normalised = re.sub(r'\s+', ' ', normalised)
            if normalised not in seen_texts:
                seen_texts.add(normalised)
                deduped.append(q_item)

        removed = len(result) - len(deduped)
        if removed > 0:
            logger.info(f"Dedup removed {removed} duplicate question(s), keeping {len(deduped)}")

        # Re-number after dedup
        for idx, q_item in enumerate(deduped):
            q_item["order_number"] = idx + 1
        result = deduped

        logger.info(f"✅ AI generated {len(result)} unique questions (requested {num_questions})")
        return result

    except Exception as e:
        logger.error(f"⚠️ OpenAI API FAILED — returning fallback questions. Error: {type(e).__name__}: {e}")
        logger.error(f"OPENAI_API_KEY set: {bool(OPENAI_API_KEY)}, key prefix: {OPENAI_API_KEY[:8] + '...' if OPENAI_API_KEY else 'EMPTY'}")
        logger.error(traceback.format_exc())
        fallback = generate_fallback_questions(
            job_title=job_title,
            num_questions=num_questions,
            difficulty=difficulty_label,
            years_experience=years_experience,
            question_plan=question_plan,
        )
        logger.warning(f"⚠️ Returning {len(fallback)} FALLBACK questions")
        return fallback


def _format_suggested_answer(
    expected_answer: str,
    strong_indicators: str,
    red_flags: str,
    key_concepts: str,
    fallback_index: int = 0,
) -> str:
    """Build the structured suggested_answer field with Evaluation Signals."""

    parts = []

    if expected_answer:
        parts.append(expected_answer)
    else:
        parts.append("A strong candidate would demonstrate deep, practical knowledge with specific examples from their experience.")

    parts.append("")
    parts.append("Evaluation Signals:")

    if strong_indicators:
        parts.append(f"✅ Strong indicators: {strong_indicators}")
    else:
        parts.append("✅ Strong indicators: Specific examples, clear reasoning, acknowledgment of trade-offs")

    if red_flags:
        parts.append(f"🔴 Red flags: {red_flags}")
    else:
        parts.append("🔴 Red flags: Vague answers, buzzword-dropping without depth, inability to explain decisions")

    if key_concepts:
        parts.append(f"🔑 Key concepts: {key_concepts}")
    else:
        pool = _get_fallback_key_concepts(fallback_index)
        parts.append(f"🔑 Key concepts: {pool}")

    return "\n".join(parts)


def _get_fallback_key_concepts(index: int) -> str:
    """Return contextual key concepts as fallback."""
    concept_pools = [
        "system design, scalability, latency optimization, load balancing, observability, SLOs",
        "query optimization, indexing, transaction management, isolation levels, read replicas, caching",
        "CI/CD, canary deployment, rollback strategy, release gates, feature flags, monitoring",
        "API design, contract testing, backward compatibility, pagination, rate limiting, idempotency",
        "incident response, root cause analysis, alert tuning, postmortem, MTTR, runbooks",
        "testing strategy, unit tests, integration tests, flakiness control, mocks, coverage",
        "security hardening, OAuth2, RBAC, secret rotation, audit logging, threat modeling",
    ]
    return concept_pools[index % len(concept_pools)]


def score_transcript(
    transcript: str,
    job_title: str,
    job_description: str,
    candidate_name: str,
    questions_and_answers: list[dict],
) -> dict:
    questions_context = ""
    for i, qa in enumerate(questions_and_answers, 1):
        questions_context += f"\nQ{i}: {qa.get('question', '')}\nExpected: {qa.get('suggested_answer', '')}\n"

    prompt = f"""You are a senior hiring manager evaluating an interview transcript.
Score the candidate out of 10 based on the actual quality of their responses.

Position: {job_title}
Candidate: {candidate_name}

Job Description:
{job_description[:3000]}

Interview Questions & Expected Answers (use as benchmark — compare what was expected vs what was said):
{questions_context[:4000]}

Actual Interview Transcript:
{transcript[:8000]}

EVALUATION CRITERIA:
1) Technical Competence (30%) — Did they demonstrate real depth or just surface-level buzzwords?
2) Problem-Solving Ability (25%) — Did they show structured thinking and decision trade-offs?
3) Communication Skills (15%) — Were answers clear, concise, and well-structured?
4) Experience Relevance (15%) — Does their actual experience align with what's needed?
5) Cultural Fit & Enthusiasm (15%) — Did they show genuine interest and team alignment?

SCORING GUIDELINES:
- 9-10: Exceptional — deep expertise, specific examples, strong reasoning
- 7-8: Strong — solid answers with good examples but minor gaps
- 5-6: Average — surface-level answers, missing depth or specifics
- 3-4: Below average — vague, unclear, or incorrect in key areas
- 1-2: Poor — unable to answer most questions meaningfully

Return strict JSON object with:
- score: number (1-10, decimals allowed, be honest and precise)
- feedback: string (4-6 sentences — cite specific strong and weak moments from the transcript, be constructive but honest)
"""

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert interviewer. Return valid JSON only.",
                },
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
    """Generate a polished, client-ready report card with key questions and concise answer summaries."""

    transcript_qa_seed = _extract_transcript_qa_pairs(transcript_text)

    has_transcript = bool(transcript_text and transcript_text.strip())

    prompt = f"""You are generating a professional interview report card that will be shared with the CLIENT (hiring company).
It must be polished, concise, and present the candidate fairly.

Candidate: {candidate_name}
Role: {job_title}

Scores (pre-calculated — use as-is):
{json.dumps(score_breakdown, ensure_ascii=True)}

{"FULL INTERVIEW TRANSCRIPT (this is the ONLY source of truth for performed_well, areas_to_improve, and transcript_qa):" if has_transcript else "NO TRANSCRIPT AVAILABLE — return empty arrays for performed_well, areas_to_improve, and transcript_qa."}
{transcript_text[:12000] if has_transcript else ''}

{"AI evaluation feedback:" if transcript_feedback else ""}
{transcript_feedback if transcript_feedback else ""}

═══════════════════════════════════════════════
GENERATE A CLIENT-READY REPORT WITH EXACTLY THESE SECTIONS:
═══════════════════════════════════════════════

1. "scores" — Return the 3 pre-calculated scores as-is.
   Array of: {{ "label": str, "score": number|null }}
   Labels: "Overall Rating", "iHire Rating", "Recruiter Rating"

2. "performed_well" — 4-6 bullets on where the candidate excelled.
   RULES:
   - MUST be based EXCLUSIVELY on what the candidate actually said in the transcript.
   - Each bullet must cite a SPECIFIC answer/moment from the transcript.
   - If no transcript is available, return an EMPTY array [].
   - Do NOT invent or assume strengths — only cite what is evidenced in the transcript.
   - Be professional and evidence-based — this goes to the client.
   - Example: "Demonstrated strong system design expertise when explaining the migration from monolith to microservices at their previous role, including clear reasoning on service boundaries."
   - NOT: "Good communication skills" or "Seemed confident"

3. "areas_to_improve" — 3-5 bullets on gaps observed.
   RULES:
   - MUST be based EXCLUSIVELY on what the candidate actually said (or failed to answer) in the transcript.
   - Each bullet must cite a SPECIFIC weak/shallow answer from the transcript.
   - If no transcript is available, return an EMPTY array [].
   - Do NOT invent or assume weaknesses — only cite what is evidenced in the transcript.
   - Be constructive, not harsh — this goes to the client.
   - Example: "When asked about database optimization strategies, the response was surface-level and did not address indexing, query planning, or specific tools used."
   - NOT: "Needs to improve technical skills"

4. "transcript_qa" — ONLY questions that were ACTUALLY ASKED during the interview (from the transcript).
   CRITICAL RULES:
   - ONLY include questions that appear in the TRANSCRIPT — questions the interviewer actually asked.
   - Do NOT include pre-generated interview questions that were not part of the transcript.
   - If no transcript is available, return an EMPTY array [].
   - Skip only small-talk and warm-up pleasantries. Include every substantive question.
   For each:
   - "question": the question that was actually asked in the transcript (clean it up for readability)
   - "answer_summary": Your OBSERVATION of the candidate's response — NOT a verbatim transcript copy.
     Write a 2-3 sentence observation in third person describing what the candidate conveyed.
     Format: "The candidate mentioned X, explained Y, and touched on Z."
     Focus on: what key points they made, what they demonstrated understanding of,
     what they missed or were vague about, and how well they articulated their answer.
     NEVER copy the transcript text directly — always paraphrase and analyze.

   This section is the most important for the client — they want to see what was actually asked
   and your professional observation of how the candidate responded.

Return strict JSON:
{{ "scores": [...], "performed_well": [...], "areas_to_improve": [...], "transcript_qa": [...] }}
"""

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You write polished, professional interview report cards for clients (hiring companies). "
                        "The report must be evidence-based, concise, and presentable. "
                        "NEVER include judgmental verdicts like 'not recommended' or 'below threshold'. Only present scores and observations. "
                        "EVERYTHING in performed_well, areas_to_improve, and transcript_qa MUST come from the ACTUAL TRANSCRIPT only. "
                        "Do NOT use pre-generated interview questions — only questions actually asked in the transcript. "
                        "If no transcript is provided, return empty arrays for those sections. "
                        "Write answer summaries as OBSERVATIONS (what the candidate conveyed) — never copy transcript verbatim. "
                        "Use third person: 'The candidate mentioned...', 'The candidate explained...', 'The candidate touched on...'. "
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

        # Ensure transcript-based sections are empty when no transcript exists
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
            current_question = re.sub(r"^(recruiter:|interviewer:|hiring manager:|q:)\s*", "", line, flags=re.IGNORECASE)
            current_answer_parts = []
            continue

        if lower.startswith(answer_markers):
            cleaned = re.sub(r"^(candidate:|a:|answer:)\s*", "", line, flags=re.IGNORECASE)
            current_answer_parts.append(cleaned)
            continue

        # If no explicit marker, append to current answer context
        if current_question:
            current_answer_parts.append(line)

    if current_question:
        pairs.append({
            "question": current_question,
            "answer": " ".join(current_answer_parts).strip()
        })

    # Keep only meaningful QA items
    return [p for p in pairs if p["question"] and p["answer"]]


def generate_fallback_questions(
    job_title: str,
    num_questions: int,
    difficulty: str,
    years_experience: int = 0,
    question_plan: Optional[list[dict]] = None,
) -> list[dict]:
    """Generate deterministic fallback questions if AI API fails."""

    # Multiple variants per phase so repeated phases don't produce duplicate questions
    templates = {
        "Persona": [
            (
                "Walk me through your professional journey — what kind of systems do you primarily build today, and what domains are you most comfortable being evaluated on?",
                "A strong candidate clearly defines their professional scope, domains of expertise, and signals which tools and areas they own. They speak with specificity about the scale and impact of their current work.",
                "✅ Strong indicators: Clear role ownership, specific technologies mentioned, articulates what excites them about their domain",
                "🔴 Red flags: Vague scope, cannot articulate what they specifically own, generic buzzwords without substance",
                "🔑 Key concepts: domain expertise, ownership, technical depth, professional growth, system scale",
            ),
            (
                "How would you describe the technical complexity of the work you do today versus two years ago — what has changed in how you approach problems?",
                "A strong candidate shows growth trajectory, increased scope, and evolving technical judgment. They articulate how their problem-solving has matured.",
                "✅ Strong indicators: Clear growth arc, specific examples of increased complexity, reflective self-awareness",
                "🔴 Red flags: No discernible growth, same responsibilities described differently, cannot articulate evolution",
                "🔑 Key concepts: growth mindset, technical maturity, scope expansion, self-awareness, complexity management",
            ),
        ],
        "Context": [
            (
                "Tell me about a recent project you owned end-to-end — what problem were you solving, what was your specific responsibility, and what outcomes did you drive?",
                "A strong candidate provides a detailed breakdown with measurable outcomes, explicit ownership, and realistic constraints they navigated. They distinguish between contribution and leadership.",
                "✅ Strong indicators: Measurable impact, clear personal ownership, specific technical decisions they made",
                "🔴 Red flags: Uses 'we' for everything without clarifying personal role, generic feature descriptions without accountability",
                "🔑 Key concepts: ownership, measurable outcomes, technical decision-making, constraints, trade-offs",
            ),
            (
                "Describe a situation where you had to take over or rescue a struggling project — what was broken, how did you diagnose it, and what did you change?",
                "A strong candidate shows diagnostic thinking, prioritisation under pressure, and the ability to turn around a difficult situation with concrete actions.",
                "✅ Strong indicators: Structured diagnosis, clear prioritisation, measurable improvement after intervention",
                "🔴 Red flags: Blames others without proposing solutions, cannot describe specific actions taken, vague outcomes",
                "🔑 Key concepts: diagnosis, prioritisation, turnaround strategy, accountability, stakeholder management",
            ),
        ],
        "Workflow": [
            (
                "Pick one of the systems you built and walk me through an end-to-end request flow — from the user action to the final response, including every service, database, and integration point it touches.",
                "A strong candidate traces a complete flow connecting components, dependencies, failure paths, and observability points. They understand how systems interact and where failures can propagate.",
                "✅ Strong indicators: Complete end-to-end tracing, awareness of failure modes, mentions monitoring and observability",
                "🔴 Red flags: Disconnected component-level explanations, cannot explain what happens between services",
                "🔑 Key concepts: system architecture, request flow, dependencies, failure modes, observability, integration points",
            ),
            (
                "Walk me through how your team handles a production incident from detection to resolution — what is the process, who gets involved, and how do you prevent recurrence?",
                "A strong candidate describes a structured incident response process, clear communication protocols, and post-mortem practices that lead to systemic improvements.",
                "✅ Strong indicators: Structured incident response, blameless post-mortems, concrete prevention measures",
                "🔴 Red flags: Ad-hoc firefighting, no post-mortem culture, same incidents recurring",
                "🔑 Key concepts: incident response, on-call, post-mortem, root cause analysis, prevention, communication protocols",
            ),
        ],
        "Choice": [
            (
                "Compare two approaches or tools you have used in production and explain your decision logic — what trade-offs did you weigh and why did you choose one over the other?",
                "A strong candidate articulates context-specific trade-offs, constraints, and why one approach was better for their situation. They acknowledge downsides of their chosen approach.",
                "✅ Strong indicators: Context-specific reasoning, acknowledges downsides, considers alternatives",
                "🔴 Red flags: One-size-fits-all statements, cannot explain downsides of chosen approach, no awareness of alternatives",
                "🔑 Key concepts: trade-off analysis, decision framework, context-specific reasoning, alternatives evaluation",
            ),
            (
                "Tell me about a technical decision you made that you would make differently today — what did you learn and how has it changed your decision-making framework?",
                "A strong candidate demonstrates intellectual honesty, explains what new information changed their view, and shows an evolved decision-making process.",
                "✅ Strong indicators: Honest self-reflection, specific lessons learned, improved decision framework",
                "🔴 Red flags: Claims to never make wrong decisions, cannot identify what they would change, superficial reflection",
                "🔑 Key concepts: retrospective analysis, intellectual honesty, continuous improvement, decision evolution",
            ),
        ],
        "Internal": [
            (
                "Pick a core tool or technology you use daily and explain how it works internally. Then describe how you would debug a common production failure related to it.",
                "A strong candidate demonstrates deep internal mechanics knowledge and walks through a structured debugging sequence with root cause analysis. They go beyond API-level understanding.",
                "✅ Strong indicators: Internal architecture knowledge, structured debugging approach, specific tools and commands",
                "🔴 Red flags: Cookbook-level answers without understanding why, cannot explain what happens under the hood",
                "🔑 Key concepts: internal mechanics, debugging methodology, root cause analysis, observability tools, production readiness",
            ),
            (
                "Explain a concept in your domain that most people use at a surface level but you understand deeply — what do they miss and why does it matter?",
                "A strong candidate reveals deep expertise by explaining nuances that separate surface-level users from experts. They connect theory to practical implications.",
                "✅ Strong indicators: Goes beyond documentation-level knowledge, connects internals to real-world impact, teaches effectively",
                "🔴 Red flags: Recites documentation without insight, cannot explain why internals matter, surface-level understanding",
                "🔑 Key concepts: deep expertise, nuanced understanding, theory-to-practice connection, teaching ability",
            ),
        ],
        "Proof": [
            (
                "Walk me through a specific technical achievement — give me the numbers, the before and after, and explain exactly how you got there.",
                "A strong candidate provides concrete metrics, explains their methodology, and demonstrates the impact of their work with real data points. They can answer follow-up questions on the specifics.",
                "✅ Strong indicators: Specific metrics, clear methodology, quantifiable before/after comparison",
                "🔴 Red flags: Cannot provide specific numbers, vague claims without evidence, takes credit without details",
                "🔑 Key concepts: quantifiable impact, methodology, metrics-driven thinking, evidence-based reasoning",
            ),
            (
                "Give me an example of a time you significantly improved the performance, reliability, or cost-efficiency of a system — what was the measurable impact?",
                "A strong candidate describes a specific optimization with clear before/after metrics, explains their approach to identifying the bottleneck, and quantifies the business impact.",
                "✅ Strong indicators: Clear bottleneck identification, specific optimization techniques, measurable business impact",
                "🔴 Red flags: Vague improvements without numbers, cannot explain the root cause of the problem, no business context",
                "🔑 Key concepts: performance optimization, bottleneck analysis, cost-efficiency, reliability engineering, business impact",
            ),
        ],
        "Lifecycle": [
            (
                "After you finish implementing a feature, walk me through what happens next — how do you deploy it, monitor it, and ensure it's working correctly in production?",
                "A strong candidate covers CI/CD, release strategy, rollback plans, monitoring/alerting, and post-release validation. They understand work isn't done until it's shipped and maintained.",
                "✅ Strong indicators: Complete deployment pipeline knowledge, monitoring and alerting awareness, rollback procedures",
                "🔴 Red flags: Considers work done at PR merge, no awareness of monitoring or production readiness",
                "🔑 Key concepts: CI/CD, deployment strategy, monitoring, alerting, rollback, production readiness, on-call ownership",
            ),
            (
                "Describe how you handle backward compatibility and safe rollouts when shipping changes that affect other teams or services.",
                "A strong candidate explains versioning strategies, feature flags, canary deployments, and communication protocols for cross-team changes.",
                "✅ Strong indicators: Versioning strategy, feature flags, gradual rollout, cross-team communication",
                "🔴 Red flags: Ships breaking changes without coordination, no rollback plan, unaware of downstream impact",
                "🔑 Key concepts: backward compatibility, feature flags, canary deployment, API versioning, cross-team coordination",
            ),
        ],
    }

    plan = question_plan or _build_question_plan(num_questions, None)
    results: list[dict] = []
    phase_usage_count: dict[str, int] = {}  # Track which variant to use per phase

    for i in range(num_questions):
        item = plan[i] if i < len(plan) else {"phase": INTERVIEW_PHASES[-1], "skill_focus": ""}
        phase = item.get("phase", INTERVIEW_PHASES[-1])
        variants = templates.get(phase, templates[INTERVIEW_PHASES[-1]])

        # Pick the next unused variant for this phase
        usage_idx = phase_usage_count.get(phase, 0)
        template = variants[usage_idx % len(variants)]
        phase_usage_count[phase] = usage_idx + 1

        question_text, expected_answer, strong, red_flags, key_concepts = template

        skill_focus = item.get("skill_focus", "").strip()
        suggested = _format_suggested_answer(
            expected_answer=expected_answer,
            strong_indicators=strong.replace("✅ Strong indicators: ", ""),
            red_flags=red_flags.replace("🔴 Red flags: ", ""),
            key_concepts=key_concepts.replace("🔑 Key concepts: ", ""),
            fallback_index=i,
        )

        results.append(
            {
                "question_text": question_text.format(job_title=job_title),
                "suggested_answer": suggested,
                "category": phase,
                "difficulty": difficulty,
                "order_number": i + 1,
            }
        )

    return results
