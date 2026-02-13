"""
ATS Webhooks API Router
Receive and verify inbound webhooks from ATS providers.

These endpoints are *unauthenticated* — they rely on provider-specific
signature / secret verification instead.
"""

import hashlib
import hmac
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from sqlalchemy.orm import Session

from database import get_db
from models import ATSConnection
from services.audit_service import log_action

router = APIRouter(tags=["ATS"])

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _verify_webhook_secret(
    provided_signature: str | None,
    expected_secret: str | None,
    provider: str,
) -> None:
    """Compare the signature/secret sent by the provider against the stored
    webhook_secret.  Raises 401 on mismatch or if either value is missing.
    """
    if not provided_signature or not expected_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"{provider} webhook verification failed: missing signature or secret.",
        )

    if not hmac.compare_digest(provided_signature, expected_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"{provider} webhook verification failed: signature mismatch.",
        )


def _get_webhook_secret_for_provider(
    provider: str,
    db: Session,
) -> str | None:
    """Look up the first active connection for *provider* and return its
    webhook_secret, or None if not found.
    """
    connection = (
        db.query(ATSConnection)
        .filter(
            ATSConnection.provider == provider,
            ATSConnection.is_active == True,
        )
        .first()
    )
    if connection is None:
        return None
    return connection.webhook_secret


async def _read_body(request: Request) -> dict[str, Any]:
    """Read and parse the JSON request body, returning an empty dict on
    failure so that we always have something to log.
    """
    try:
        return await request.json()
    except Exception:
        raw = await request.body()
        return {"_raw": raw.decode("utf-8", errors="replace")}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/api/ats/webhooks/greenhouse")
async def greenhouse_webhook(
    request: Request,
    db: Session = Depends(get_db),
    greenhouse_signature: str | None = Header(None, alias="Greenhouse-Signature"),
):
    """Receive a webhook event from Greenhouse.

    Verification is performed by comparing the ``Greenhouse-Signature``
    header against the stored webhook secret for the Greenhouse connection.
    """
    expected_secret = _get_webhook_secret_for_provider("greenhouse", db)
    _verify_webhook_secret(greenhouse_signature, expected_secret, "Greenhouse")

    payload = await _read_body(request)

    logger.info("Greenhouse webhook received: %s", json.dumps(payload, default=str)[:500])

    log_action(
        db=db,
        user_id=None,
        action="ats_webhook_received",
        details=json.dumps(
            {"provider": "greenhouse", "event": payload},
            default=str,
        )[:2000],
    )

    return {"status": "ok", "provider": "greenhouse"}


@router.post("/api/ats/webhooks/lever")
async def lever_webhook(
    request: Request,
    db: Session = Depends(get_db),
    lever_signature: str | None = Header(None, alias="X-Lever-Signature"),
):
    """Receive a webhook event from Lever.

    Verification is performed by comparing the ``X-Lever-Signature``
    header against the stored webhook secret for the Lever connection.
    """
    expected_secret = _get_webhook_secret_for_provider("lever", db)
    _verify_webhook_secret(lever_signature, expected_secret, "Lever")

    payload = await _read_body(request)

    logger.info("Lever webhook received: %s", json.dumps(payload, default=str)[:500])

    log_action(
        db=db,
        user_id=None,
        action="ats_webhook_received",
        details=json.dumps(
            {"provider": "lever", "event": payload},
            default=str,
        )[:2000],
    )

    return {"status": "ok", "provider": "lever"}


@router.post("/api/ats/webhooks/bamboohr")
async def bamboohr_webhook(
    request: Request,
    db: Session = Depends(get_db),
    bamboohr_signature: str | None = Header(None, alias="X-BambooHR-Signature"),
):
    """Receive a webhook event from BambooHR.

    Verification is performed by comparing the ``X-BambooHR-Signature``
    header against the stored webhook secret for the BambooHR connection.
    """
    expected_secret = _get_webhook_secret_for_provider("bamboohr", db)
    _verify_webhook_secret(bamboohr_signature, expected_secret, "BambooHR")

    payload = await _read_body(request)

    logger.info("BambooHR webhook received: %s", json.dumps(payload, default=str)[:500])

    log_action(
        db=db,
        user_id=None,
        action="ats_webhook_received",
        details=json.dumps(
            {"provider": "bamboohr", "event": payload},
            default=str,
        )[:2000],
    )

    return {"status": "ok", "provider": "bamboohr"}
