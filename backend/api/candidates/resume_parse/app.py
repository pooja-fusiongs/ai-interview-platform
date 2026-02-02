from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import os
import sys
import json
import re
from pathlib import Path
from typing import List, Dict, Any

# Add parent directories to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from database import get_db
from models import CandidateResume, ExperienceLevel
from schemas import ResumeParseResponse

app = FastAPI(title="Resume Parsing API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Common skills database (simplified version)
COMMON_SKILLS = {
    "programming": [
        "python", "javascript", "java", "c++", "c#", "php", "ruby", "go", "rust", "swift",
        "kotlin", "typescript", "scala", "r", "matlab", "perl", "shell", "bash", "powershell"
    ],
    "web": [
        "html", "css", "react", "angular", "vue", "node.js", "express", "django", "flask",
        "spring", "laravel", "rails", "asp.net", "jquery", "bootstrap", "sass", "less"
    ],
    "database": [
        "sql", "mysql", "postgresql", "mongodb", "redis", "elasticsearch", "oracle",
        "sqlite", "cassandra", "dynamodb", "firebase"
    ],
    "cloud": [
        "aws", "azure", "gcp", "docker", "kubernetes", "jenkins", "terraform", "ansible",
        "cloudformation", "helm", "istio"
    ],
    "tools": [
        "git", "github", "gitlab", "bitbucket", "jira", "confluence", "slack", "teams",
        "visual studio", "vscode", "intellij", "eclipse", "postman", "swagger"
    ],
    "frameworks": [
        "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy", "matplotlib", "seaborn",
        "opencv", "nltk", "spacy", "keras", "fastapi", "graphql", "rest api"
    ]
}

def extract_text_from_file(file_path: str) -> str:
    """Extract text from resume file"""
    try:
        file_ext = Path(file_path).suffix.lower()
        
        if file_ext == ".pdf":
            return extract_text_from_pdf(file_path)
        elif file_ext in [".doc", ".docx"]:
            return extract_text_from_docx(file_path)
        else:
            raise ValueError(f"Unsupported file format: {file_ext}")
            
    except Exception as e:
        print(f"❌ Error extracting text from {file_path}: {e}")
        return ""

def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF file"""
    try:
        import PyPDF2
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
        return text
    except ImportError:
        # Fallback: simple text extraction without PyPDF2
        print("⚠️ PyPDF2 not installed, using basic text extraction")
        return extract_text_basic(file_path)
    except Exception as e:
        print(f"❌ PDF extraction error: {e}")
        return extract_text_basic(file_path)

def extract_text_from_docx(file_path: str) -> str:
    """Extract text from DOCX file"""
    try:
        import docx
        doc = docx.Document(file_path)
        text = ""
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
        return text
    except ImportError:
        # Fallback: basic text extraction without python-docx
        print("⚠️ python-docx not installed, using basic text extraction")
        return extract_text_basic(file_path)
    except Exception as e:
        print(f"❌ DOCX extraction error: {e}")
        return extract_text_basic(file_path)

def extract_text_basic(file_path: str) -> str:
    """Basic text extraction fallback"""
    try:
        # This is a very basic fallback - in production, you'd want proper libraries
        with open(file_path, 'rb') as file:
            content = file.read()
            # Try to decode as text (this won't work well for binary formats)
            try:
                return content.decode('utf-8', errors='ignore')
            except:
                return content.decode('latin-1', errors='ignore')
    except Exception as e:
        print(f"❌ Basic extraction error: {e}")
        return ""

def extract_skills(text: str) -> List[str]:
    """Extract skills from resume text"""
    text_lower = text.lower()
    found_skills = set()
    
    # Search for skills in all categories
    for category, skills in COMMON_SKILLS.items():
        for skill in skills:
            # Use word boundaries to avoid partial matches
            pattern = r'\b' + re.escape(skill.lower()) + r'\b'
            if re.search(pattern, text_lower):
                found_skills.add(skill.title())
    
    # Additional skill patterns
    skill_patterns = [
        r'\b(machine learning|artificial intelligence|data science|deep learning)\b',
        r'\b(devops|ci/cd|continuous integration|continuous deployment)\b',
        r'\b(agile|scrum|kanban|waterfall)\b',
        r'\b(microservices|api development|web services)\b',
        r'\b(mobile development|ios|android|react native|flutter)\b'
    ]
    
    for pattern in skill_patterns:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        for match in matches:
            found_skills.add(match.title())
    
    return sorted(list(found_skills))

def extract_experience_years(text: str) -> int:
    """Extract years of experience from resume text"""
    text_lower = text.lower()
    
    # Common patterns for experience
    patterns = [
        r'(\d+)\+?\s*years?\s*(?:of\s*)?experience',
        r'experience\s*:?\s*(\d+)\+?\s*years?',
        r'(\d+)\+?\s*years?\s*in\s*(?:the\s*)?(?:field|industry|software|development)',
        r'over\s*(\d+)\s*years?\s*(?:of\s*)?experience',
        r'more\s*than\s*(\d+)\s*years?\s*(?:of\s*)?experience',
        r'(\d+)\+?\s*years?\s*(?:of\s*)?(?:professional\s*)?(?:work\s*)?experience'
    ]
    
    max_years = 0
    
    for pattern in patterns:
        matches = re.findall(pattern, text_lower)
        for match in matches:
            try:
                years = int(match)
                if years > max_years and years <= 50:  # Reasonable upper limit
                    max_years = years
            except ValueError:
                continue
    
    # If no explicit experience found, try to infer from work history
    if max_years == 0:
        # Look for date ranges in work experience
        date_patterns = [
            r'(20\d{2})\s*[-–—]\s*(20\d{2}|present|current)',
            r'(19\d{2})\s*[-–—]\s*(20\d{2}|present|current)',
        ]
        
        years_found = []
        current_year = 2024  # You might want to use datetime.now().year
        
        for pattern in date_patterns:
            matches = re.findall(pattern, text_lower)
            for start_year, end_year in matches:
                try:
                    start = int(start_year)
                    if end_year.lower() in ['present', 'current']:
                        end = current_year
                    else:
                        end = int(end_year)
                    
                    if start <= end and start >= 1990:  # Reasonable bounds
                        years_found.append(end - start)
                except ValueError:
                    continue
        
        if years_found:
            max_years = max(years_found)
    
    return max_years

def classify_experience_level(years: int) -> str:
    """Classify experience level based on years"""
    if years < 5:
        return ExperienceLevel.JUNIOR.value
    elif years < 8:
        return ExperienceLevel.MID.value
    else:
        return ExperienceLevel.SENIOR.value

@app.post("/api/candidates/{candidate_id}/resume/parse", response_model=ResumeParseResponse)
def parse_resume(
    candidate_id: int,
    db: Session = Depends(get_db)
):
    """
    Parse resume to extract skills and experience
    
    - **candidate_id**: ID of the job application (candidate)
    """
    try:
        print(f"🔍 Parsing resume for candidate {candidate_id}")
        
        # Get resume record
        resume = db.query(CandidateResume).filter(
            CandidateResume.candidate_id == candidate_id
        ).first()
        
        if not resume:
            raise HTTPException(
                status_code=404,
                detail=f"Resume not found for candidate {candidate_id}"
            )
        
        # Check if file exists
        if not Path(resume.resume_path).exists():
            raise HTTPException(
                status_code=404,
                detail="Resume file not found on disk"
            )
        
        # Extract text from resume
        print(f"📄 Extracting text from: {resume.resume_path}")
        text = extract_text_from_file(resume.resume_path)
        
        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from resume file"
            )
        
        # Extract skills
        print("🔍 Extracting skills...")
        skills = extract_skills(text)
        
        # Extract experience years
        print("📅 Extracting experience...")
        experience_years = extract_experience_years(text)
        
        # Classify experience level
        experience_level = classify_experience_level(experience_years)
        
        # Update database record
        resume.parsed_text = text[:5000]  # Store first 5000 chars
        resume.skills = json.dumps(skills)
        resume.experience_years = experience_years
        resume.experience_level = ExperienceLevel(experience_level)
        resume.parsing_status = "completed"
        
        db.commit()
        db.refresh(resume)
        
        print(f"✅ Resume parsed successfully:")
        print(f"   - Skills: {len(skills)} found")
        print(f"   - Experience: {experience_years} years ({experience_level})")
        
        return ResumeParseResponse(
            skills=skills,
            total_experience_years=experience_years,
            experience_level=experience_level,
            parsing_status="completed"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error parsing resume: {e}")
        import traceback
        traceback.print_exc()
        
        # Update status to failed
        try:
            resume = db.query(CandidateResume).filter(
                CandidateResume.candidate_id == candidate_id
            ).first()
            if resume:
                resume.parsing_status = "failed"
                db.commit()
        except:
            pass
        
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse resume: {str(e)}"
        )

@app.get("/")
def read_root():
    return {
        "message": "Resume Parsing API",
        "version": "1.0.0",
        "endpoints": {
            "parse": "/api/candidates/{candidate_id}/resume/parse"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)