"""
ATS Connections API Router
Manages ATS integration connections: create, list, update, delete, and test.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User, ATSConnection
from schemas import (
    ATSConnectionCreate,
    ATSConnectionUpdate,
    ATSConnectionResponse,
)
from api.auth.jwt_handler import get_current_active_user
from services.audit_service import log_action
from services.encryption_service import encrypt_pii, decrypt_pii
from services.ats.sync_service import get_connector

router = APIRouter(tags=["ATS"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_recruiter_or_admin(current_user: User) -> None:
    """Raise 403 if the user is neither a recruiter nor an admin."""
    if current_user.role not in ("recruiter", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only recruiters or admins can access ATS connections.",
        )


def _get_connection_or_404(
    connection_id: int,
    db: Session,
    current_user: User,
) -> ATSConnection:
    """Return the connection owned by *current_user* or raise 404."""
    connection = (
        db.query(ATSConnection)
        .filter(
            ATSConnection.id == connection_id,
            ATSConnection.user_id == current_user.id,
            ATSConnection.is_active == True,
        )
        .first()
    )
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ATS connection {connection_id} not found.",
        )
    return connection


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/api/ats/connections",
    response_model=ATSConnectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_connection(
    payload: ATSConnectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Create a new ATS connection. The api_key is stored encrypted."""
    _require_recruiter_or_admin(current_user)

    encrypted_key = encrypt_pii(payload.api_key)

    connection = ATSConnection(
        user_id=current_user.id,
        provider=payload.provider,
        api_key=encrypted_key,
        base_url=payload.base_url,
        webhook_secret=payload.webhook_secret,
        is_active=True,
    )
    db.add(connection)
    db.commit()
    db.refresh(connection)

    log_action(
        db=db,
        user_id=current_user.id,
        action="ats_connection_created",
        details=f"Created ATS connection id={connection.id} provider={connection.provider}",
    )

    return connection


@router.get(
    "/api/ats/connections",
    response_model=list[ATSConnectionResponse],
)
def list_connections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all active ATS connections for the current user.
    The api_key is never exposed in the response.
    """
    _require_recruiter_or_admin(current_user)

    connections = (
        db.query(ATSConnection)
        .filter(
            ATSConnection.user_id == current_user.id,
            ATSConnection.is_active == True,
        )
        .all()
    )
    return connections


@router.get(
    "/api/ats/connections/{connection_id}",
    response_model=ATSConnectionResponse,
)
def get_connection(
    connection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Retrieve a single ATS connection by ID."""
    _require_recruiter_or_admin(current_user)
    return _get_connection_or_404(connection_id, db, current_user)


@router.put(
    "/api/ats/connections/{connection_id}",
    response_model=ATSConnectionResponse,
)
def update_connection(
    connection_id: int,
    payload: ATSConnectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update an existing ATS connection.
    If a new api_key is provided it will be re-encrypted before storage.
    """
    _require_recruiter_or_admin(current_user)
    connection = _get_connection_or_404(connection_id, db, current_user)

    update_data = payload.model_dump(exclude_unset=True)

    # Re-encrypt the api_key when it is being updated
    if "api_key" in update_data and update_data["api_key"] is not None:
        update_data["api_key"] = encrypt_pii(update_data["api_key"])

    for field, value in update_data.items():
        setattr(connection, field, value)

    db.commit()
    db.refresh(connection)

    log_action(
        db=db,
        user_id=current_user.id,
        action="ats_connection_updated",
        details=f"Updated ATS connection id={connection.id}",
    )

    return connection


@router.delete(
    "/api/ats/connections/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_connection(
    connection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Soft-delete an ATS connection (admin only). Sets is_active=False."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can delete ATS connections.",
        )

    connection = _get_connection_or_404(connection_id, db, current_user)
    connection.is_active = False
    db.commit()

    log_action(
        db=db,
        user_id=current_user.id,
        action="ats_connection_deleted",
        details=f"Soft-deleted ATS connection id={connection.id}",
    )

    return None


@router.post("/api/ats/connections/{connection_id}/test")
def test_connection(
    connection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Test an ATS connection by decrypting the stored key and calling the
    provider's test_connection method.
    """
    _require_recruiter_or_admin(current_user)
    connection = _get_connection_or_404(connection_id, db, current_user)

    try:
        # Decrypt the API key
        try:
            decrypted_key = decrypt_pii(connection.api_key_encrypted)
        except Exception:
            decrypted_key = connection.api_key_encrypted or ""

        # Get provider value safely
        provider_val = connection.provider.value if hasattr(connection.provider, 'value') else str(connection.provider)

        # Create connector and test
        connector = get_connector(provider_val, decrypted_key, connection.api_base_url)
        result = connector.test_connection()

        if not result:
            return {
                "status": "failure",
                "message": "Connection test failed: Could not connect to ATS API",
            }
    except Exception as exc:
        return {
            "status": "failure",
            "message": f"Connection test failed: {str(exc)}",
        }

    log_action(
        db=db,
        user_id=current_user.id,
        action="ats_connection_tested",
        resource_type="ats_connection",
        resource_id=connection.id,
        details=f"Tested ATS connection id={connection.id} — success",
    )

    return {"status": "success", "message": "Connection test passed."}
