"""
Zoom Integration API Endpoints.

Provides internal endpoints for:
- Creating Zoom meetings on demand
- Generating Meeting SDK JWT signatures
- Receiving Zoom webhook events
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import logging

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from database import get_db
from api.auth.jwt_handler import get_current_active_user
from services.zoom_service import create_zoom_meeting, generate_sdk_signature

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Zoom Integration"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ZoomMeetingRequest(BaseModel):
    topic: str
    start_time: str  # ISO-8601
    duration: int  # minutes


class ZoomMeetingResponse(BaseModel):
    meeting_id: Optional[str] = None
    join_url: Optional[str] = None
    host_url: Optional[str] = None
    passcode: Optional[str] = None
    success: bool


class ZoomSignatureResponse(BaseModel):
    signature: Optional[str] = None
    success: bool


# ---------------------------------------------------------------------------
# POST /api/video/zoom/create-meeting
# ---------------------------------------------------------------------------

@router.post(
    "/api/video/zoom/create-meeting",
    response_model=ZoomMeetingResponse,
)
def api_create_zoom_meeting(
    body: ZoomMeetingRequest,
    current_user=Depends(get_current_active_user),
):
    """
    Internal endpoint to create a Zoom meeting.
    Takes topic, start_time (ISO-8601), and duration (minutes).
    """
    result = create_zoom_meeting(
        topic=body.topic,
        start_time=body.start_time,
        duration=body.duration,
    )
    if result:
        return ZoomMeetingResponse(
            meeting_id=result["meeting_id"],
            join_url=result["join_url"],
            host_url=result["host_url"],
            passcode=result["passcode"],
            success=True,
        )
    return ZoomMeetingResponse(success=False)


# ---------------------------------------------------------------------------
# GET /api/video/zoom/signature
# ---------------------------------------------------------------------------

@router.get(
    "/api/video/zoom/signature",
    response_model=ZoomSignatureResponse,
)
def get_zoom_signature(
    meeting_number: str,
    role: int = 0,
    current_user=Depends(get_current_active_user),
):
    """
    Generate a Meeting SDK JWT signature.
    Query params: meeting_number, role (0=participant, 1=host).
    """
    sig = generate_sdk_signature(meeting_number=meeting_number, role=role)
    if sig:
        return ZoomSignatureResponse(signature=sig, success=True)
    return ZoomSignatureResponse(success=False)


# ---------------------------------------------------------------------------
# POST /api/video/zoom/webhook
# ---------------------------------------------------------------------------

@router.post("/api/video/zoom/webhook")
async def zoom_webhook(request: Request):
    """
    Zoom webhook receiver. Logs the incoming event payload and
    responds with HTTP 200 to acknowledge receipt.
    """
    try:
        payload = await request.json()
        event_type = payload.get("event", "unknown")
        logger.info(f"Zoom webhook received: event={event_type}")
        logger.debug(f"Zoom webhook payload: {payload}")
        return {"status": "received", "event": event_type}
    except Exception as exc:
        logger.error(f"Zoom webhook error: {exc}")
        return {"status": "error", "message": str(exc)}
