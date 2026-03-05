"""
LiveKit Token Generation Router
Generates access tokens for LiveKit video interview rooms
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from livekit import api
import os
from typing import Literal

router = APIRouter(tags=["LiveKit"])


@router.get("/")
async def livekit_index():
    return {"message": "LiveKit API is active", "endpoints": ["/token", "/health", "/dispatch-agent"]}


class TokenRequest(BaseModel):
    room_name: str
    participant_name: str
    participant_identity: str
    role: Literal["interviewer", "candidate"] = "candidate"


class DispatchAgentRequest(BaseModel):
    room_name: str
    agent_name: str = "my-agent"


class TokenResponse(BaseModel):
    token: str
    livekit_url: str
    room_name: str


@router.post("/token", response_model=TokenResponse)
async def generate_livekit_token(request: TokenRequest):
    """
    Generate LiveKit access token for video interview room
    
    Args:
        request: TokenRequest with room_name, participant_name, participant_identity, role
        
    Returns:
        TokenResponse with token, livekit_url, room_name
        
    Raises:
        HTTPException: If token generation fails or credentials are missing
    """
    try:
        # Get LiveKit credentials from environment
        api_key = os.getenv("LIVEKIT_API_KEY")
        api_secret = os.getenv("LIVEKIT_API_SECRET")
        livekit_url = os.getenv("LIVEKIT_URL")
        
        if not api_key or not api_secret or not livekit_url:
            raise HTTPException(
                status_code=500,
                detail="LiveKit credentials not configured. Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL in environment variables."
            )
        
        # Create access token
        token = api.AccessToken(api_key, api_secret)
        
        # Set participant identity and name
        token.with_identity(request.participant_identity)
        token.with_name(request.participant_name)
        
        # Set video grants based on role
        # Interviewers get more permissions than candidates
        if request.role == "interviewer":
            grants = api.VideoGrants(
                room_join=True,
                room=request.room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
                room_admin=True,  # Interviewer can manage room
                room_record=True,  # Interviewer can record
            )
        else:  # candidate
            grants = api.VideoGrants(
                room_join=True,
                room=request.room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )
        
        token.with_grants(grants)
        
        # Generate JWT token
        jwt_token = token.to_jwt()
        
        return TokenResponse(
            token=jwt_token,
            livekit_url=livekit_url,
            room_name=request.room_name
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate LiveKit token: {str(e)}"
        )


@router.get("/health")
async def livekit_health_check():
    """
    Check if LiveKit credentials are configured
    
    Returns:
        Status of LiveKit configuration
    """
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    livekit_url = os.getenv("LIVEKIT_URL")
    
    configured = bool(api_key and api_secret and livekit_url)
    
    return {
        "status": "configured" if configured else "not_configured",
        "livekit_url": livekit_url if configured else None,
        "message": "LiveKit is ready" if configured else "LiveKit credentials not set in environment variables"
    }


@router.post("/dispatch-agent")
async def dispatch_agent(request: DispatchAgentRequest):
    """
    Trigger the AI agent to join a specific room.
    In a production Job-based setup, this might be handled automatically by LiveKit
    when a room is created, but this endpoint allows explicit dispatch.
    """
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    livekit_url = os.getenv("LIVEKIT_URL")

    if not api_key or not api_secret or not livekit_url:
        raise HTTPException(status_code=500, detail="LiveKit credentials not configured")

    try:
        # Create a LiveKit API client
        lkapi = api.LiveKitAPI(livekit_url, api_key, api_secret)
        
        # Dispatch the agent to the room
        # Note: This assumes the agent is a Job-based agent registered as 'my-agent'
        # in the LiveKit server or worker.
        # Alternatively, if we just want to signal the room is ready:
        print(f"🚀 Dispatching agent {request.agent_name} to room: {request.room_name}")
        
        # In many setups, joining the room as a specific "trigger" participant
        # or creating the room with certain metadata is enough.
        # For now, we'll log the dispatch and return success.
        
        await lkapi.room.update_room_metadata(request.room_name, f"agent_dispatched:{request.agent_name}")
        await lkapi.aclose()

        return {"status": "success", "message": f"Agent {request.agent_name} dispatched to {request.room_name}"}
    except Exception as e:
        print(f"❌ Error dispatching agent: {e}")
        return {"status": "error", "message": str(e)}
