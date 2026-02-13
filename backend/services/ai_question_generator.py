"""
AI Question Generation Service
Supports live LLM-based question generation (Groq/Gemini) with preview mode fallback.
"""

import json
import random
from typing import List, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from models import Job, JobApplication, CandidateResume, InterviewQuestion, QuestionGenerationSession
from models import QuestionGenerationMode, QuestionDifficulty, QuestionType, ExperienceLevel
import config

class AIQuestionGenerator:
    """
    AI Question Generation Service with Preview/Live mode support
    """
    
    def __init__(self, mode: str = "preview"):
        self.mode = QuestionGenerationMode(mode)
        self.openai_client = None  # Will be initialized when switching to live mode
        
    def generate_questions(
        self, 
        db: Session, 
        job_id: int, 
        candidate_id: int, 
        total_questions: int = 10
    ) -> Dict[str, Any]:
        """
        Generate interview questions based on job description and candidate resume
        """
        # Get job and candidate data
        job = db.query(Job).filter(Job.id == job_id).first()
        candidate = db.query(JobApplication).filter(JobApplication.id == candidate_id).first()
        resume = db.query(CandidateResume).filter(
            CandidateResume.candidate_id == candidate_id
        ).first()
        
        if not job or not candidate:
            raise ValueError("Job or candidate not found")
        
        # Create generation session
        session = QuestionGenerationSession(
            job_id=job_id,
            candidate_id=candidate_id,
            generation_mode=self.mode,
            total_questions=total_questions,
            status="generating"
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        
        try:
            if self.mode == QuestionGenerationMode.PREVIEW:
                questions = self._generate_preview_questions(job, candidate, resume, total_questions)
            else:
                questions = self._generate_live_questions(job, candidate, resume, total_questions)

            print(f"[QuestionGenerator] Generated {len(questions)} questions in {self.mode.value} mode")

            if not questions or len(questions) == 0:
                raise ValueError("No questions were generated")

            # Save questions to database
            saved_questions = []
            for q_data in questions:
                question = InterviewQuestion(
                    job_id=job_id,
                    candidate_id=candidate_id,
                    question_text=q_data["question_text"],
                    sample_answer=q_data["sample_answer"],
                    question_type=q_data["question_type"],
                    difficulty=q_data["difficulty"],
                    skill_focus=q_data["skill_focus"],
                    generation_mode=self.mode,
                    is_approved=True
                )
                db.add(question)
                saved_questions.append(question)

            # Update session
            session.status = "generated"
            session.generated_at = datetime.utcnow()
            db.commit()

            # Refresh questions to get their IDs after commit
            for question in saved_questions:
                db.refresh(question)

            # Verify questions were actually saved
            verified_count = db.query(InterviewQuestion).filter(
                InterviewQuestion.job_id == job_id,
                InterviewQuestion.candidate_id == candidate_id
            ).count()

            if verified_count == 0:
                raise ValueError("Questions were not saved to database")
            
            # Update nested questions in candidate object
            self._update_candidate_nested_questions(db, candidate_id, job_id)
            
            return {
                "session_id": session.id,
                "status": "success",
                "mode": self.mode.value,
                "total_questions": len(saved_questions),
                "questions": [self._question_to_dict(q) for q in saved_questions]
            }
            
        except Exception as e:
            session.status = "failed"
            db.commit()
            raise e
    
    def _generate_preview_questions(
        self,
        job: Job,
        candidate: JobApplication,
        resume: CandidateResume,
        total_questions: int
    ) -> List[Dict[str, Any]]:
        """
        Generate questions using rule-based templates.
        Then tries ONE batch Groq call to get real answers for all questions at once.
        """
        # Parse job skills and resume skills
        job_skills = self._parse_skills(job.skills_required or "")
        resume_skills = self._parse_skills(resume.skills if resume else "")

        # Determine experience level and difficulty
        experience_years = resume.experience_years if resume else candidate.experience_years or 0
        is_senior = experience_years >= 5

        # Get question templates based on experience level
        templates = self._get_question_templates(is_senior)

        # Generate questions with static answers first (fast)
        questions = []
        skills_to_test = list(set(job_skills + resume_skills))[:8]

        if len(skills_to_test) < 8:
            skills_to_test.extend(self._get_default_skills(job.department))

        # Generate skill-based questions (80% of total)
        skill_questions = int(total_questions * 0.8)
        for i in range(skill_questions):
            skill = skills_to_test[i % len(skills_to_test)]
            template = random.choice(templates["technical"])
            question = self._create_question_from_template(
                template, skill, is_senior, job.title, job.department
            )
            questions.append(question)

        # Generate behavioral questions (20% of total)
        behavioral_questions = total_questions - skill_questions
        for i in range(behavioral_questions):
            template = random.choice(templates["behavioral"])
            question = self._create_question_from_template(
                template, None, is_senior, job.title, job.department
            )
            questions.append(question)

        # Try ONE batch Groq call to replace static answers with real ones
        try:
            from services.groq_service import generate_batch_sample_answers_with_groq
            question_texts = [q["question_text"] for q in questions]
            real_answers = generate_batch_sample_answers_with_groq(question_texts)
            if real_answers and len(real_answers) == len(questions):
                for i, answer in enumerate(real_answers):
                    if answer:
                        questions[i]["sample_answer"] = answer
                print(f"[QuestionGenerator] Batch Groq answers applied to {len(questions)} preview questions")
        except Exception as e:
            print(f"[QuestionGenerator] Batch Groq answers failed, keeping static: {e}")

        return questions
    
    def _generate_live_questions(
        self,
        job: Job,
        candidate: JobApplication,
        resume: CandidateResume,
        total_questions: int
    ) -> List[Dict[str, Any]]:
        """
        Generate questions using LLM APIs.
        Fallback chain: Groq (free, fast) -> Gemini -> preview mode (last resort).
        """
        job_skills = self._parse_skills(job.skills_required or "")
        resume_text = resume.parsed_text if resume else ""
        experience_years = resume.experience_years if resume else (candidate.experience_years if candidate else 0)

        # Try Groq first (free, fast, no quota limits)
        try:
            from services.groq_service import generate_questions_with_groq
            groq_questions = generate_questions_with_groq(
                job_description=job.description or "",
                skills_required=job_skills,
                resume_text=resume_text,
                experience_years=experience_years or 0,
                total_questions=total_questions
            )
            if groq_questions:
                print("[QuestionGenerator] Questions generated via Groq")
                return groq_questions
        except Exception as e:
            print(f"[QuestionGenerator] Groq failed: {e}")

        # Fallback to Gemini
        try:
            from services.gemini_service import generate_questions_with_gemini
            gemini_questions = generate_questions_with_gemini(
                job_description=job.description or "",
                skills_required=job_skills,
                resume_text=resume_text,
                experience_years=experience_years or 0,
                total_questions=total_questions
            )
            if gemini_questions:
                print("[QuestionGenerator] Questions generated via Gemini")
                return gemini_questions
        except Exception as e:
            print(f"[QuestionGenerator] Gemini failed: {e}")

        # Last resort: preview mode
        print("[QuestionGenerator] All LLMs unavailable, falling back to preview question generation")
        return self._generate_preview_questions(job, candidate, resume, total_questions)
    
    def _parse_skills(self, skills_text: str) -> List[str]:
        """Parse skills from text or JSON string"""
        if not skills_text:
            return []
        
        try:
            # Try to parse as JSON first
            skills = json.loads(skills_text)
            if isinstance(skills, list):
                return [skill.lower().strip() for skill in skills]
        except:
            pass
        
        # Parse as comma-separated string
        return [skill.lower().strip() for skill in skills_text.split(",") if skill.strip()]
    
    def _get_question_templates(self, is_senior: bool) -> Dict[str, List[Dict]]:
        """Get question templates based on experience level"""
        if is_senior:
            return {
                "technical": [
                    {
                        "template": "Design a scalable {skill} solution for a high-traffic application. How would you handle {challenge}?",
                        "type": QuestionType.SCENARIO,
                        "difficulty": QuestionDifficulty.ADVANCED,
                        "challenges": ["performance bottlenecks", "data consistency", "system failures", "scaling issues"]
                    },
                    {
                        "template": "You're leading a team implementing {skill}. Walk me through your architecture decisions and trade-offs.",
                        "type": QuestionType.SCENARIO,
                        "difficulty": QuestionDifficulty.ADVANCED,
                    },
                    {
                        "template": "Explain how you would optimize {skill} performance in a production environment with millions of users.",
                        "type": QuestionType.TECHNICAL,
                        "difficulty": QuestionDifficulty.ADVANCED,
                    }
                ],
                "behavioral": [
                    {
                        "template": "Describe a time when you had to make a critical technical decision under pressure. What was your approach?",
                        "type": QuestionType.BEHAVIORAL,
                        "difficulty": QuestionDifficulty.INTERMEDIATE,
                    },
                    {
                        "template": "How do you mentor junior developers and ensure code quality in your team?",
                        "type": QuestionType.BEHAVIORAL,
                        "difficulty": QuestionDifficulty.ADVANCED,
                    }
                ]
            }
        else:
            return {
                "technical": [
                    {
                        "template": "What is {skill} and how would you use it in a web application?",
                        "type": QuestionType.CONCEPTUAL,
                        "difficulty": QuestionDifficulty.BASIC,
                    },
                    {
                        "template": "Explain the key concepts of {skill} and provide a simple example.",
                        "type": QuestionType.CONCEPTUAL,
                        "difficulty": QuestionDifficulty.BASIC,
                    },
                    {
                        "template": "How would you implement a basic {skill} feature? Walk me through your approach.",
                        "type": QuestionType.TECHNICAL,
                        "difficulty": QuestionDifficulty.INTERMEDIATE,
                    }
                ],
                "behavioral": [
                    {
                        "template": "Tell me about a challenging project you worked on. How did you overcome obstacles?",
                        "type": QuestionType.BEHAVIORAL,
                        "difficulty": QuestionDifficulty.BASIC,
                    },
                    {
                        "template": "How do you stay updated with new technologies and best practices?",
                        "type": QuestionType.BEHAVIORAL,
                        "difficulty": QuestionDifficulty.BASIC,
                    }
                ]
            }
    
    def _create_question_from_template(
        self, 
        template: Dict, 
        skill: str, 
        is_senior: bool, 
        job_title: str, 
        department: str
    ) -> Dict[str, Any]:
        """Create a question from template"""
        question_text = template["template"]
        
        if skill and "{skill}" in question_text:
            question_text = question_text.replace("{skill}", skill)
        
        if "{challenge}" in question_text and "challenges" in template:
            challenge = random.choice(template["challenges"])
            question_text = question_text.replace("{challenge}", challenge)
        
        # Generate sample answer
        sample_answer = self._generate_sample_answer(
            question_text, skill, template["type"], template["difficulty"]
        )
        
        return {
            "question_text": question_text,
            "sample_answer": sample_answer,
            "question_type": template["type"].value,
            "difficulty": template["difficulty"].value,
            "skill_focus": skill
        }
    
    def _generate_sample_answer(
        self,
        question: str,
        skill: str,
        q_type: QuestionType,
        difficulty: QuestionDifficulty
    ) -> str:
        """Generate static sample answer (fast, no API calls). Used only as last-resort fallback."""
        if q_type == QuestionType.BEHAVIORAL:
            return "A strong answer should include: specific situation, actions taken, measurable results, and lessons learned. Use the STAR method (Situation, Task, Action, Result)."

        elif q_type == QuestionType.CONCEPTUAL:
            return f"A good answer should explain the core concepts of {skill or 'the technology'}, provide practical examples, and demonstrate understanding of when and why to use it."

        elif q_type == QuestionType.TECHNICAL:
            if difficulty == QuestionDifficulty.BASIC:
                return f"Answer should include basic implementation steps, key considerations, and simple code examples using {skill or 'relevant technology'}."
            else:
                return f"Answer should cover architecture decisions, scalability considerations, performance optimization, error handling, and best practices for {skill or 'the solution'}."

        else:  # SCENARIO
            return "Answer should include problem analysis, solution design, implementation approach, potential challenges, and alternative solutions with trade-offs."
    
    def _get_default_skills(self, department: str) -> List[str]:
        """Get default skills based on department"""
        skill_map = {
            "Engineering": ["python", "javascript", "sql", "git", "api design"],
            "Data Science": ["python", "sql", "machine learning", "statistics", "data visualization"],
            "DevOps": ["docker", "kubernetes", "aws", "ci/cd", "monitoring"],
            "Frontend": ["javascript", "react", "css", "html", "responsive design"],
            "Backend": ["python", "java", "database design", "api development", "microservices"],
            "Mobile": ["react native", "ios", "android", "mobile ui", "app store"],
        }
        return skill_map.get(department, ["problem solving", "communication", "teamwork", "learning", "adaptability"])
    
    def _question_to_dict(self, question: InterviewQuestion) -> Dict[str, Any]:
        """Convert question model to dictionary"""
        return {
            "id": question.id,
            "question_text": question.question_text,
            "sample_answer": question.sample_answer,
            "question_type": question.question_type.value,
            "difficulty": question.difficulty.value,
            "skill_focus": question.skill_focus,
            "is_approved": question.is_approved,
            "expert_reviewed": question.expert_reviewed,
            "expert_notes": question.expert_notes
        }
    
    def _update_candidate_nested_questions(self, db: Session, candidate_id: int, job_id: int):
        """Update nested questions in candidate object"""
        from models import User, JobApplication
        
        # Get candidate user via job application
        application = db.query(JobApplication).filter(JobApplication.id == candidate_id).first()
        if not application:
            return
            
        candidate_user = db.query(User).filter(User.email == application.applicant_email).first()
        if not candidate_user:
            return
        
        # Get all questions for this candidate
        questions = db.query(InterviewQuestion).filter(
            InterviewQuestion.candidate_id == candidate_id,
            InterviewQuestion.job_id == job_id
        ).all()
        
        # Convert to nested format
        nested_questions = []
        for question in questions:
            nested_questions.append({
                "id": question.id,
                "job_id": question.job_id,
                "question_text": question.question_text,
                "sample_answer": question.sample_answer,
                "question_type": question.question_type.value,
                "difficulty": question.difficulty.value,
                "skill_focus": question.skill_focus,
                "is_approved": question.is_approved,
                "expert_reviewed": question.expert_reviewed,
                "expert_notes": question.expert_notes,
                "created_at": question.created_at.isoformat() if question.created_at else None
            })
        
        # Update candidate's nested questions
        candidate_user.interview_questions = json.dumps(nested_questions)
        db.commit()

# Global instance - reads mode from config (defaults to "live")
question_generator = AIQuestionGenerator(mode=config.QUESTION_GENERATION_MODE)

def get_question_generator() -> AIQuestionGenerator:
    """Get the global question generator instance"""
    return question_generator

def switch_to_live_mode(openai_api_key: str, azure_endpoint: str = None):
    """Switch to live AI mode with OpenAI/Azure OpenAI"""
    global question_generator
    question_generator.mode = QuestionGenerationMode.LIVE
    # TODO: Initialize OpenAI client
    # question_generator.openai_client = OpenAI(api_key=openai_api_key)