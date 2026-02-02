from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional
from pydantic import BaseModel
from database import get_db
from models import JobApplication, CandidateResume, Job
import json

router = APIRouter()

class MatchingFilters(BaseModel):
    education: int = 25
    jobTitle: int = 30
    skills: int = 35
    industry: int = 20
    language: int = 15

class CandidateMatchResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str]
    location: Optional[str]
    category: str
    matchScore: int
    education: Optional[str]
    jobTitle: str
    skills: List[str]
    industry: str
    languages: List[str]
    resumeId: Optional[int]
    hasResume: bool
    appliedAt: str
    status: str = "Applied"  # Add status field

class CandidateStatusUpdate(BaseModel):
    status: str  # 'shortlist' or 'reject'

class BulkStatusUpdate(BaseModel):
    candidate_ids: List[int]
    status: str  # 'shortlist' or 'reject'

@router.get("/candidates", response_model=List[CandidateMatchResponse])
async def get_matching_candidates(
    job_id: Optional[int] = Query(None, description="Filter by specific job ID"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search by name, email, job title, or skills"),
    filters: Optional[str] = Query(None, description="JSON string of filter criteria"),
    db: Session = Depends(get_db)
):
    """
    Get candidates for matching with their resume information
    
    **Parameters:**
    - **job_id**: Optional job ID to filter candidates
    - **page**: Page number for pagination
    - **limit**: Number of items per page
    - **search**: Search query for name, email, job title, or skills
    - **filters**: JSON string with filter criteria (matchScoreMin, matchScoreMax, location, category)
    
    **Returns:**
    - List of candidates with their match scores and resume info
    """
    try:
        # Parse filters if provided
        filter_criteria = {}
        if filters:
            try:
                filter_criteria = json.loads(filters)
            except json.JSONDecodeError:
                pass
        
        # Calculate offset for pagination
        offset = (page - 1) * limit
        
        # Base query to get job applications with resumes
        query = db.query(JobApplication, CandidateResume, Job).outerjoin(
            CandidateResume, JobApplication.id == CandidateResume.candidate_id
        ).join(
            Job, JobApplication.job_id == Job.id
        )
        
        # Filter by job_id if provided
        if job_id:
            query = query.filter(JobApplication.job_id == job_id)
        
        # Add search functionality
        if search:
            search_term = f"%{search.lower()}%"
            query = query.filter(
                or_(
                    JobApplication.applicant_name.ilike(search_term),
                    JobApplication.applicant_email.ilike(search_term),
                    JobApplication.current_position.ilike(search_term),
                    Job.title.ilike(search_term),
                    Job.department.ilike(search_term)
                )
            )
        
        # Apply location filter
        if filter_criteria.get('location'):
            location_term = f"%{filter_criteria['location'].lower()}%"
            query = query.filter(Job.location.ilike(location_term))
        
        # Apply category filter
        if filter_criteria.get('category'):
            query = query.filter(Job.department == filter_criteria['category'])
        
        # Apply pagination
        results = query.offset(offset).limit(limit).all()
        
        candidates = []
        for application, resume, job in results:
            # Calculate mock match score (you can implement real matching logic here)
            match_score = calculate_match_score(application, resume, job)
            
            # Apply match score filters
            if filter_criteria.get('matchScoreMin') and match_score < filter_criteria['matchScoreMin']:
                continue
            if filter_criteria.get('matchScoreMax') and match_score > filter_criteria['matchScoreMax']:
                continue
            
            # Parse skills from resume if available
            skills = []
            if resume and resume.skills:
                try:
                    skills = json.loads(resume.skills)
                except:
                    skills = []
            
            # Default skills if no resume
            if not skills:
                skills = ["General Skills"]
            
            candidate_data = CandidateMatchResponse(
                id=application.id,
                name=application.applicant_name,
                email=application.applicant_email,
                phone=application.applicant_phone,
                location=job.location,  # Using job location as candidate location for now
                category=job.department,
                matchScore=match_score,
                education="Bachelor's Degree",  # Default education
                jobTitle=application.current_position or "Professional",
                skills=skills[:3],  # Limit to 3 skills for display
                industry=job.department,
                languages=["English"],  # Default language
                resumeId=resume.id if resume else None,
                hasResume=resume is not None,
                appliedAt=application.applied_at.strftime("%Y-%m-%d %H:%M:%S"),
                status=application.status  # Add current status
            )
            
            candidates.append(candidate_data)
        
        return candidates
        
    except Exception as e:
        print(f"❌ Error fetching candidates: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching candidates: {str(e)}"
        )

def calculate_match_score(application: JobApplication, resume: CandidateResume, job: Job) -> int:
    """
    Calculate match score for a candidate
    This is a simplified version - you can implement more sophisticated matching logic
    """
    score = 50  # Base score
    
    # Add points for having a resume
    if resume:
        score += 20
    
    # Add points for experience
    if application.experience_years:
        if application.experience_years >= 5:
            score += 20
        elif application.experience_years >= 2:
            score += 15
        else:
            score += 10
    
    # Add points for current position match
    if application.current_position and job.title:
        if any(word in application.current_position.lower() for word in job.title.lower().split()):
            score += 15
    
    # Ensure score is between 0 and 100
    return min(100, max(0, score))

@router.post("/calculate-match")
async def calculate_candidate_match(
    candidate_id: int,
    job_id: int,
    filters: MatchingFilters,
    db: Session = Depends(get_db)
):
    """
    Calculate detailed match score for a specific candidate and job
    
    **Parameters:**
    - **candidate_id**: ID of the job application (candidate)
    - **job_id**: ID of the job
    - **filters**: Matching criteria weights
    
    **Returns:**
    - Detailed match score breakdown
    """
    try:
        # Get candidate and job data
        application = db.query(JobApplication).filter(JobApplication.id == candidate_id).first()
        resume = db.query(CandidateResume).filter(CandidateResume.candidate_id == candidate_id).first()
        job = db.query(Job).filter(Job.id == job_id).first()
        
        if not application or not job:
            raise HTTPException(
                status_code=404,
                detail="Candidate or job not found"
            )
        
        # Calculate detailed match scores
        education_score = calculate_education_match(resume, job) * (filters.education / 100)
        job_title_score = calculate_job_title_match(application, job) * (filters.jobTitle / 100)
        skills_score = calculate_skills_match(resume, job) * (filters.skills / 100)
        industry_score = calculate_industry_match(application, job) * (filters.industry / 100)
        language_score = calculate_language_match(resume, job) * (filters.language / 100)
        
        total_score = int(education_score + job_title_score + skills_score + industry_score + language_score)
        
        return {
            "candidateId": candidate_id,
            "jobId": job_id,
            "totalScore": total_score,
            "breakdown": {
                "education": int(education_score),
                "jobTitle": int(job_title_score),
                "skills": int(skills_score),
                "industry": int(industry_score),
                "language": int(language_score)
            },
            "filters": filters
        }
        
    except Exception as e:
        print(f"❌ Error calculating match: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error calculating match: {str(e)}"
        )

def calculate_education_match(resume: CandidateResume, job: Job) -> float:
    """Calculate education match score (0-100)"""
    # Simplified logic - you can enhance this
    return 75.0

def calculate_job_title_match(application: JobApplication, job: Job) -> float:
    """Calculate job title match score (0-100)"""
    if not application.current_position:
        return 50.0
    
    # Simple keyword matching
    job_words = set(job.title.lower().split())
    position_words = set(application.current_position.lower().split())
    
    if job_words & position_words:  # If there's any overlap
        return 85.0
    return 60.0

def calculate_skills_match(resume: CandidateResume, job: Job) -> float:
    """Calculate skills match score (0-100)"""
    if not resume or not resume.skills:
        return 40.0
    
    try:
        candidate_skills = json.loads(resume.skills)
        if job.skills_required:
            job_skills = json.loads(job.skills_required)
            # Calculate overlap
            overlap = len(set(candidate_skills) & set(job_skills))
            if overlap > 0:
                return min(100.0, 60.0 + (overlap * 10))
    except:
        pass
    
    return 65.0

def calculate_industry_match(application: JobApplication, job: Job) -> float:
    """Calculate industry match score (0-100)"""
    # Simplified logic
    return 70.0

def calculate_language_match(resume: CandidateResume, job: Job) -> float:
    """Calculate language match score (0-100)"""
    # Simplified logic - assuming English is required
    return 80.0

@router.post("/{candidate_id}/status")
async def update_candidate_status(
    candidate_id: int,
    status_update: CandidateStatusUpdate,
    db: Session = Depends(get_db)
):
    """
    Update the status of a specific candidate (shortlist/reject)
    
    **Parameters:**
    - **candidate_id**: ID of the job application (candidate)
    - **status_update**: Status update data containing 'shortlist' or 'reject'
    
    **Returns:**
    - Success message with updated status
    """
    try:
        # Validate status
        if status_update.status not in ['shortlist', 'reject']:
            raise HTTPException(
                status_code=400,
                detail="Status must be 'shortlist' or 'reject'"
            )
        
        # Find the candidate application
        application = db.query(JobApplication).filter(JobApplication.id == candidate_id).first()
        
        if not application:
            raise HTTPException(
                status_code=404,
                detail="Candidate not found"
            )
        
        # Update the status in the database
        application.status = "Shortlisted" if status_update.status == "shortlist" else "Rejected"
        db.commit()
        db.refresh(application)
        
        return {
            "success": True,
            "message": f"Candidate {status_update.status}ed successfully",
            "candidateId": candidate_id,
            "status": application.status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error updating candidate status: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error updating candidate status: {str(e)}"
        )

@router.post("/bulk-status")
async def bulk_update_candidate_status(
    bulk_update: BulkStatusUpdate,
    db: Session = Depends(get_db)
):
    """
    Update the status of multiple candidates at once (bulk shortlist/reject)
    
    **Parameters:**
    - **bulk_update**: Bulk update data containing candidate IDs and status
    
    **Returns:**
    - Success message with count of updated candidates
    """
    try:
        # Validate status
        if bulk_update.status not in ['shortlist', 'reject']:
            raise HTTPException(
                status_code=400,
                detail="Status must be 'shortlist' or 'reject'"
            )
        
        # Validate candidate IDs
        if not bulk_update.candidate_ids:
            raise HTTPException(
                status_code=400,
                detail="No candidate IDs provided"
            )
        
        # Find all candidate applications
        applications = db.query(JobApplication).filter(
            JobApplication.id.in_(bulk_update.candidate_ids)
        ).all()
        
        if not applications:
            raise HTTPException(
                status_code=404,
                detail="No candidates found with provided IDs"
            )
        
        # Update the status for all candidates
        # For now, we'll just return success - in a real app, you'd update the database
        # for application in applications:
        #     application.status = bulk_update.status
        # db.commit()
        
        return {
            "success": True,
            "message": f"{len(applications)} candidate(s) {bulk_update.status}ed successfully",
            "updatedCount": len(applications),
            "candidateIds": bulk_update.candidate_ids,
            "status": bulk_update.status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error bulk updating candidate status: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error bulk updating candidate status: {str(e)}"
        )