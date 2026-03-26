"""
Cloudinary video upload service for interview recordings.
"""
import cloudinary
import cloudinary.uploader
import config


def _ensure_configured():
    """Configure Cloudinary SDK if credentials are available."""
    if not config.CLOUDINARY_CLOUD_NAME:
        return False
    cloudinary.config(
        cloud_name=config.CLOUDINARY_CLOUD_NAME,
        api_key=config.CLOUDINARY_API_KEY,
        api_secret=config.CLOUDINARY_API_SECRET,
        secure=True,
    )
    return True


def upload_recording(file_path: str, video_id: int) -> str | None:
    """
    Upload a recording file to Cloudinary.
    Returns the secure URL on success, None if Cloudinary is not configured.
    """
    if not _ensure_configured():
        return None

    result = cloudinary.uploader.upload(
        file_path,
        resource_type="video",
        folder="interview_recordings",
        public_id=f"interview_{video_id}",
        overwrite=True,
        timeout=300,
    )
    return result.get("secure_url")
