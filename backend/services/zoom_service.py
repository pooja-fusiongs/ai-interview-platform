"""
Video Meeting Integration - Supports Daily.co (FREE), Jitsi, and Zoom.

Daily.co: FREE tier with 10,000 minutes/month - RECOMMENDED
Jitsi Meet: FREE, no API keys required
Zoom: Requires paid account and API credentials

Provides functions to:
- Create video meetings (Daily.co, Jitsi, or Zoom)
- Delete/cancel meetings
- Generate meeting URLs
"""

import requests
import time
import jwt  # PyJWT
import uuid
import re

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

import config


# ─────────────────────────────────────────────────────────────────────────────
# DAILY.CO (FREE) - Recommended, Zoom-like quality
# ─────────────────────────────────────────────────────────────────────────────

def create_daily_room(topic, start_time=None, duration=None):
    """
    Create a Daily.co room - FREE with great quality!

    Returns dict with meeting_id, join_url, host_url, passcode on success.
    """
    if not config.DAILY_API_KEY:
        print("⚠️ Daily.co API key not configured, falling back to Jitsi")
        return None

    # Clean topic to create room name (Daily.co rules: lowercase, alphanumeric, single hyphens, max 41 chars)
    room_name = re.sub(r'[^a-zA-Z0-9\s-]', '', topic)
    room_name = re.sub(r'\s+', '-', room_name.strip()).lower()
    room_name = re.sub(r'-+', '-', room_name)  # Collapse consecutive hyphens
    room_name = room_name.strip('-')  # Remove leading/trailing hyphens

    # Add unique ID to prevent collisions (8 chars + 1 hyphen = 9, so max base = 32)
    unique_id = uuid.uuid4().hex[:8]
    room_name = f"{room_name[:32]}-{unique_id}"

    # Daily.co API to create room
    url = "https://api.daily.co/v1/rooms"
    headers = {
        "Authorization": f"Bearer {config.DAILY_API_KEY}",
        "Content-Type": "application/json"
    }

    # Room settings
    payload = {
        "name": room_name,
        "privacy": "public",  # Anyone with link can join
        "properties": {
            "start_video_off": False,
            "start_audio_off": False,
            "enable_chat": True,
            "enable_screenshare": True,
            "enable_recording": "local",  # Allow local recording
            "max_participants": 10,
            "exp": int(time.time()) + (24 * 60 * 60),  # Room expires in 24 hours
            "enable_prejoin_ui": False,  # Skip pre-join, go directly to call
            "enable_knocking": False,  # No waiting room
        }
    }

    try:
        response = requests.post(url, json=payload, headers=headers)
        if response.status_code in [200, 201]:
            data = response.json()
            join_url = data.get("url", f"https://your-domain.daily.co/{room_name}")
            print(f"✅ Created Daily.co room: {join_url}")
            return {
                "meeting_id": room_name,
                "join_url": join_url,
                "host_url": join_url,  # Same URL for host in Daily.co
                "passcode": "",  # No passcode needed
            }
        else:
            print(f"⚠️ Daily.co room creation failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"⚠️ Daily.co API error: {e}")
        return None


def delete_daily_room(room_name):
    """Delete a Daily.co room."""
    if not config.DAILY_API_KEY:
        return True

    url = f"https://api.daily.co/v1/rooms/{room_name}"
    headers = {
        "Authorization": f"Bearer {config.DAILY_API_KEY}"
    }

    try:
        response = requests.delete(url, headers=headers)
        return response.status_code in [200, 204, 404]  # 404 = already deleted
    except Exception:
        return False

# ─────────────────────────────────────────────────────────────────────────────
# JITSI MEET (FREE) - No API keys required!
# ─────────────────────────────────────────────────────────────────────────────

def create_jitsi_meeting(topic, start_time=None, duration=None):
    """
    Create a FREE Jitsi Meet room - no API keys needed!

    Returns dict with meeting_id, join_url, host_url, passcode on success.
    """
    # Clean topic to create room name (remove special chars, spaces to hyphens)
    room_name = re.sub(r'[^a-zA-Z0-9\s-]', '', topic)
    room_name = re.sub(r'\s+', '-', room_name.strip())
    room_name = re.sub(r'-+', '-', room_name)  # Collapse consecutive hyphens
    room_name = room_name.strip('-')  # Remove leading/trailing hyphens

    # Add unique ID to prevent room name collisions
    unique_id = uuid.uuid4().hex[:8]
    room_name = f"{room_name}-{unique_id}"

    # Jitsi Meet URL
    join_url = f"https://meet.jit.si/{room_name}"

    return {
        "meeting_id": room_name,
        "join_url": join_url,
        "host_url": join_url,  # Same URL for host in Jitsi
        "passcode": "",  # No passcode needed for Jitsi (can be set in room)
    }


def delete_jitsi_meeting(meeting_id):
    """
    Jitsi rooms auto-expire when everyone leaves.
    No API call needed to delete.
    """
    return True


# ─────────────────────────────────────────────────────────────────────────────
# ZOOM (Paid) - Requires API credentials
# ─────────────────────────────────────────────────────────────────────────────

def _get_zoom_access_token():
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


def create_zoom_meeting_api(topic, start_time, duration, host_email=None):
    """
    Create a Zoom meeting via the REST API (requires paid Zoom account).

    Returns dict with meeting_id, join_url, host_url, passcode on success,
    or None on failure.
    """
    token = _get_zoom_access_token()
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


# ─────────────────────────────────────────────────────────────────────────────
# MAIN FUNCTIONS - Auto-select Daily.co (best), Zoom, or Jitsi
# ─────────────────────────────────────────────────────────────────────────────

def create_zoom_meeting(topic, start_time, duration, host_email=None):
    """
    Create a video meeting - Priority: Daily.co > Zoom > Jitsi

    Daily.co: FREE, Zoom-like quality (RECOMMENDED)
    Zoom: Requires paid account
    Jitsi: FREE fallback

    Returns dict with meeting_id, join_url, host_url, passcode.
    """
    # Try Daily.co first (FREE and best quality)
    if config.DAILY_API_KEY:
        daily_result = create_daily_room(topic, start_time, duration)
        if daily_result:
            print(f"✅ Created Daily.co meeting: {daily_result['join_url']}")
            return daily_result
        print("⚠️ Daily.co room creation failed, trying alternatives...")

    # Try Zoom if credentials are configured
    if config.ZOOM_ACCOUNT_ID and config.ZOOM_CLIENT_ID and config.ZOOM_CLIENT_SECRET:
        zoom_result = create_zoom_meeting_api(topic, start_time, duration, host_email)
        if zoom_result:
            print(f"✅ Created Zoom meeting: {zoom_result['join_url']}")
            return zoom_result
        print("⚠️ Zoom meeting creation failed, falling back to Jitsi")

    # Use FREE Jitsi Meet as last resort
    jitsi_result = create_jitsi_meeting(topic, start_time, duration)
    print(f"✅ Created FREE Jitsi meeting: {jitsi_result['join_url']}")
    return jitsi_result


def delete_zoom_meeting(meeting_id):
    """
    Delete/cancel a video meeting.
    For Daily.co: calls API to delete room
    For Jitsi: rooms auto-expire, nothing to delete.
    For Zoom: calls Zoom API to delete.
    """
    if not meeting_id:
        return True

    # Check if it's a Daily.co room (contains our naming pattern)
    if meeting_id and '-' in meeting_id and not meeting_id.isdigit():
        # Try deleting from Daily.co
        if config.DAILY_API_KEY:
            delete_daily_room(meeting_id)
        # Jitsi rooms auto-expire, no action needed
        return True

    # Try Zoom API if credentials exist (for numeric meeting IDs)
    token = _get_zoom_access_token()
    if not token:
        return True  # No Zoom credentials

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
