"""
Question Generator V2 — ported from client repo (ihire-fgs).

This is a verbatim port of `backend/app/services/ai_service.py` (lines 1-1533, 1957-2120)
from the ihire-fgs client repo. Only changes from the source:
- Import path: `from app.config import OPENAI_API_KEY` → `from config import OPENAI_API_KEY`
- Model name pulled from `config.V2_QUESTION_GEN_MODEL` (default "gpt-4.1")
- New adapter function `adapt_to_our_schema()` at bottom that maps the
  client's output dict shape to our InterviewQuestion field names.
- score_resume_against_jd, score_transcript, generate_report_card,
  _extract_transcript_qa_pairs, transcribe_audio_file are NOT ported here
  (scoring stays in ihire_ai_service.py / answer_scorer.py).

Activated via USE_V2_QUESTION_GEN feature flag from config.py.
On any error in this module, callers must fall back to the existing
Groq → OpenAI → Gemini chain so the live flow never breaks.
"""
from __future__ import annotations

import json
import logging
import random
import traceback
from typing import Optional
import re
from openai import OpenAI

import config
from config import OPENAI_API_KEY

logger = logging.getLogger("ihire.ai")


def _safe_parse_json(content: str) -> dict | list:
    """Robustly parse JSON from LLM response, stripping fences and fixing common issues."""
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

    raise json.JSONDecodeError("Could not parse structured response from scoring engine", cleaned, 0)


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
    """Question count tuned to interview duration.

    Baseline (per product owner): 10 questions for 30 minutes,
    20 questions for 60 minutes. Linear interpolation in between
    and a small bump for 90-minute deep-dives.
    """
    if duration_minutes <= 30:
        return 10
    if duration_minutes <= 45:
        return 15
    if duration_minutes <= 60:
        return 20
    return 25


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


def _classify_skills_against_resume(
    resume_text: str,
    skill_weights: Optional[list[dict]],
    job_description: str,
) -> str:
    """Pre-classify each weighted skill against the resume BEFORE sending to the LLM.

    This eliminates the #1 source of hallucination: the LLM guessing whether a skill
    is in the resume. We do a deterministic keyword scan and tell the LLM explicitly.

    CRITICAL DISTINCTION:
    - Category A1: Skill appears in a WORK EXPERIENCE section (tied to a company/project)
      → Safe to say "At [Company], you used [Skill]..."
    - Category A2: Skill is listed ONLY in a skills/technologies section (no company context)
      → Can say "You have [Skill] experience" but CANNOT tie it to any specific company
    """
    if not resume_text or not resume_text.strip():
        return ""

    resume_lower = resume_text.lower()

    # Build a mapping of skill → related/analogous terms for smart matching
    SKILL_ALIASES: dict[str, list[str]] = {
        "mongodb": ["mongo", "mongodb", "document database", "mongoose"],
        "postgresql": ["postgres", "postgresql", "psql", "pg_"],
        "mysql": ["mysql", "mariadb"],
        "redis": ["redis", "in-memory store"],
        "elasticsearch": ["elasticsearch", "elastic", "kibana", "elk"],
        "docker": ["docker", "dockerfile", "docker-compose"],
        "kubernetes": ["kubernetes", "k8s", "kubectl", "helm", "eks", "aks", "gke"],
        "aws": ["aws", "amazon web services", "ec2", "s3", "lambda", "cloudfront", "dynamodb", "sqs", "sns"],
        "gcp": ["gcp", "google cloud", "bigquery", "cloud run", "gke"],
        "azure": ["azure", "microsoft cloud"],
        "python": ["python", "django", "flask", "fastapi", "pytorch", "pandas", "numpy"],
        "javascript": ["javascript", "js", "typescript", "ts", "node", "react", "angular", "vue", "next.js", "express"],
        "java": ["java", "spring", "spring boot", "jvm", "maven", "gradle"],
        "go": ["golang", " go ", "gin", "goroutine"],
        "rust": ["rust", "cargo", "tokio"],
        "c++": ["c++", "cpp"],
        "react": ["react", "reactjs", "react.js", "next.js", "nextjs", "redux"],
        "angular": ["angular", "angularjs", "rxjs"],
        "vue": ["vue", "vuejs", "vue.js", "nuxt"],
        "node.js": ["node", "nodejs", "node.js", "express", "nestjs", "koa"],
        "sql": ["sql", "mysql", "postgresql", "postgres", "oracle", "mssql", "sqlite", "database query"],
        "nosql": ["nosql", "mongodb", "dynamodb", "cassandra", "couchdb", "firebase"],
        "graphql": ["graphql", "apollo", "gql"],
        "rest api": ["rest", "restful", "api", "endpoint"],
        "ci/cd": ["ci/cd", "cicd", "jenkins", "github actions", "gitlab ci", "circleci", "travis"],
        "terraform": ["terraform", "iac", "infrastructure as code"],
        "machine learning": ["machine learning", "ml", "deep learning", "neural network", "tensorflow", "pytorch", "scikit"],
        "data engineering": ["data pipeline", "etl", "data engineering", "airflow", "spark", "kafka"],
        "system design": ["system design", "architecture", "microservices", "distributed system", "scalability"],
    }

    skills_to_check: list[str] = []
    if skill_weights:
        skills_to_check = [s["skill"] for s in skill_weights if s.get("skill")]
    else:
        return ""

    if not skills_to_check:
        return ""

    # ── Split resume into work experience vs skills-only sections ──
    work_experience_text = _extract_work_experience_section(resume_text)
    work_exp_lower = work_experience_text.lower() if work_experience_text else ""

    classifications: list[str] = []
    for skill in skills_to_check:
        skill_lower = skill.lower().strip()

        # Check all possible keyword matches (direct + aliases)
        keywords_to_check = [skill_lower]
        keywords_to_check.extend(
            [a.lower() for a in SKILL_ALIASES.get(skill_lower, [])]
        )

        # First: check if skill appears in WORK EXPERIENCE section
        found_in_work_exp = False
        found_keyword_work = None
        for kw in keywords_to_check:
            if kw in work_exp_lower:
                found_in_work_exp = True
                found_keyword_work = kw
                break

        if found_in_work_exp:
            # Category A1: Skill is in work experience — extract company context
            company_context = _extract_company_context_for_skill(work_experience_text, skill, keywords_to_check)
            classifications.append(
                f"  ✅ {skill}: Category A1 — CONFIRMED in work experience.\n"
                f"     {company_context}\n"
                f"     INSTRUCTION: When asking about {skill}, you MUST weave in the company name and project details above. "
                f"Do NOT ask a generic {skill} question — ground it in their actual work."
            )
            continue

        # Second: check if skill appears ANYWHERE in the resume (likely skills section only)
        found_in_resume = False
        found_keyword_resume = None
        for kw in keywords_to_check:
            if kw in resume_lower:
                found_in_resume = True
                found_keyword_resume = kw
                break

        if found_in_resume:
            # Category A2: Skill is listed in skills section BUT NOT in any work experience
            classifications.append(
                f"  ⚠️ {skill}: LISTED IN SKILLS SECTION ONLY — NOT in any work experience (Category A2). "
                f"The candidate has listed {skill} as a skill but has NOT described using it at any specific company or project. "
                f"You may say 'You have {skill} experience' but NEVER say 'At [Company], you used {skill}' — "
                f"that would be fabricating context. Ask about their general {skill} knowledge or give them a scenario."
            )
            continue

        # Third: check for related/analogous skills
        related_found: list[str] = []
        for other_skill, other_aliases in SKILL_ALIASES.items():
            if other_skill == skill_lower:
                continue
            for alias in other_aliases:
                if alias.lower() in resume_lower:
                    if _skills_are_related(skill_lower, other_skill):
                        related_found.append(other_skill)
                    break

        if related_found:
            related_str = ", ".join(related_found[:3])
            classifications.append(
                f"  🔗 {skill}: NOT in resume, but RELATED skills found: [{related_str}] (Category B) — "
                f"bridge from {related_str} to {skill}"
            )
        else:
            classifications.append(
                f"  ❌ {skill}: NOT FOUND in resume, no related skills (Category C) — "
                f"ask clean knowledge question, do NOT reference resume"
            )

    return "\n".join(classifications)


def _extract_work_experience_section(resume_text: str) -> str:
    """Extract ONLY the work experience section from a resume, excluding skills/education/summary."""
    if not resume_text:
        return ""

    lines = resume_text.split("\n")
    work_section_lines: list[str] = []
    in_work_section = False
    work_start_markers = [
        "work experience", "professional experience", "experience",
        "employment history", "work history", "career history",
    ]
    work_end_markers = [
        "skills", "technical skills", "education", "certifications",
        "achievements", "awards", "personal project", "projects",
        "urls", "references", "hobbies", "interests", "profile summary",
        "summary", "objective",
    ]

    for line in lines:
        stripped = line.strip().lower()
        cleaned = re.sub(r'[:\-—=_*#|]', '', stripped).strip()

        if not in_work_section:
            for marker in work_start_markers:
                if cleaned == marker or cleaned.startswith(marker + " "):
                    in_work_section = True
                    break
        else:
            hit_end = False
            for marker in work_end_markers:
                if cleaned == marker or cleaned.startswith(marker + " "):
                    hit_end = True
                    break
            if hit_end:
                in_work_section = False
                continue
            work_section_lines.append(line)

    return "\n".join(work_section_lines)


def _skills_are_related(skill_a: str, skill_b: str) -> bool:
    """Determine if two skills are in the same domain (for Category B bridging)."""
    DOMAIN_GROUPS = [
        {"mongodb", "postgresql", "mysql", "redis", "elasticsearch", "sql", "nosql", "dynamodb", "cassandra", "sqlite"},
        {"python", "java", "javascript", "go", "rust", "c++", "typescript"},
        {"react", "angular", "vue", "node.js", "next.js", "svelte"},
        {"aws", "gcp", "azure"},
        {"docker", "kubernetes", "terraform", "ansible"},
        {"docker", "kubernetes"},
        {"aws", "docker", "kubernetes", "terraform"},
        {"machine learning", "data engineering", "statistics", "data science"},
        {"ci/cd", "devops", "jenkins", "github actions"},
        {"rest api", "graphql", "grpc"},
        {"html", "css", "javascript", "react", "angular", "vue"},
    ]
    for group in DOMAIN_GROUPS:
        if skill_a in group and skill_b in group:
            return True
    return False


# ═══════════════════════════════════════════════════════════════
# COMPANY RECENCY PARSING
# ═══════════════════════════════════════════════════════════════

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def _parse_recency_score(header: str) -> float:
    """Parse a company-header line into a sortable recency score."""
    if not header:
        return 0.0
    h_lower = header.lower()
    if re.search(r'\b(present|current|now|till\s*date|today)\b', h_lower):
        return 9_999_999.0

    month_year = re.findall(
        r'\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)[a-z]*\.?\s*[, ]?\s*((?:19|20)\d{2})\b',
        h_lower,
    )
    if month_year:
        scores = [int(y) * 12 + _MONTHS.get(m, 6) for m, y in month_year]
        return float(max(scores))

    years = re.findall(r'\b(19|20)(\d{2})\b', header)
    if years:
        latest = max(int(c + d) for c, d in years)
        return float(latest * 12 + 6)

    return 0.0


def _extract_ranked_company_contexts(
    work_experience_text: str,
    skill: str,
    keywords: list[str],
) -> list[dict]:
    """Extract companies that mention a skill, ranked from MOST RECENT to OLDEST."""
    if not work_experience_text:
        return []

    lines = work_experience_text.split("\n")
    current_header = ""
    current_recency = 0.0
    insertion_order = 0

    raw_by_header: dict[str, dict] = {}

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        is_header = bool(
            re.search(r'\b(19|20)\d{2}\b', stripped)
            or re.search(r'\b(present|current)\b', stripped, re.IGNORECASE)
        ) and len(stripped) < 200 and not stripped.startswith(("•", "-", "●", "○", "▪", "*"))

        if is_header:
            current_header = stripped
            current_recency = _parse_recency_score(stripped)
            insertion_order += 1
            if current_header not in raw_by_header:
                raw_by_header[current_header] = {
                    "header": current_header,
                    "recency": current_recency,
                    "order": insertion_order,
                    "snippets": [],
                }
            continue

        if not current_header:
            continue

        line_lower = stripped.lower()
        for kw in keywords:
            if kw in line_lower:
                snippet = stripped[:140].lstrip("•-●○▪* ").strip()
                raw_by_header[current_header]["snippets"].append(snippet)
                break

    matched = [v for v in raw_by_header.values() if v["snippets"]]
    if not matched:
        return []

    def sort_key(entry: dict) -> tuple[float, int]:
        if entry["recency"] > 0:
            return (-entry["recency"], 0)
        return (0.0, entry["order"])

    matched.sort(key=sort_key)

    ranked: list[dict] = []
    for rank, entry in enumerate(matched):
        header = entry["header"]
        name_match = re.split(r'[|\[\(\t]|\s{2,}|\s-\s|,\s', header, maxsplit=1)
        company_name = name_match[0].strip() if name_match else header
        company_name = re.sub(r'\s*[-—–]\s*.+$', '', company_name).strip()
        if len(company_name) > 80:
            company_name = company_name[:80].rstrip()
        if not company_name:
            company_name = header[:60]

        ranked.append({
            "company": company_name,
            "header": header,
            "snippet": entry["snippets"][0],
            "all_snippets": entry["snippets"],
            "recency_rank": rank,
        })

    return ranked


def _extract_company_context_for_skill(work_experience_text: str, skill: str, keywords: list[str]) -> str:
    """Wrapper that returns a human-readable string of recency-ranked companies."""
    if not work_experience_text:
        return f"Confirmed in work experience — reference the specific company/project."

    ranked = _extract_ranked_company_contexts(work_experience_text, skill, keywords)
    if not ranked:
        return f"Confirmed in work experience — reference the specific company/project where they used {skill}."

    top = ranked[:4]
    company_list = ", ".join(f"{c['company']} (recency #{c['recency_rank'] + 1})" for c in top)
    evidence_lines = "\n     ".join(
        f"#{c['recency_rank'] + 1} {c['company']} [{c['header']}]: \"{c['snippet']}\""
        for c in top
    )
    return (
        f"COMPANIES WHERE THIS SKILL APPEARS (most recent → oldest):\n"
        f"     {company_list}\n"
        f"     Resume evidence:\n     {evidence_lines}"
    )


def _build_skill_personalization_map(
    resume_text: str,
    skill_weights: Optional[list[dict]],
) -> dict[str, dict]:
    """Build a per-skill map with category and personalization context."""
    if not resume_text or not skill_weights:
        return {}

    resume_lower = resume_text.lower()
    work_experience_text = _extract_work_experience_section(resume_text)
    work_exp_lower = work_experience_text.lower() if work_experience_text else ""

    SKILL_ALIASES: dict[str, list[str]] = {
        "mongodb": ["mongo", "mongodb", "document database", "mongoose"],
        "postgresql": ["postgres", "postgresql", "psql", "pg_"],
        "mysql": ["mysql", "mariadb"],
        "redis": ["redis", "in-memory store"],
        "elasticsearch": ["elasticsearch", "elastic", "kibana", "elk"],
        "docker": ["docker", "dockerfile", "docker-compose"],
        "kubernetes": ["kubernetes", "k8s", "kubectl", "helm", "eks", "aks", "gke"],
        "aws": ["aws", "amazon web services", "ec2", "s3", "lambda", "cloudfront", "dynamodb", "sqs", "sns"],
        "gcp": ["gcp", "google cloud", "bigquery", "cloud run", "gke"],
        "azure": ["azure", "microsoft cloud"],
        "python": ["python", "django", "flask", "fastapi", "pytorch", "pandas", "numpy", "scikit"],
        "javascript": ["javascript", "js", "typescript", "ts", "node", "react", "angular", "vue", "next.js", "express"],
        "java": ["java", "spring", "spring boot", "jvm", "maven", "gradle"],
        "go": ["golang", " go ", "gin", "goroutine"],
        "rust": ["rust", "cargo", "tokio"],
        "c++": ["c++", "cpp"],
        "react": ["react", "reactjs", "react.js", "next.js", "nextjs", "redux"],
        "angular": ["angular", "angularjs", "rxjs"],
        "vue": ["vue", "vuejs", "vue.js", "nuxt"],
        "node.js": ["node", "nodejs", "node.js", "express", "nestjs", "koa"],
        "sql": ["sql", "mysql", "postgresql", "postgres", "oracle", "mssql", "sqlite"],
        "nosql": ["nosql", "mongodb", "dynamodb", "cassandra", "couchdb", "firebase"],
        "graphql": ["graphql", "apollo", "gql"],
        "rest api": ["rest", "restful", "api", "endpoint"],
        "ci/cd": ["ci/cd", "cicd", "jenkins", "github actions", "gitlab ci", "circleci"],
        "terraform": ["terraform", "iac", "infrastructure as code"],
        "machine learning": ["machine learning", "ml", "deep learning", "neural network", "tensorflow", "pytorch", "scikit"],
        "data engineering": ["data pipeline", "etl", "data engineering", "airflow", "spark", "kafka"],
    }

    result: dict[str, dict] = {}

    for sw in skill_weights:
        skill = sw.get("skill", "").strip()
        if not skill:
            continue

        skill_lower = skill.lower()
        keywords = [skill_lower] + [a.lower() for a in SKILL_ALIASES.get(skill_lower, [])]

        found_in_work = any(kw in work_exp_lower for kw in keywords)

        if found_in_work and work_experience_text:
            ranked = _extract_ranked_company_contexts(work_experience_text, skill, keywords)
            context = _extract_company_context_for_skill(work_experience_text, skill, keywords)
            result[skill_lower] = {
                "category": "A1",
                "hint": context,
                "ranked_companies": ranked,
            }
        elif any(kw in resume_lower for kw in keywords):
            result[skill_lower] = {
                "category": "A2",
                "hint": f"Listed in skills section only. No company used {skill}. Ask scenario/knowledge questions.",
            }
        else:
            related = []
            for other_skill, aliases in SKILL_ALIASES.items():
                if other_skill == skill_lower:
                    continue
                if any(a.lower() in resume_lower for a in aliases):
                    if _skills_are_related(skill_lower, other_skill):
                        related.append(other_skill)
            if related:
                result[skill_lower] = {
                    "category": "B",
                    "hint": f"Not in resume, but related skills found: {', '.join(related[:3])}. Bridge from their experience.",
                }
            else:
                result[skill_lower] = {
                    "category": "C",
                    "hint": "Not in resume at all. Pure knowledge question — no resume references.",
                }

    return result


def _compute_recency_targets(num_questions: int) -> list[int]:
    """Return a per-question list of target recency ranks (0=most recent)."""
    if num_questions <= 0:
        return []
    if num_questions == 1:
        return [0]

    rank2 = round(num_questions * 0.10)
    rank1 = round(num_questions * 0.25)
    if num_questions <= 8:
        rank2 = min(rank2, 1)
    if num_questions <= 5:
        rank2 = 0
        rank1 = max(1, round(num_questions * 0.25))
    rank0 = num_questions - rank1 - rank2

    if rank0 < rank1:
        diff = rank1 - rank0 + 1
        rank1 -= diff
        rank0 += diff

    targets = ([0] * rank0) + ([1] * rank1) + ([2] * rank2)

    spread: list[int] = [0] * num_questions
    older_slots: list[int] = []
    older_count = rank1 + rank2
    if older_count > 0 and num_questions >= 4:
        step = max(1, (num_questions - 2) / (older_count + 1))
        for i in range(older_count):
            pos = int(round((i + 1) * step)) + 1
            pos = max(1, min(num_questions - 2, pos))
            while pos in older_slots and pos < num_questions - 1:
                pos += 1
            older_slots.append(pos)
    elif older_count > 0:
        older_slots = [min(1, num_questions - 1)] * older_count

    older_assignments = ([1] * rank1) + ([2] * rank2)
    for slot, rank in zip(older_slots, older_assignments):
        if 0 <= slot < num_questions:
            spread[slot] = rank

    return spread


def _select_company_for_question(
    ranked_companies: list[dict],
    target_rank: int,
) -> Optional[dict]:
    """Pick the best company for a question given a target recency rank."""
    if not ranked_companies:
        return None

    for c in ranked_companies:
        if c["recency_rank"] == target_rank:
            return c

    sorted_by_distance = sorted(
        ranked_companies,
        key=lambda c: (abs(c["recency_rank"] - target_rank), c["recency_rank"]),
    )
    return sorted_by_distance[0] if sorted_by_distance else None


def _build_enriched_question_plan(
    question_plan: list[dict],
    personalization_map: dict[str, dict],
) -> list[dict]:
    """Enrich the question plan with per-question personalization hints."""
    num_questions = len(question_plan)
    recency_targets = _compute_recency_targets(num_questions)

    enriched = []
    for idx, item in enumerate(question_plan):
        new_item = dict(item)
        skill = item.get("skill_focus", "").lower().strip()
        if skill and skill in personalization_map:
            pmap = personalization_map[skill]
            new_item["category"] = pmap["category"]
            new_item["personalization"] = pmap["hint"]

            ranked = pmap.get("ranked_companies") or []
            if pmap["category"] == "A1" and ranked:
                target_rank = recency_targets[idx] if idx < len(recency_targets) else 0
                max_avail = max(c["recency_rank"] for c in ranked)
                if target_rank > max_avail:
                    target_rank = max_avail

                chosen = _select_company_for_question(ranked, target_rank)
                if chosen:
                    new_item["target_company"] = chosen["company"]
                    new_item["target_company_header"] = chosen["header"]
                    new_item["target_company_snippet"] = chosen["snippet"]
                    new_item["target_recency_rank"] = chosen["recency_rank"]
                    new_item["recency_label"] = (
                        "most recent" if chosen["recency_rank"] == 0
                        else "2nd most recent" if chosen["recency_rank"] == 1
                        else "3rd most recent" if chosen["recency_rank"] == 2
                        else f"#{chosen['recency_rank'] + 1} most recent"
                    )
                    new_item["personalization"] = (
                        f"USE THIS COMPANY: {chosen['company']} "
                        f"({new_item['recency_label']} project — recency rank {chosen['recency_rank']})\n"
                        f"     Header: {chosen['header']}\n"
                        f"     Resume evidence: \"{chosen['snippet']}\"\n"
                        f"     INSTRUCTION: Reference {chosen['company']} (NOT any other company "
                        f"from the resume) when crafting this question."
                    )
        enriched.append(new_item)
    return enriched


def _build_previous_questions_block(previous_questions: Optional[list[str]]) -> str:
    """Build a prompt section that instructs the AI to generate diverse questions when regenerating."""
    if not previous_questions:
        return ""

    prev_list = "\n".join(f"  - {q}" for q in previous_questions[:25])
    return f"""
REGENERATION DIVERSITY — CRITICAL:
The following questions were previously generated for this candidate. You are now regenerating.
Your new set MUST be ENTIRELY DIFFERENT — not just rephrased versions of the same questions.
The same underlying rules, skill weights, and logic apply — but the OUTPUT must be fresh.

HARD RULES FOR REGENERATION:
1. NO question should be a rephrased version of a previous question. "Walk me through X" → "Tell me about X" is NOT acceptable as a new question.
2. Each question must target a DIFFERENT sub-topic or angle within the skill than what was previously asked.
3. If a previous question asked about architecture → ask about debugging, performance, or migration instead.
4. If a previous question referenced Project X from the resume → reference Project Y or a different aspect of Project X.
5. If a previous question was scenario-based → try a comparison, deep-dive, or "what would you do differently" question instead.
6. Maximum 20% overlap with previous questions. At least 80% must be genuinely new perspectives.

Previously generated questions (DO NOT repeat these — generate completely different ones):
{prev_list}
"""


# ═══════════════════════════════════════════════════════════════
# EXPERIENCE LEVEL CALIBRATION
# ═══════════════════════════════════════════════════════════════
LEVEL_CALIBRATION = {
    1: {
        "label": "Level 1 (0-5 yrs)",
        "tone": "Foundational knowledge, task-level execution, learning ability. "
                "Ask about how they approach problems, what they've learned, and how they execute day-to-day tasks. "
                "Questions should be practical and grounded — not academic. Test their ability to debug, follow process, and grow. "
                "DIFFICULTY RANGE: Start with 'explain how X works' → build to 'debug this scenario' → end with 'design a small system'. "
                "Even at Level 1, the LAST 2-3 questions should push them — test if they can think beyond tutorials.",
    },
    2: {
        "label": "Level 2 (5-10 yrs)",
        "tone": "Ownership, cross-functional thinking, process depth. "
                "Ask about systems they've designed, trade-offs they've navigated, and how they work across teams. "
                "Questions should probe whether they can own problems end-to-end, mentor others, and make principled decisions. "
                "DIFFICULTY RANGE: Start with 'walk me through your design' → build to 'what breaks at 10x scale?' → end with 'how do you handle conflicting constraints?'. "
                "By question 60%, you should be asking things that require battle scars to answer well.",
    },
    3: {
        "label": "Level 3 (10-30 yrs)",
        "tone": "Strategic thinking, systems-level judgment, leadership and trade-off decisions. "
                "Ask about organization-level impact, technical strategy, scaling challenges, and how they've influenced direction. "
                "Questions should test their ability to reason about complex systems, navigate ambiguity, and make decisions with incomplete information. "
                "DIFFICULTY RANGE: Start with 'explain your architecture philosophy' → build to 'how do you handle org-wide technical debt?' → end with 'design a system under contradictory constraints with no clear answer'. "
                "The last few questions should have NO single right answer — they test judgment, not knowledge.",
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
    num_questions_override: Optional[int] = None,
) -> list[dict]:
    """Generate interview questions using the 7-phase framework with the refined system prompt engine.

    `num_questions_override` — when set, takes priority over the duration-based formula.
    Used to honor `Job.number_of_questions` set by the recruiter.
    """

    difficulty_level, difficulty_label = get_difficulty_level(years_experience)
    if num_questions_override and num_questions_override > 0:
        num_questions = int(num_questions_override)
    else:
        num_questions = get_question_count(duration_minutes)
    question_plan = _build_question_plan(num_questions, skill_weights)
    normalized_skill_weights = _normalize_skill_weights(skill_weights)
    level_config = LEVEL_CALIBRATION[difficulty_level]

    # ── Pre-classify skills against resume (deterministic — removes LLM guesswork) ──
    skill_classification_block = _classify_skills_against_resume(
        resume_text=resume_text,
        skill_weights=normalized_skill_weights,
        job_description=job_description,
    )

    # ── Build per-skill personalization map and enrich the question plan ──
    personalization_map = _build_skill_personalization_map(
        resume_text=resume_text,
        skill_weights=normalized_skill_weights,
    )
    enriched_plan = _build_enriched_question_plan(question_plan, personalization_map)

    # ── Build resume block ──
    resume_block = ""
    if resume_text and resume_text.strip():
        resume_block = f"""
=== CANDIDATE RESUME (READ THIS DEEPLY — A GREAT INTERVIEWER KNOWS THEIR CANDIDATE) ===
{resume_text[:6000]}
=== END RESUME ===

HIRING CONTEXT: The candidate is interviewing at "{company}" for "{job_title}". "{company}" is the HIRING company — NOT a past employer.

{"═══ PRE-CLASSIFIED SKILL-RESUME MATCHING (FOLLOW EXACTLY — DO NOT OVERRIDE) ═══" if skill_classification_block else ""}
{"Each skill has been pre-scanned against the resume. The classification below is FINAL:" if skill_classification_block else ""}
{skill_classification_block}

{"" if skill_classification_block else "Before writing EACH question, classify the skill being tested:"}
{"" if skill_classification_block else "- If the skill IS in the resume → personalize using their real companies, projects, and experience (Category A)"}
{"" if skill_classification_block else "- If the skill is NOT in the resume but a RELATED tool IS → bridge from their actual experience to the tested skill (Category B)"}
{"" if skill_classification_block else "- If the skill is NOT in the resume at all → ask clean knowledge questions WITHOUT referencing the resume (Category C)"}

KEY RULES:
→ ✅ skills (A1): MUST reference the specific company and project from the resume — make it personal and human.
→ ⚠️ skills (A2): Acknowledge the skill but do NOT tie it to any company.
→ ❌ skills (C): Clean knowledge question, zero resume references.
→ NEVER reference "{company}" as a past employer — it's the hiring company.
"""
    else:
        resume_block = "No resume provided. Generate strong skill-focused questions based on JD context."

    plan_json = json.dumps(enriched_plan, ensure_ascii=True, indent=2)
    skill_json = json.dumps(normalized_skill_weights, ensure_ascii=True)

    skill_allocation_text = ""
    if normalized_skill_weights:
        skill_alloc_parts = []
        for item in enriched_plan:
            if item.get("skill_focus"):
                skill_alloc_parts.append(f"  Question {item['order_number']}: MUST be about {item['skill_focus']}")
        skill_allocation_text = "\n".join(skill_alloc_parts)

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
For each skill with weightage:
- If the skill appears in the resume → reference the EXACT context (company, project, or situation) where the candidate used it
- If the skill does NOT appear in the resume → ask a straightforward question about that skill WITHOUT forcing a false contextual reference

Layer 2 — Job Description + Resume Combined Intelligence (when NO skill weightage is defined):
When no weightage is defined, you must COMBINE insights from both the JD and the resume to generate questions:
- Extract core skills and expectations from the JD — these drive question TOPICS
- Cross-reference with the resume to find where the candidate has relevant experience
- Use the resume to PERSONALIZE JD-derived questions (reference real projects, companies, tools)
- You must clearly distinguish between what comes from the JD (requirements) and what comes from the resume (candidate's background)
- The JD tells you WHAT to ask about; the resume tells you HOW to personalize it

Layer 3 — Resume (PERSONALIZATION LAYER — THIS IS WHAT MAKES YOU SOUND HUMAN):
A great interviewer reads the candidate's resume deeply before the interview. When they ask questions, it's obvious they've done their homework — they name companies, reference specific projects, and ask follow-ups to real work. This is what you must do for every A1 skill. Your questions should make the candidate think "wow, they actually read my resume."

RESUME-SKILL MATCHING — THE CORE OF GREAT INTERVIEWING:

You have the candidate's resume. A great interviewer reads it deeply and uses it to make questions feel personal, grounded, and conversational — like you actually know who you're talking to. Your #1 job is to sound like a human who prepared for this interview.

The pre-classification above tells you EXACTLY how each skill relates to the resume. Follow it precisely.

═══ CATEGORY A1 — Skill CONFIRMED in WORK EXPERIENCE (tied to a real company/project) ═══
THIS IS WHERE YOU SHINE. These questions MUST feel deeply personal and human.

MANDATORY for every A1 question — you MUST do ALL of the following:
✓ Reference the candidate's REAL experience at a SPECIFIC company or on a SPECIFIC project from their resume
✓ Frame the question as a natural follow-up to their actual work — like you're continuing a conversation
✓ The company/project reference can appear ANYWHERE in the question — beginning, middle, or as context for a deeper challenge

🎯 TARGET-COMPANY RULE — RECENCY-WEIGHTED COVERAGE (CRITICAL — DO NOT VIOLATE):
The plan below assigns each A1 question a SPECIFIC `target_company` (the company the question MUST reference)
and a `target_recency_rank` (0 = most recent, 1 = 2nd most recent, 2 = 3rd most recent, etc.).

The distribution is intentional — the candidate has worked at MULTIPLE companies, and a fair interview
must probe across their broader experience, not only their latest gig. About 65% of A1 questions are
anchored to the most-recent project, ~25% to the 2nd most recent, and ~10% to the 3rd. This is by design.

RULES:
1. If a question's plan entry has `target_company` set, you MUST reference THAT company (and only that
   company) in the question. Do NOT substitute a different company from the resume.
2. Use the `target_company_snippet` (resume evidence) to ground the question in real, specific work
   the candidate did at that company — not a generic mention of the company name.
3. If `target_recency_rank` is 1 or 2 (older project), it is COMPLETELY fine to acknowledge that
   you're going back further — phrases like "Earlier in your career at [Company]…",
   "Going back to your work at [Company]…", or "I noticed at [Company] you also…" feel natural.
4. NEVER swap target_company for the most-recent company just because it's what they remember best.
   The whole point is to get signal across their full background.
5. If a question has NO target_company (e.g., A2/B/C, or A1 where the skill is only in one company),
   ignore this rule and follow the category guidance below.

CRITICAL — VARY YOUR QUESTION OPENINGS. Do NOT start every question the same way.
Mix these styles across your questions (use DIFFERENT ones, not the same pattern repeated):

Style 1 — Lead with their work, then probe deeper:
→ "At [Company], you [specific thing]. Walk me through how you handled [challenge]."
→ "During your time at [Company], you built [project]. What was the toughest technical call you had to make?"

Style 2 — Lead with a technical challenge, then ground it in their experience:
→ "When you're dealing with [technical scenario], what's your approach? I noticed at [Company] you faced something similar with [project] — how did that play out?"
→ "How do you typically handle [technical challenge]? Walk me through how you tackled this at [Company]."

Style 3 — Scenario-first, then connect to their resume:
→ "Imagine [scenario]. Given your experience building [project] at [Company], how would you approach this differently today?"
→ "If you had to redesign [their project at Company] from scratch, what would you change and why?"

Style 4 — Direct technical deep-dive grounded in their context:
→ "Walk me through the architecture of [project] you built at [Company] — specifically, how did you handle [technical aspect]?"
→ "What were the biggest scaling challenges you hit with [project] at [Company], and how did you solve them?"

Style 5 — Clean technical question (no resume reference needed — even for A1):
→ Sometimes, just ask a strong standalone question about the skill. Not every A1 question needs a resume callout. A good interview mixes personal questions with pure technical probes.
→ "How would you design [system] to handle [constraint]? What patterns would you reach for?"
→ "What's the most common mistake teams make with [Skill], and how do you avoid it?"

THE RULE: Across ALL your questions, no more than 30% should start with the same opening pattern. Mix it up. A real interviewer doesn't start every question with "I see you..."

═══ CATEGORY A2 — Skill listed in SKILLS SECTION only (no company context) ═══
The candidate claims this skill, but there's no described project/company for it.
→ You can acknowledge it: "You have [Skill] listed...", "Since you know [Skill]..."
→ OR just ask a direct technical question without any acknowledgment — treat it like a competency probe
→ Give them a practical scenario or design challenge
→ You CAN reference their overall domain/industry for context
→ You CANNOT say "At [Company], you used [Skill]" — that's fabrication

═══ CATEGORY B — Skill NOT in resume, but a RELATED tool IS ═══
→ Acknowledge what they DID use and bridge naturally to the tested skill
→ "Your background is with [resume_tool]. How would your approach change if you moved to [tested_skill]?"

═══ CATEGORY C — Skill NOT in resume at all ═══
→ Clean knowledge question. No resume references. No "you mentioned" or "in your experience."
→ "Walk me through how you would...", "What's your approach to...", "How would you design..."

ACCURACY RULES (apply to A2, B, C categories — NOT to A1):
1. For A2/B/C: NEVER tie a skill to a company unless the pre-classification says A1 for that skill.
2. For A2: NEVER say "At [Company], you used [Skill]" — the skill is only in the skills section.
3. For C: NEVER reference the resume at all for this skill.
4. NEVER reference the HIRING COMPANY ("{company}") as a past employer — the candidate hasn't worked there.
5. NEVER confuse the JD company with resume companies.

THE BALANCE: A1 questions = deeply personal, name companies and projects, feel human.
              A2/B/C questions = accurate, scenario-driven, no fabricated connections.
This is what makes a great interviewer: personal where you CAN be, honest where you CAN'T.

NEVER mention the candidate's job title or position name in questions.

PROGRESSIVE DIFFICULTY — TWO DIMENSIONS:

Dimension 1 — WITHIN EACH SKILL (when multiple questions test the same skill):
- First question: Foundational — test core understanding, basic concepts, "explain how X works"
- Second question: Applied — test real-world application, debugging, design decisions
- Third+ question: Edge cases — test failure handling, scaling limits, security, migration, advanced trade-offs

Dimension 2 — ACROSS THE ENTIRE INTERVIEW (this is critical):
The interview as a whole must escalate in difficulty from start to finish:
- Questions 1-30%: Warm-up zone. Approachable questions that build confidence. Still specific and smart, but not intimidating.
- Questions 30-70%: Core zone. This is where the real testing happens. Applied scenarios, design challenges, debugging, trade-offs.
- Questions 70-100%: Push zone. These should genuinely challenge the candidate. Complex scenarios, conflicting constraints, "no right answer" judgment calls, edge cases that reveal depth.

The LAST question should be the hardest question in the interview. A candidate who breezes through the entire interview wasn't challenged enough.

PHASE × SKILL INTERSECTION — HOW TO COMBINE THEM:
The phase determines the STYLE/ANGLE of the question, while the skill determines the TOPIC. Same skill, completely different angles based on phase.

QUESTION QUALITY RUBRIC — Every question must meet ALL of these criteria:
1. SPECIFICITY: No generic questions. Every question must target a concrete scenario, concept, or decision.
2. DEPTH SIGNAL: The question should be impossible to answer well with just surface-level knowledge or a Google search.
3. JUDGMENT TESTING: The question should force the candidate to demonstrate reasoning, not just recall.
4. ACTIONABLE EVALUATION: The expected answer must give a non-expert recruiter clear signals for scoring.
5. NATURAL CONVERSATION: The question should sound like something a senior engineer would ask in a real interview — not a textbook quiz.
6. PERSONALIZATION (for A1 skills): The question MUST reference specific companies, projects, and achievements from the resume.

OUTPUT FORMAT — Return ONLY a JSON array of {num_questions} objects with exactly these keys:
- "skill": The skill name
- "phase": The phase name from the plan
- "resume_match": "A1", "A2", "B", or "C"
- "sub_topic": A 2-5 word label for the specific sub-topic
- "question_text": The interview question
- "expected_answer": What a strong candidate would say (3-5 sentences)
- "strong_indicators": What a good answer looks like (2-3 bullet points as a single string)
- "red_flags": What should concern you (2-3 bullet points as a single string)
- "key_concepts": Comma-separated list of 6-10 terms

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

MANDATORY QUESTION PLAN (follow this EXACTLY — each question's order, phase, skill_focus, category, and personalization are non-negotiable):
{plan_json}

⚡ CRITICAL: Each question in the plan above has a "category" and "personalization" field.
- If category="A1", the "personalization" field contains the EXACT company name and project details. You MUST weave this into your question.
- If category="A2", ask about the skill without tying it to any company.
- If category="B", bridge from the related skills mentioned in the personalization field.
- If category="C", pure knowledge question — no resume references.

🎯 TARGET-COMPANY ENFORCEMENT (A1 ONLY):
Each A1 question's plan entry now includes target_company, target_company_snippet, target_recency_rank, recency_label.
1. If `target_company` is present, the question MUST reference that company (no substitutions).
2. Spread of target companies is intentional — about 65% on the most recent project, 25% on the 2nd, 10% on the 3rd.
3. For older projects (rank 1 or 2), it's natural to acknowledge the time shift.
4. Use `target_company_snippet` as direct evidence the candidate did this work.

{"STRICT SKILL ALLOCATION (each question MUST focus on the assigned skill):" if skill_allocation_text else "NO SKILL WEIGHTS DEFINED — Use combined JD + Resume intelligence."}
{skill_allocation_text}

{"Skill Weightage (normalized):" if normalized_skill_weights else ""}
{skill_json if normalized_skill_weights else ""}

REMEMBER:
- Every question must match its assigned phase's PURPOSE
- If a question has skill_focus assigned, the ENTIRE question must be about that skill
- Mix your openings (no more than 30% start the same way)
- Difficulty must escalate through the interview
- Each "sub_topic" MUST be a different knowledge area than previously assigned ones for the same skill
{_build_previous_questions_block(previous_questions)}"""

    try:
        client = OpenAI(api_key=OPENAI_API_KEY)
        model_name = getattr(config, "V2_QUESTION_GEN_MODEL", "gpt-4.1")
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=14000,
        )

        content = response.choices[0].message.content or ""
        questions = _safe_parse_json(content)
        result = []
        for i, q in enumerate(questions[:num_questions]):
            plan_item = question_plan[i] if i < len(question_plan) else {"phase": "General", "skill_focus": ""}

            # ── Post-generation validation: catch false resume references ──
            question_text = q.get("question_text", "").strip()
            resume_match = q.get("resume_match", "").strip().upper()
            skill_name = q.get("skill", "").strip() or plan_item.get("skill_focus", "").strip()

            if resume_match in ("C", "A2") and resume_text:
                false_ref_phrases = [
                    f"you used {skill_name.lower()}",
                    f"you mentioned {skill_name.lower()}",
                    f"you worked with {skill_name.lower()}",
                    f"as mentioned in your resume",
                    f"you've used {skill_name.lower()}",
                ]
                company_ref_patterns = [
                    "during your time at", "in your role at", "when you were at",
                ]
                all_patterns = false_ref_phrases + (company_ref_patterns if resume_match == "A2" else [])

                q_lower = question_text.lower()
                for phrase in all_patterns:
                    if phrase in q_lower:
                        logger.warning(
                            f"[v2] False resume reference detected in Q{i+1} "
                            f"(Category {resume_match} skill '{skill_name}')."
                        )
                        break

            if company and company.lower() in question_text.lower():
                hiring_phrases = [
                    f"at {company.lower()}",
                    f"during your time at {company.lower()}",
                    f"your work at {company.lower()}",
                    f"when you were at {company.lower()}",
                ]
                for phrase in hiring_phrases:
                    if phrase in question_text.lower():
                        logger.warning(
                            f"[v2] Hiring company referenced as past employer in Q{i+1}."
                        )
                        break

            # ── Build the suggested_answer field with Evaluation Signals ──
            expected_answer = q.get("expected_answer", "").strip()
            strong_indicators = q.get("strong_indicators", "").strip()
            red_flags_text = q.get("red_flags", "").strip()
            key_concepts = q.get("key_concepts", "").strip()

            suggested_answer = _format_suggested_answer(
                expected_answer=expected_answer,
                strong_indicators=strong_indicators,
                red_flags=red_flags_text,
                key_concepts=key_concepts,
                fallback_index=i,
            )

            skill_prefix = f"[{skill_name}] " if skill_name else ""

            result.append(
                {
                    "question_text": f"{skill_prefix}{question_text}".strip(),
                    "suggested_answer": suggested_answer,
                    "category": plan_item["phase"],
                    "difficulty": difficulty_label,
                    "order_number": i + 1,
                    "skill_focus": skill_name,
                }
            )

        # ── Deduplicate identical question_text ──
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
            logger.info(f"[v2] Dedup removed {removed} duplicate question(s)")

        for idx, q_item in enumerate(deduped):
            q_item["order_number"] = idx + 1
        result = deduped

        logger.info(f"[v2] AI generated {len(result)} unique questions (requested {num_questions})")
        return result

    except Exception as e:
        logger.error(f"[v2] Question generation failed — returning fallback. Error: {type(e).__name__}: {e}")
        logger.error(f"[v2] API key configured: {bool(OPENAI_API_KEY)}")
        logger.error(traceback.format_exc())
        fallback = generate_fallback_questions(
            job_title=job_title,
            num_questions=num_questions,
            difficulty=difficulty_label,
            years_experience=years_experience,
            question_plan=question_plan,
        )
        logger.warning(f"[v2] Returning {len(fallback)} FALLBACK questions")
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


# ═══════════════════════════════════════════════════════════════
# FALLBACK QUESTIONS — used when LLM call fails
# ═══════════════════════════════════════════════════════════════
def generate_fallback_questions(
    job_title: str,
    num_questions: int,
    difficulty: str,
    years_experience: int = 0,
    question_plan: Optional[list[dict]] = None,
) -> list[dict]:
    """Generate deterministic fallback questions if AI API fails."""

    templates = {
        "Persona": [
            (
                "Walk me through your professional journey — what kind of systems do you primarily build today, and what domains are you most comfortable being evaluated on?",
                "A strong candidate clearly defines their professional scope, domains of expertise, and signals which tools and areas they own.",
                "Clear role ownership, specific technologies mentioned, articulates what excites them about their domain",
                "Vague scope, cannot articulate what they specifically own, generic buzzwords without substance",
                "domain expertise, ownership, technical depth, professional growth, system scale",
            ),
            (
                "How would you describe the technical complexity of the work you do today versus two years ago — what has changed in how you approach problems?",
                "A strong candidate shows growth trajectory, increased scope, and evolving technical judgment.",
                "Clear growth arc, specific examples of increased complexity, reflective self-awareness",
                "No discernible growth, same responsibilities described differently",
                "growth mindset, technical maturity, scope expansion, self-awareness, complexity management",
            ),
        ],
        "Context": [
            (
                "Tell me about a recent project you owned end-to-end — what problem were you solving, what was your specific responsibility, and what outcomes did you drive?",
                "A strong candidate provides a detailed breakdown with measurable outcomes, explicit ownership, and realistic constraints.",
                "Measurable impact, clear personal ownership, specific technical decisions they made",
                "Uses 'we' for everything without clarifying personal role, generic feature descriptions",
                "ownership, measurable outcomes, technical decision-making, constraints, trade-offs",
            ),
            (
                "Describe a situation where you had to take over or rescue a struggling project — what was broken, how did you diagnose it, and what did you change?",
                "A strong candidate shows diagnostic thinking, prioritisation under pressure, and turnaround ability.",
                "Structured diagnosis, clear prioritisation, measurable improvement after intervention",
                "Blames others without proposing solutions, cannot describe specific actions taken",
                "diagnosis, prioritisation, turnaround strategy, accountability, stakeholder management",
            ),
        ],
        "Workflow": [
            (
                "Pick one of the systems you built and walk me through an end-to-end request flow — from the user action to the final response, including every service, database, and integration point it touches.",
                "A strong candidate traces a complete flow connecting components, dependencies, failure paths, and observability points.",
                "Complete end-to-end tracing, awareness of failure modes, mentions monitoring and observability",
                "Disconnected component-level explanations, cannot explain what happens between services",
                "system architecture, request flow, dependencies, failure modes, observability, integration points",
            ),
            (
                "Walk me through how your team handles a production incident from detection to resolution — what is the process, who gets involved, and how do you prevent recurrence?",
                "A strong candidate describes a structured incident response process and post-mortem practices.",
                "Structured incident response, blameless post-mortems, concrete prevention measures",
                "Ad-hoc firefighting, no post-mortem culture, same incidents recurring",
                "incident response, on-call, post-mortem, root cause analysis, prevention",
            ),
        ],
        "Choice": [
            (
                "Compare two approaches or tools you have used in production and explain your decision logic — what trade-offs did you weigh and why did you choose one over the other?",
                "A strong candidate articulates context-specific trade-offs, constraints, and acknowledges downsides.",
                "Context-specific reasoning, acknowledges downsides, considers alternatives",
                "One-size-fits-all statements, cannot explain downsides of chosen approach",
                "trade-off analysis, decision framework, context-specific reasoning, alternatives evaluation",
            ),
            (
                "Tell me about a technical decision you made that you would make differently today — what did you learn and how has it changed your decision-making framework?",
                "A strong candidate demonstrates intellectual honesty and shows an evolved decision-making process.",
                "Honest self-reflection, specific lessons learned, improved decision framework",
                "Claims to never make wrong decisions, cannot identify what they would change",
                "retrospective analysis, intellectual honesty, continuous improvement",
            ),
        ],
        "Internal": [
            (
                "Pick a core tool or technology you use daily and explain how it works internally. Then describe how you would debug a common production failure related to it.",
                "A strong candidate demonstrates deep internal mechanics knowledge and walks through structured debugging.",
                "Internal architecture knowledge, structured debugging approach, specific tools and commands",
                "Cookbook-level answers without understanding why, cannot explain what happens under the hood",
                "internal mechanics, debugging methodology, root cause analysis, observability tools",
            ),
            (
                "Explain a concept in your domain that most people use at a surface level but you understand deeply — what do they miss and why does it matter?",
                "A strong candidate reveals deep expertise by explaining nuances that separate experts from surface-level users.",
                "Goes beyond documentation-level knowledge, connects internals to real-world impact",
                "Recites documentation without insight, cannot explain why internals matter",
                "deep expertise, nuanced understanding, theory-to-practice connection",
            ),
        ],
        "Proof": [
            (
                "Walk me through a specific technical achievement — give me the numbers, the before and after, and explain exactly how you got there.",
                "A strong candidate provides concrete metrics, methodology, and demonstrates impact with real data.",
                "Specific metrics, clear methodology, quantifiable before/after comparison",
                "Cannot provide specific numbers, vague claims without evidence",
                "quantifiable impact, methodology, metrics-driven thinking, evidence-based reasoning",
            ),
            (
                "Give me an example of a time you significantly improved the performance, reliability, or cost-efficiency of a system — what was the measurable impact?",
                "A strong candidate describes a specific optimization with clear before/after metrics and business impact.",
                "Clear bottleneck identification, specific optimization techniques, measurable business impact",
                "Vague improvements without numbers, cannot explain root cause",
                "performance optimization, bottleneck analysis, cost-efficiency, reliability engineering",
            ),
        ],
        "Lifecycle": [
            (
                "After you finish implementing a feature, walk me through what happens next — how do you deploy it, monitor it, and ensure it's working correctly in production?",
                "A strong candidate covers CI/CD, release strategy, rollback plans, monitoring/alerting, and post-release validation.",
                "Complete deployment pipeline knowledge, monitoring and alerting awareness, rollback procedures",
                "Considers work done at PR merge, no awareness of monitoring or production readiness",
                "CI/CD, deployment strategy, monitoring, alerting, rollback, production readiness",
            ),
            (
                "Describe how you handle backward compatibility and safe rollouts when shipping changes that affect other teams or services.",
                "A strong candidate explains versioning strategies, feature flags, canary deployments, and cross-team communication.",
                "Versioning strategy, feature flags, gradual rollout, cross-team communication",
                "Ships breaking changes without coordination, no rollback plan",
                "backward compatibility, feature flags, canary deployment, API versioning",
            ),
        ],
    }

    plan = question_plan or _build_question_plan(num_questions, None)
    results: list[dict] = []
    phase_usage_count: dict[str, int] = {}

    for i in range(num_questions):
        item = plan[i] if i < len(plan) else {"phase": INTERVIEW_PHASES[-1], "skill_focus": ""}
        phase = item.get("phase", INTERVIEW_PHASES[-1])
        variants = templates.get(phase, templates[INTERVIEW_PHASES[-1]])

        usage_idx = phase_usage_count.get(phase, 0)
        template = variants[usage_idx % len(variants)]
        phase_usage_count[phase] = usage_idx + 1

        question_text, expected_answer, strong, red_flags, key_concepts = template

        skill_focus = item.get("skill_focus", "").strip()
        if skill_focus:
            question_text = f"[{skill_focus}] {question_text}"

        suggested = _format_suggested_answer(
            expected_answer=expected_answer,
            strong_indicators=strong,
            red_flags=red_flags,
            key_concepts=key_concepts,
            fallback_index=i,
        )

        results.append(
            {
                "question_text": question_text.format(job_title=job_title),
                "suggested_answer": suggested,
                "category": phase,
                "difficulty": difficulty,
                "order_number": i + 1,
                "skill_focus": skill_focus,
            }
        )

    return results


# ═══════════════════════════════════════════════════════════════
# ADAPTER — translate v2 output → our InterviewQuestion field shape
# ═══════════════════════════════════════════════════════════════

# 7-phase → our QuestionType enum value (lowercase to match enum values)
_PHASE_TO_TYPE = {
    "Persona":   "behavioral",
    "Context":   "behavioral",
    "Workflow":  "technical",
    "Choice":    "scenario",
    "Internal":  "conceptual",
    "Proof":     "scenario",
    "Lifecycle": "technical",
}

# Difficulty label → our QuestionDifficulty enum value (lowercase)
_DIFFICULTY_MAP = {
    "Level 1 - Foundational": "basic",
    "Level 2 - Advanced":     "intermediate",
    "Level 3 - Expert":       "advanced",
}


def adapt_to_our_schema(questions: list[dict]) -> list[dict]:
    """Map client-style question dicts onto our InterviewQuestion field names.

    Input shape (per item):
      {question_text, suggested_answer, category, difficulty, order_number, skill_focus}

    Output shape (per item):
      {question_text, sample_answer, question_type, difficulty, skill_focus,
       category, order_number, suggested_answer}

    The output preserves both `category` (phase) and `suggested_answer` (raw client field)
    in case downstream code wants them — our existing InterviewQuestion model has
    `category` and `suggested_answer` columns alongside `question_type` and `sample_answer`.
    """
    adapted: list[dict] = []
    for q in questions:
        phase = q.get("category", "")
        difficulty_label = q.get("difficulty", "")
        suggested = q.get("suggested_answer", "")
        adapted.append({
            "question_text": q.get("question_text", ""),
            "sample_answer": suggested,
            "suggested_answer": suggested,
            "question_type": _PHASE_TO_TYPE.get(phase, "conceptual"),
            "difficulty": _DIFFICULTY_MAP.get(difficulty_label, "intermediate"),
            "skill_focus": q.get("skill_focus", ""),
            "category": phase,
            "order_number": q.get("order_number", 0),
        })
    return adapted
