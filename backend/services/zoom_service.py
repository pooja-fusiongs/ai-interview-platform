"""
Zoom REST API Integration using Server-to-Server OAuth.

Provides functions to:
- Obtain access tokens via Zoom S2S OAuth
- Create and delete Zoom meetings
- Generate Meeting SDK JWT signatures for embedded clients
"""

import requests
import time
import jwt  # PyJWT

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import config


def _get_access_token():
    """Get Zoom access token using Server-to-Server OAuth."""
    if not config.ZOOM_ACCOUNT_ID or not config.ZOOM_CLIENT_ID:
        return None
    url = f"https://zoom.us/oauth/token?grant_type=account_credentials&account_id={config.ZOOM_ACCOUNT_ID}"
    response = requests.post(
        url, auth=(config.ZOOM_CLIENT_ID, config.ZOOM_CLIENT_SECRET)
    )
    if response.status_code == 200:
        return response.json().get("access_token")
    return None


def create_zoom_meeting(topic, start_time, duration, host_email=None):
    """
    Create a Zoom meeting via the REST API.

    Returns dict with meeting_id, join_url, host_url, passcode on success,
    or None on failure.
    """
    token = _get_access_token()
    if not token:
        return None
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    url = "https://api.zoom.us/v2/users/me/meetings"
    payload = {
        "topic": topic,
        "type": 2,  # Scheduled
        "start_time": start_time,
        "duration": duration,
        "timezone": "UTC",
        "settings": {
            "join_before_host": False,
            "waiting_room": True,
            "auto_recording": "cloud",
        },
    }
    try:
        resp = requests.post(url, json=payload, headers=headers)
        if resp.status_code == 201:
            data = resp.json()
            return {
                "meeting_id": str(data.get("id")),
                "join_url": data.get("join_url"),
                "host_url": data.get("start_url"),
                "passcode": data.get("password", ""),
            }
    except Exception:
        pass
    return None


def delete_zoom_meeting(meeting_id):
    """Delete/cancel a Zoom meeting by its meeting ID."""
    token = _get_access_token()
    if not token:
        return False
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.delete(
            f"https://api.zoom.us/v2/meetings/{meeting_id}", headers=headers
        )
        return resp.status_code == 204
    except Exception:
        return False


def generate_sdk_signature(meeting_number, role=0):
    """
    Generate a JWT signature for the Zoom Meeting SDK.

    role=0 for participant, role=1 for host.
    Returns the encoded JWT string, or None if SDK credentials are missing.
    """
    if not config.ZOOM_SDK_KEY or not config.ZOOM_SDK_SECRET:
        return None
    iat = int(time.time())
    exp = iat + 60 * 60 * 2  # 2 hours
    payload = {
        "sdkKey": config.ZOOM_SDK_KEY,
        "mn": meeting_number,
        "role": role,
        "iat": iat,
        "exp": exp,
        "tokenExp": exp,
    }
    return jwt.encode(payload, config.ZOOM_SDK_SECRET, algorithm="HS256")
