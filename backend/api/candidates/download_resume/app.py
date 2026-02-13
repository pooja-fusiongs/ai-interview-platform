from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pathlib import Path
import os
from database import get_db
from models import CandidateResume

router = APIRouter()

# Local uploads directory (fallback when stored path is from a different environment)
LOCAL_UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "resumes")


def _resolve_resume_path(stored_path: str) -> Path:
    """Resolve resume file path, falling back to local uploads dir if stored path doesn't exist."""
    file_path = Path(stored_path)
    if file_path.exists():
        return file_path
    # Fallback: try filename only in local uploads directory
    filename = os.path.basename(stored_path)
    local_path = Path(os.path.normpath(os.path.join(LOCAL_UPLOADS_DIR, filename)))
    if local_path.exists():
        return local_path
    return file_path  # Return original for error reporting


@router.get("/download/{resume_id}")
async def download_resume(resume_id: int, db: Session = Depends(get_db)):
    """Download resume file by resume ID"""
    try:
        resume = db.query(CandidateResume).filter(CandidateResume.id == resume_id).first()

        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")

        # Handle NULL resume_path - try to find file by resume_id (files are named {resume_id}_*.pdf)
        if not resume.resume_path:
            print(f"⚠️  Resume path is NULL for resume_id={resume_id}, candidate_id={resume.candidate_id}")
            # Try to find file in local uploads directory
            local_uploads = Path(LOCAL_UPLOADS_DIR)
            if local_uploads.exists():
                # Look for files matching resume_id pattern first (most common naming)
                matching_files = list(local_uploads.glob(f"{resume_id}_*.pdf"))
                if not matching_files:
                    # Fallback: try candidate_id pattern
                    matching_files = list(local_uploads.glob(f"{resume.candidate_id}_*.pdf"))
                
                if matching_files:
                    file_path = matching_files[0]
                    print(f"✅ Found file by pattern: {file_path.name}")
                else:
                    raise HTTPException(status_code=404, detail=f"Resume file not found (path is NULL and no file found for resume_id={resume_id} or candidate_id={resume.candidate_id})")
            else:
                raise HTTPException(status_code=404, detail="Resume path is NULL and uploads directory not found")
        else:
            file_path = _resolve_resume_path(resume.resume_path)
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Resume file not found on disk")

        return FileResponse(
            path=str(file_path),
            filename=resume.original_filename or f"resume_{resume_id}.pdf",
            media_type='application/pdf'
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error downloading resume: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error downloading resume: {str(e)}")


@router.get("/view/{resume_id}")
async def view_resume(resume_id: int, db: Session = Depends(get_db)):
    """View resume file in browser by resume ID"""
    try:
        resume = db.query(CandidateResume).filter(CandidateResume.id == resume_id).first()

        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")

        # Handle NULL resume_path - try to find file by resume_id (files are named {resume_id}_*.pdf)
        if not resume.resume_path:
            print(f"⚠️  Resume path is NULL for resume_id={resume_id}, candidate_id={resume.candidate_id}")
            # Try to find file in local uploads directory
            local_uploads = Path(LOCAL_UPLOADS_DIR)
            if local_uploads.exists():
                # Look for files matching resume_id pattern first (most common naming)
                matching_files = list(local_uploads.glob(f"{resume_id}_*.pdf"))
                if not matching_files:
                    # Fallback: try candidate_id pattern
                    matching_files = list(local_uploads.glob(f"{resume.candidate_id}_*.pdf"))
                
                if matching_files:
                    file_path = matching_files[0]
                    print(f"✅ Found file by pattern: {file_path.name}")
                else:
                    raise HTTPException(status_code=404, detail=f"Resume file not found (path is NULL and no file found for resume_id={resume_id} or candidate_id={resume.candidate_id})")
            else:
                raise HTTPException(status_code=404, detail="Resume path is NULL and uploads directory not found")
        else:
            file_path = _resolve_resume_path(resume.resume_path)
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Resume file not found on disk")

        return FileResponse(
            path=str(file_path),
            media_type='application/pdf',
            headers={"Content-Disposition": "inline"}
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error viewing resume: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error viewing resume: {str(e)}")