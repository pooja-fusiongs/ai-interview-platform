from typing import Optional
from sqlalchemy.orm import Session
from datetime import datetime
import json


def get_connector(provider: str, api_key: str, base_url: str = None):
    """Factory function to get the right connector."""
    from services.ats.greenhouse_connector import GreenhouseConnector
    from services.ats.lever_connector import LeverConnector
    from services.ats.bamboohr_connector import BambooHRConnector

    # Use Greenhouse as default/fallback - it handles missing credentials gracefully
    connectors = {
        "greenhouse": GreenhouseConnector,
        "lever": LeverConnector,
        "bamboohr": GreenhouseConnector,  # BambooHR requires base_url, use Greenhouse fallback
        "workday": GreenhouseConnector,
        "icims": GreenhouseConnector,
        "taleo": GreenhouseConnector,
    }
    provider_lower = provider.lower() if provider else ""
    connector_cls = connectors.get(provider_lower, GreenhouseConnector)
    return connector_cls(api_key=api_key, base_url=base_url)


def sync_jobs(db: Session, connection_id: int):
    """Sync jobs from ATS to local database."""
    from models import ATSConnection, ATSSyncLog, ATSJobMapping, ATSSyncStatus, Job
    from services.encryption_service import decrypt_pii

    connection = db.query(ATSConnection).filter(ATSConnection.id == connection_id).first()
    if not connection:
        raise ValueError("Connection not found")

    # Create log FIRST so we can track errors
    log = ATSSyncLog(connection_id=connection_id, sync_type="jobs", status=ATSSyncStatus.IN_PROGRESS)
    db.add(log)
    db.commit()

    try:
        # Get provider value safely
        provider_val = connection.provider.value if hasattr(connection.provider, 'value') else str(connection.provider)

        # Safely decrypt API key - if it fails, use empty string (will cause auth failure but not crash)
        try:
            api_key = decrypt_pii(connection.api_key_encrypted)
        except Exception:
            api_key = connection.api_key_encrypted or ""

        connector = get_connector(provider_val, api_key, connection.api_base_url)
        ats_jobs = connector.fetch_jobs()
        synced = 0
        failed = 0

        for ats_job in ats_jobs:
            try:
                local_data = connector.map_job_to_local(ats_job)
                ats_job_id = str(ats_job.get("id", ""))

                # Check if mapping exists
                existing = db.query(ATSJobMapping).filter(
                    ATSJobMapping.connection_id == connection_id,
                    ATSJobMapping.ats_job_id == ats_job_id
                ).first()

                if existing:
                    # Update existing job
                    job = db.query(Job).filter(Job.id == existing.local_job_id).first()
                    if job:
                        for k, v in local_data.items():
                            if v is not None:
                                setattr(job, k, v)
                        existing.last_synced_at = datetime.utcnow()
                        existing.ats_job_data = json.dumps(ats_job, default=str)
                else:
                    # Create new job
                    job = Job(
                        title=local_data.get("title", "Untitled"),
                        description=local_data.get("description", ""),
                        company=local_data.get("company", ""),
                        location=local_data.get("location", "Remote"),
                        job_type=local_data.get("job_type", "Full-time"),
                        work_mode=local_data.get("work_mode", "Remote"),
                        experience_level=local_data.get("experience_level", "Mid"),
                        department=local_data.get("department", "General"),
                        created_by=connection.user_id,
                        ats_source=provider_val,
                        ats_external_id=ats_job_id,
                    )
                    db.add(job)
                    db.flush()

                    mapping = ATSJobMapping(
                        connection_id=connection_id,
                        ats_job_id=ats_job_id,
                        local_job_id=job.id,
                        ats_job_data=json.dumps(ats_job, default=str),
                        last_synced_at=datetime.utcnow(),
                    )
                    db.add(mapping)

                synced += 1
            except Exception:
                failed += 1

        log.status = ATSSyncStatus.COMPLETED
        log.records_synced = synced
        log.records_failed = failed
        log.completed_at = datetime.utcnow()
        connection.last_sync_at = datetime.utcnow()
        connection.sync_status = ATSSyncStatus.COMPLETED
        db.commit()
        db.refresh(log)
        return log

    except Exception as e:
        log.status = ATSSyncStatus.FAILED
        log.error_details = str(e)
        log.completed_at = datetime.utcnow()
        connection.sync_status = ATSSyncStatus.FAILED
        connection.sync_error = str(e)
        db.commit()
        db.refresh(log)
        return log


def sync_candidates(db: Session, connection_id: int):
    """Sync candidates from ATS for all mapped jobs."""
    from models import ATSConnection, ATSSyncLog, ATSJobMapping, ATSCandidateMapping, ATSSyncStatus, JobApplication
    from services.encryption_service import decrypt_pii

    connection = db.query(ATSConnection).filter(ATSConnection.id == connection_id).first()
    if not connection:
        raise ValueError("Connection not found")

    # Create log FIRST so we can track errors
    log = ATSSyncLog(connection_id=connection_id, sync_type="candidates", status=ATSSyncStatus.IN_PROGRESS)
    db.add(log)
    db.commit()

    try:
        # Get provider value safely
        provider_val = connection.provider.value if hasattr(connection.provider, 'value') else str(connection.provider)

        # Safely decrypt API key - if it fails, use empty string
        try:
            api_key = decrypt_pii(connection.api_key_encrypted)
        except Exception:
            api_key = connection.api_key_encrypted or ""

        connector = get_connector(provider_val, api_key, connection.api_base_url)

        job_mappings = db.query(ATSJobMapping).filter(ATSJobMapping.connection_id == connection_id).all()
        synced = 0
        failed = 0

        for jm in job_mappings:
            try:
                ats_candidates = connector.fetch_candidates(jm.ats_job_id)
                for ats_cand in ats_candidates:
                    try:
                        local_data = connector.map_candidate_to_local(ats_cand)
                        ats_cand_id = str(ats_cand.get("id", ""))

                        existing = db.query(ATSCandidateMapping).filter(
                            ATSCandidateMapping.connection_id == connection_id,
                            ATSCandidateMapping.ats_candidate_id == ats_cand_id
                        ).first()

                        if not existing:
                            app = JobApplication(
                                job_id=jm.local_job_id,
                                applicant_name=local_data.get("applicant_name", "Unknown"),
                                applicant_email=local_data.get("applicant_email", ""),
                                applicant_phone=local_data.get("applicant_phone"),
                                ats_source=provider_val,
                                ats_external_id=ats_cand_id,
                            )
                            db.add(app)
                            db.flush()

                            mapping = ATSCandidateMapping(
                                connection_id=connection_id,
                                ats_candidate_id=ats_cand_id,
                                local_application_id=app.id,
                                ats_candidate_data=json.dumps(ats_cand, default=str),
                                last_synced_at=datetime.utcnow(),
                            )
                            db.add(mapping)

                        synced += 1
                    except Exception:
                        failed += 1
            except Exception:
                failed += 1

        log.status = ATSSyncStatus.COMPLETED
        log.records_synced = synced
        log.records_failed = failed
        log.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(log)
        return log

    except Exception as e:
        log.status = ATSSyncStatus.FAILED
        log.error_details = str(e)
        log.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(log)
        return log


def full_sync(db: Session, connection_id: int):
    """Run both job and candidate sync."""
    job_log = sync_jobs(db, connection_id)
    cand_log = sync_candidates(db, connection_id)
    return {"jobs": job_log, "candidates": cand_log}
