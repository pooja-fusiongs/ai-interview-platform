from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List
import json
import os

from database import get_db
from api.auth.jwt_handler import get_current_active_user
from models import User, UserRole, DataExportRequest
from schemas import DataExportRequestCreate, DataExportRequestResponse
from services.data_retention_service import export_user_data

router = APIRouter(tags=["GDPR Data Export"])

EXPORTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "uploads",
    "exports",
)


@router.post("/api/gdpr/data-export", response_model=DataExportRequestResponse)
def request_data_export(
    export_data: DataExportRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Request a data export (Right to Data Portability)."""
    export_request = DataExportRequest(
        user_id=current_user.id,
        export_format=export_data.export_format,
        status="processing",
    )
    db.add(export_request)
    db.commit()
    db.refresh(export_request)

    # Generate the export data
    user_data = export_user_data(db=db, user_id=current_user.id)

    # Ensure the exports directory exists
    os.makedirs(EXPORTS_DIR, exist_ok=True)

    # Write the export to a JSON file
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"user_{current_user.id}_{timestamp}.json"
    file_path = os.path.join(EXPORTS_DIR, filename)

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(user_data, f, indent=2, default=str)

    # Update the export request record
    now = datetime.now(timezone.utc)
    export_request.file_path = file_path
    export_request.status = "ready"
    export_request.completed_at = now
    export_request.expires_at = now + timedelta(hours=48)
    db.commit()
    db.refresh(export_request)

    return export_request


@router.get("/api/gdpr/data-export/me", response_model=List[DataExportRequestResponse])
def get_my_export_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get all data export requests for the current user."""
    exports = (
        db.query(DataExportRequest)
        .filter(DataExportRequest.user_id == current_user.id)
        .order_by(DataExportRequest.requested_at.desc())
        .all()
    )
    return exports


@router.get("/api/gdpr/data-export/{request_id}/download")
def download_export(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Download a completed data export. Only the owner can download."""
    export_request = (
        db.query(DataExportRequest)
        .filter(DataExportRequest.id == request_id)
        .first()
    )
    if not export_request:
        raise HTTPException(status_code=404, detail="Export request not found")

    if export_request.user_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="You can only download your own data exports"
        )

    if export_request.status != "ready":
        raise HTTPException(
            status_code=400, detail="Export is not ready for download"
        )

    if not export_request.file_path or not os.path.exists(export_request.file_path):
        raise HTTPException(status_code=404, detail="Export file not found")

    # Check if the export has expired
    if export_request.expires_at and datetime.now(timezone.utc) > export_request.expires_at:
        raise HTTPException(status_code=410, detail="Export has expired")

    # Increment download count
    export_request.download_count = (export_request.download_count or 0) + 1
    db.commit()

    return FileResponse(
        path=export_request.file_path,
        filename=os.path.basename(export_request.file_path),
        media_type="application/json",
    )
