import requests
from typing import List, Optional

from services.ats.base_connector import BaseATSConnector


class LeverConnector(BaseATSConnector):
    """Connector for the Lever API."""

    def __init__(self, api_key: str, base_url: str = None):
        super().__init__(api_key, base_url or "https://api.lever.co/v1/")

    def _get(self, endpoint: str, params: dict = None) -> requests.Response:
        url = f"{self.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        return requests.get(url, auth=(self.api_key, ""), params=params)

    def test_connection(self) -> bool:
        try:
            resp = self._get("postings", params={"limit": 1})
            return resp.status_code == 200
        except Exception:
            return False

    def fetch_jobs(self) -> List[dict]:
        try:
            resp = self._get("postings", params={"state": "published"})
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return []

    def fetch_candidates(self, job_id: str) -> List[dict]:
        try:
            resp = self._get("opportunities", params={"posting_id": job_id})
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return []

    def fetch_resume(self, candidate_id: str) -> Optional[bytes]:
        try:
            resp = self._get(f"opportunities/{candidate_id}/resumes")
            resp.raise_for_status()
            resumes = resp.json()
            if resumes:
                first = resumes[0]
                content = first.get("content")
                if isinstance(content, bytes):
                    return content
                if isinstance(content, str):
                    return content.encode("utf-8")
            return None
        except Exception:
            return None

    def map_job_to_local(self, ats_job: dict) -> dict:
        content = ats_job.get("content") or {}
        categories = ats_job.get("categories") or {}
        return {
            "title": ats_job.get("text"),
            "description": content.get("description"),
            "location": categories.get("location"),
            "department": categories.get("team"),
        }

    def map_candidate_to_local(self, ats_candidate: dict) -> dict:
        emails = ats_candidate.get("emails") or []
        phones = ats_candidate.get("phones") or []
        return {
            "applicant_name": ats_candidate.get("name", ""),
            "applicant_email": emails[0] if emails else None,
            "applicant_phone": phones[0].get("value") if phones else None,
        }
