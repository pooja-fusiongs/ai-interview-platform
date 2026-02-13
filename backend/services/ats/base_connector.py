from abc import ABC, abstractmethod
from typing import List, Optional


class BaseATSConnector(ABC):
    def __init__(self, api_key: str, base_url: str = None):
        self.api_key = api_key
        self.base_url = base_url

    @abstractmethod
    def test_connection(self) -> bool: ...

    @abstractmethod
    def fetch_jobs(self) -> List[dict]: ...

    @abstractmethod
    def fetch_candidates(self, job_id: str) -> List[dict]: ...

    @abstractmethod
    def fetch_resume(self, candidate_id: str) -> Optional[bytes]: ...

    @abstractmethod
    def map_job_to_local(self, ats_job: dict) -> dict: ...

    @abstractmethod
    def map_candidate_to_local(self, ats_candidate: dict) -> dict: ...
