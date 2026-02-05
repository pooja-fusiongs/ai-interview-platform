"""
Transcript Generator Service.

Generates simulated interview transcripts when a video interview ends.
In production, this would be replaced with actual speech-to-text integration.
"""

import random
from datetime import datetime
from typing import Dict, Any, Optional


# Sample interview questions and answers for different job types
INTERVIEW_TEMPLATES = {
    "technical": {
        "questions": [
            "Can you tell me about your experience with our tech stack?",
            "How do you approach debugging complex issues?",
            "Describe a challenging project you've worked on.",
            "How do you stay updated with new technologies?",
            "What's your experience with agile methodologies?",
            "Can you explain how you would design a scalable system?",
            "Tell me about a time you had to learn a new technology quickly.",
            "How do you handle code reviews?",
        ],
        "answer_templates": [
            "I have {years} years of experience working with similar technologies. In my previous role at {company}, I worked extensively with {tech}.",
            "My approach to debugging involves first reproducing the issue, then systematically isolating the problem using logging and debugging tools.",
            "One challenging project was {project}. We faced issues with {challenge}, but I solved it by {solution}.",
            "I regularly follow tech blogs, attend conferences, and participate in online communities to stay current.",
            "I've worked in agile teams for {years} years, participating in daily standups, sprint planning, and retrospectives.",
            "For scalability, I would consider load balancing, caching strategies, database optimization, and microservices architecture.",
            "When I needed to learn {tech}, I dedicated time to documentation, built small projects, and consulted with experienced colleagues.",
            "I believe code reviews are essential for maintaining quality. I provide constructive feedback and am open to receiving it.",
        ]
    },
    "behavioral": {
        "questions": [
            "Tell me about yourself.",
            "Why are you interested in this position?",
            "Describe a situation where you had to work with a difficult team member.",
            "How do you handle pressure and tight deadlines?",
            "What are your greatest strengths and weaknesses?",
            "Where do you see yourself in five years?",
            "Tell me about a time you showed leadership.",
            "How do you prioritize your work?",
        ],
        "answer_templates": [
            "I'm a {role} with {years} years of experience. I'm passionate about {passion} and have a track record of {achievement}.",
            "I'm excited about this role because it aligns with my skills in {skill} and offers opportunities to {opportunity}.",
            "In a previous team, I had a colleague who had different working styles. I addressed this by having an open conversation and finding common ground.",
            "I handle pressure by staying organized, breaking tasks into smaller steps, and maintaining clear communication with stakeholders.",
            "My strengths include {strength}. As for areas of improvement, I'm continuously working on {weakness}.",
            "In five years, I see myself growing into a {future_role} position, contributing to {contribution}.",
            "I demonstrated leadership when {situation}. I took initiative and guided the team to {outcome}.",
            "I use a combination of urgency and importance to prioritize. I start each day by identifying the most critical tasks.",
        ]
    }
}

FILLER_WORDS = ["um", "uh", "you know", "like", "so", "actually", "basically"]
COMPANIES = ["Tech Corp", "Innovate Inc", "Digital Solutions", "StartUp Labs", "Enterprise Systems"]
TECHNOLOGIES = ["React", "Python", "Node.js", "AWS", "Docker", "Kubernetes", "PostgreSQL", "MongoDB"]
PROJECTS = ["e-commerce platform", "real-time analytics dashboard", "mobile app", "API gateway", "microservices migration"]
CHALLENGES = ["scalability", "performance optimization", "team coordination", "tight deadlines", "legacy code"]
SOLUTIONS = ["implementing caching", "refactoring the architecture", "improving communication", "parallel processing", "automated testing"]


def _add_natural_speech(text: str) -> str:
    """Add natural speech patterns like pauses and filler words."""
    if random.random() < 0.3:
        filler = random.choice(FILLER_WORDS)
        words = text.split()
        if len(words) > 3:
            insert_pos = random.randint(1, min(3, len(words) - 1))
            words.insert(insert_pos, filler + ",")
            return " ".join(words)
    return text


def _generate_answer(template: str) -> str:
    """Generate an answer from a template with random substitutions."""
    answer = template.format(
        years=random.randint(2, 8),
        company=random.choice(COMPANIES),
        tech=random.choice(TECHNOLOGIES),
        project=random.choice(PROJECTS),
        challenge=random.choice(CHALLENGES),
        solution=random.choice(SOLUTIONS),
        role="software engineer",
        passion="building scalable solutions",
        achievement="delivering projects on time",
        skill="problem-solving",
        opportunity="grow professionally",
        strength="attention to detail and problem-solving",
        weakness="sometimes being too detail-oriented",
        future_role="senior",
        contribution="the company's growth",
        situation="our team faced a critical deadline",
        outcome="successful delivery"
    )
    return _add_natural_speech(answer)


def generate_interview_transcript(
    candidate_name: str,
    interviewer_name: str,
    job_title: str,
    duration_minutes: int = 30
) -> Dict[str, Any]:
    """
    Generate a simulated interview transcript.

    Args:
        candidate_name: Name of the candidate
        interviewer_name: Name of the interviewer
        job_title: Title of the job position
        duration_minutes: Duration of the interview

    Returns:
        Dictionary containing transcript data
    """
    # Determine interview type based on job title
    job_lower = job_title.lower()
    if any(tech in job_lower for tech in ["developer", "engineer", "programmer", "architect", "devops"]):
        template_type = "technical"
    else:
        template_type = "behavioral"

    template = INTERVIEW_TEMPLATES[template_type]

    # Calculate number of Q&A pairs based on duration
    num_questions = min(len(template["questions"]), max(3, duration_minutes // 5))
    selected_indices = random.sample(range(len(template["questions"])), num_questions)

    transcript_lines = []
    current_time = 0

    # Opening
    transcript_lines.append({
        "timestamp": "00:00:00",
        "speaker": interviewer_name or "Interviewer",
        "text": f"Hello {candidate_name}, thank you for joining us today. I'm excited to discuss the {job_title} position with you."
    })
    current_time += random.randint(5, 15)

    transcript_lines.append({
        "timestamp": f"00:00:{current_time:02d}",
        "speaker": candidate_name or "Candidate",
        "text": "Thank you for having me. I'm very excited about this opportunity and looking forward to our conversation."
    })
    current_time += random.randint(10, 20)

    # Q&A Section
    for i, idx in enumerate(selected_indices):
        question = template["questions"][idx]
        answer_template = template["answer_templates"][idx % len(template["answer_templates"])]
        answer = _generate_answer(answer_template)

        minutes = current_time // 60
        seconds = current_time % 60

        transcript_lines.append({
            "timestamp": f"00:{minutes:02d}:{seconds:02d}",
            "speaker": interviewer_name or "Interviewer",
            "text": question
        })
        current_time += random.randint(30, 90)

        minutes = current_time // 60
        seconds = current_time % 60

        transcript_lines.append({
            "timestamp": f"00:{minutes:02d}:{seconds:02d}",
            "speaker": candidate_name or "Candidate",
            "text": answer
        })
        current_time += random.randint(60, 180)

    # Closing
    minutes = current_time // 60
    seconds = current_time % 60

    transcript_lines.append({
        "timestamp": f"00:{minutes:02d}:{seconds:02d}",
        "speaker": interviewer_name or "Interviewer",
        "text": "Do you have any questions for us?"
    })
    current_time += random.randint(5, 15)

    minutes = current_time // 60
    seconds = current_time % 60

    transcript_lines.append({
        "timestamp": f"00:{minutes:02d}:{seconds:02d}",
        "speaker": candidate_name or "Candidate",
        "text": "Yes, I'd like to know more about the team structure and the projects I'd be working on."
    })
    current_time += random.randint(60, 120)

    minutes = current_time // 60
    seconds = current_time % 60

    transcript_lines.append({
        "timestamp": f"00:{minutes:02d}:{seconds:02d}",
        "speaker": interviewer_name or "Interviewer",
        "text": f"Great question. Our team is collaborative and focused on innovation. Thank you for your time today, {candidate_name}. We'll be in touch soon."
    })

    # Format transcript as readable text
    transcript_text = "\n\n".join([
        f"[{line['timestamp']}] {line['speaker']}:\n{line['text']}"
        for line in transcript_lines
    ])

    return {
        "transcript_text": transcript_text,
        "transcript_lines": transcript_lines,
        "word_count": sum(len(line["text"].split()) for line in transcript_lines),
        "duration_seconds": current_time,
        "num_exchanges": len(transcript_lines),
        "generated_at": datetime.utcnow().isoformat()
    }


def generate_transcript_for_video_interview(
    video_interview_id: int,
    candidate_name: Optional[str] = None,
    interviewer_name: Optional[str] = None,
    job_title: Optional[str] = None,
    duration_minutes: int = 30
) -> str:
    """
    Generate and return transcript text for a video interview.

    Args:
        video_interview_id: ID of the video interview
        candidate_name: Optional candidate name
        interviewer_name: Optional interviewer name
        job_title: Optional job title
        duration_minutes: Duration of the interview

    Returns:
        Formatted transcript text
    """
    result = generate_interview_transcript(
        candidate_name=candidate_name or f"Candidate #{video_interview_id}",
        interviewer_name=interviewer_name or "Hiring Manager",
        job_title=job_title or "Software Engineer",
        duration_minutes=duration_minutes
    )

    return result["transcript_text"]
