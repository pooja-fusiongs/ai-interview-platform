"""
LiveKit Token Generation Router
Generates access tokens for LiveKit video interview rooms
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from livekit import api
from livekit.protocol.agent_dispatch import CreateAgentDispatchRequest
import os
from datetime import datetime
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
    try:
        api_key = os.getenv("LIVEKIT_API_KEY")
        api_secret = os.getenv("LIVEKIT_API_SECRET")
        livekit_url = os.getenv("LIVEKIT_URL")

        if not api_key or not api_secret or not livekit_url:
            raise HTTPException(
                status_code=500,
                detail="LiveKit credentials not configured."
            )

        token = api.AccessToken(api_key, api_secret)
        token.with_identity(request.participant_identity)
        token.with_name(request.participant_name)

        if request.role == "interviewer":
            grants = api.VideoGrants(
                room_join=True,
                room=request.room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
                room_admin=True,
                room_record=True,
            )
        else:
            grants = api.VideoGrants(
                room_join=True,
                room=request.room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
            )

        token.with_grants(grants)
        jwt_token = token.to_jwt()

        return TokenResponse(
            token=jwt_token,
            livekit_url=livekit_url,
            room_name=request.room_name
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate token: {str(e)}")


@router.get("/health")
async def livekit_health_check():
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    livekit_url = os.getenv("LIVEKIT_URL")
    configured = bool(api_key and api_secret and livekit_url)
    return {
        "status": "configured" if configured else "not_configured",
        "livekit_url": livekit_url if configured else None,
        "message": "LiveKit is ready" if configured else "Credentials not set"
    }


@router.post("/dispatch-agent")
async def dispatch_agent(request: DispatchAgentRequest):
    """
    Trigger the AI agent to join a specific room.
    """
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    livekit_url = os.getenv("LIVEKIT_URL")

    if not api_key or not api_secret or not livekit_url:
        raise HTTPException(status_code=500, detail="LiveKit credentials not configured")

    try:
        lkapi = api.LiveKitAPI(livekit_url, api_key, api_secret)

        print(f"🚀 Dispatching agent '{request.agent_name}' to room: {request.room_name}")

        # ✅ FIXED: Correct way to dispatch agent in livekit-python SDK
        dispatch_request = CreateAgentDispatchRequest(
            agent_name=request.agent_name,
            room=request.room_name,
        )
        result = await lkapi.agent_dispatch.create_dispatch(dispatch_request)
        print(f"✅ Agent dispatched successfully: {result}")

        await lkapi.aclose()

        return {
            "status": "success",
            "message": f"Agent {request.agent_name} dispatched to {request.room_name}"
        }

    except Exception as e:
        print(f"❌ Error dispatching agent: {e}")
        raise HTTPException(status_code=500, detail=str(e))