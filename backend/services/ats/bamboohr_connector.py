import requests
from typing import List, Optional

from services.ats.base_connector import BaseATSConnector


class BambooHRConnector(BaseATSConnector):
    """Connector for the BambooHR API.

    Requires a company subdomain to construct the base URL.
    Example base_url: https://api.bamboohr.com/api/gateway.php/mycompany/v1/
    """

    def __init__(self, api_key: str, base_url: str = None):
        if not base_url:
            raise ValueError(
                "BambooHR requires a base_url with your company subdomain, e.g. "
                "https://api.bamboohr.com/api/gateway.php/{company}/v1/"
            )
        super().__init__(api_key, base_url)

    def _get(self, endpoint: str, params: dict = None) -> requests.Response:
        url = f"{self.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        headers = {"Accept": "application/json"}
        return requests.get(
            url, auth=(self.api_key, "x"), headers=headers, params=params
        )

    def test_connection(self) -> bool:
        try:
            resp = self._get("employees/directory")
            return resp.status_code == 200
        except Exception:
            return False

    def fetch_jobs(self) -> List[dict]:
        try:
            resp = self._get("applicant_tracking/jobs", params={"statusGroupId": 2})
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return []

    def fetch_candidates(self, job_id: str) -> List[dict]:
        try:
            resp = self._get(f"applicant_tracking/jobs/{job_id}/applications")
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return []

    def fetch_resume(self, candidate_id: str) -> Optional[bytes]:
        # BambooHR does not expose a direct resume download endpoint
        # in the standard ATS API; return None as a safe default.
        return None

    def map_job_to_local(self, ats_job: dict) -> dict:
        title_obj = ats_job.get("title") or {}
        desc_obj = ats_job.get("description") or {}
        loc_obj = ats_job.get("location") or {}
        dept_obj = ats_job.get("department") or {}
        return {
            "title": title_obj.get("label"),
            "description": desc_obj.get("label"),
            "location": loc_obj.get("label"),
            "department": dept_obj.get("label"),
        }

    def map_candidate_to_local(self, ats_candidate: dict) -> dict:
        applicant = ats_candidate.get("applicant") or {}
        first = applicant.get("firstName", "")
        last = applicant.get("lastName", "")
        return {
            "applicant_name": f"{first} {last}".strip(),
            "applicant_email": applicant.get("email"),
            "applicant_phone": applicant.get("phone"),
        }
