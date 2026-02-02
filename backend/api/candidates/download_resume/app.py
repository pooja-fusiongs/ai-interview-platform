from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path
import os
from database import get_db
from models import CandidateResume

router = APIRouter()

@router.get("/download/{resume_id}")
async def download_resume(resume_id: int, db: Session = Depends(get_db)):
    """
    Download resume file by resume ID
    
    **Parameters:**
    - **resume_id**: ID of the resume record
    
    **Returns:**
    - Resume file for download
    """
    try:
        # Get resume record from database
        resume = db.query(CandidateResume).filter(CandidateResume.id == resume_id).first()
        
        if not resume:
            raise HTTPException(
                status_code=404,
                detail="Resume not found"
            )
        
        # Check if file exists on disk
        file_path = Path(resume.resume_path)
        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail="Resume file not found on disk"
            )
        
        # Return file for download
        return FileResponse(
            path=str(file_path),
            filename=resume.original_filename,
            media_type='application/pdf'
        )
        
    except Exception as e:
        print(f"❌ Error downloading resume: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error downloading resume: {str(e)}"
        )

@router.get("/view/{resume_id}")
async def view_resume(resume_id: int, db: Session = Depends(get_db)):
    """
    View resume file in browser by resume ID
    
    **Parameters:**
    - **resume_id**: ID of the resume record
    
    **Returns:**
    - Resume file for viewing in browser
    """
    try:
        # Get resume record from database
        resume = db.query(CandidateResume).filter(CandidateResume.id == resume_id).first()
        
        if not resume:
            raise HTTPException(
                status_code=404,
                detail="Resume not found"
            )
        
        # Check if file exists on disk
        file_path = Path(resume.resume_path)
        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail="Resume file not found on disk"
            )
        
        # Return file for viewing in browser
        return FileResponse(
            path=str(file_path),
            media_type='application/pdf',
            headers={"Content-Disposition": "inline"}
        )
        
    except Exception as e:
        print(f"❌ Error viewing resume: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error viewing resume: {str(e)}"
        )