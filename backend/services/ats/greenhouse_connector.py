import requests
from typing import List, Optional

from services.ats.base_connector import BaseATSConnector


class GreenhouseConnector(BaseATSConnector):
    """Connector for the Greenhouse Harvest API."""

    def __init__(self, api_key: str, base_url: str = None):
        super().__init__(api_key, base_url or "https://harvest.greenhouse.io/v1/")

    def _get(self, endpoint: str, params: dict = None) -> requests.Response:
        url = f"{self.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        return requests.get(url, auth=(self.api_key, ""), params=params)

    def test_connection(self) -> bool:
        try:
            resp = self._get("candidates", params={"per_page": 1})
            return resp.status_code == 200
        except Exception:
            return False

    def fetch_jobs(self) -> List[dict]:
        try:
            resp = self._get("jobs", params={"status": "open"})
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return []

    def fetch_candidates(self, job_id: str) -> List[dict]:
        try:
            resp = self._get(f"jobs/{job_id}/candidates")
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return []

    def fetch_resume(self, candidate_id: str) -> Optional[bytes]:
        try:
            resp = self._get(f"candidates/{candidate_id}/attachments")
            resp.raise_for_status()
            attachments = resp.json()
            for att in attachments:
                if att.get("type") == "resume":
                    file_resp = requests.get(att["url"], auth=(self.api_key, ""))
                    file_resp.raise_for_status()
                    return file_resp.content
            return None
        except Exception:
            return None

    def map_job_to_local(self, ats_job: dict) -> dict:
        offices = ats_job.get("offices") or []
        departments = ats_job.get("departments") or []
        return {
            "title": ats_job.get("name"),
            "description": ats_job.get("notes"),
            "location": offices[0].get("name") if offices else None,
            "department": departments[0].get("name") if departments else None,
        }

    def map_candidate_to_local(self, ats_candidate: dict) -> dict:
        first = ats_candidate.get("first_name", "")
        last = ats_candidate.get("last_name", "")
        emails = ats_candidate.get("email_addresses") or []
        phones = ats_candidate.get("phone_numbers") or []
        return {
            "applicant_name": f"{first} {last}".strip(),
            "applicant_email": emails[0].get("value") if emails else None,
            "applicant_phone": phones[0].get("value") if phones else None,
        }
