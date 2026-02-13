from fastapi import APIRouter
from schemas import PrivacyNoticeResponse

router = APIRouter(tags=["GDPR Privacy"])


@router.get("/api/gdpr/privacy-notice", response_model=PrivacyNoticeResponse)
def get_privacy_notice():
    """Public endpoint: Get the current privacy notice."""
    return PrivacyNoticeResponse(
        version="1.0",
        effective_date="2025-01-01",
        content=(
            "This privacy notice describes how we collect, use, and process your personal data "
            "in connection with our AI-powered interview platform. We process your data to "
            "facilitate the recruitment process, including conducting AI-assisted interviews, "
            "generating interview questions, scoring answers, and providing recommendations. "
            "Your data is processed based on your consent and/or the legitimate interests of "
            "the data controller. You have the right to access, rectify, erase, and port your "
            "personal data. You may also withdraw your consent at any time. For data deletion "
            "requests, please use the deletion request feature in your account settings."
        ),
        data_categories=[
            "Personal identification data (name, email, phone)",
            "Professional data (resume, skills, experience)",
            "Interview data (questions, answers, scores)",
            "Video and audio recordings (if applicable)",
            "Biometric analysis data (if consented)",
            "Usage and access logs",
        ],
        retention_summary={
            "personal_data": "Retained for 2 years after last activity or until deletion request",
            "interview_data": "Retained for 1 year after interview completion",
            "video_recordings": "Retained for 90 days after interview completion",
            "biometric_data": "Deleted immediately after analysis unless consent is granted for retention",
            "audit_logs": "Retained for 3 years for compliance purposes",
        },
    )


@router.get("/api/gdpr/privacy-notice/summary")
def get_privacy_notice_summary():
    """Public endpoint: Get a shorter summary of the privacy notice."""
    return {
        "version": "1.0",
        "summary": (
            "We collect and process your personal and professional data to facilitate "
            "AI-powered interviews. You have full control over your data, including the "
            "right to access, export, and delete it. Video and biometric data are only "
            "processed with your explicit consent."
        ),
        "key_rights": [
            "Right to access your data",
            "Right to data portability (export)",
            "Right to erasure (deletion)",
            "Right to withdraw consent",
            "Right to rectification",
        ],
        "contact": "privacy@ai-interview-platform.com",
    }
