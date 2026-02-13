"""
One-time migration script to encrypt existing plaintext PII data.

Usage:
    cd backend
    python -m scripts.encrypt_existing_data

Requires PII_ENCRYPTION_KEY to be set in .env or environment.
"""

import sys
import os

# Add parent dir so imports work when run as `python -m scripts.encrypt_existing_data`
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SessionLocal
from models import User, JobApplication
from services.encryption_service import (
    encrypt_pii,
    USER_PII_FIELDS,
    APPLICATION_PII_FIELDS,
)
import config


def _is_encrypted(value: str) -> bool:
    """Heuristic: Fernet tokens always start with 'gAAAAA'."""
    return value.startswith("gAAAAA")


def encrypt_users(db, batch_size=100):
    """Encrypt plaintext PII fields on all User rows."""
    users = db.query(User).all()
    updated = 0
    for i, user in enumerate(users):
        changed = False
        for field in USER_PII_FIELDS:
            val = getattr(user, field, None)
            if val and isinstance(val, str) and not _is_encrypted(val):
                setattr(user, field, encrypt_pii(val))
                changed = True
        if changed:
            updated += 1
        if (i + 1) % batch_size == 0:
            db.commit()
            print(f"  Users processed: {i + 1}/{len(users)}")
    db.commit()
    print(f"  Users encrypted: {updated}/{len(users)}")


def encrypt_applications(db, batch_size=100):
    """Encrypt plaintext PII fields on all JobApplication rows."""
    apps = db.query(JobApplication).all()
    updated = 0
    for i, app in enumerate(apps):
        changed = False
        for field in APPLICATION_PII_FIELDS:
            val = getattr(app, field, None)
            if val and isinstance(val, str) and not _is_encrypted(val):
                setattr(app, field, encrypt_pii(val))
                changed = True
        if changed:
            updated += 1
        if (i + 1) % batch_size == 0:
            db.commit()
            print(f"  Applications processed: {i + 1}/{len(apps)}")
    db.commit()
    print(f"  Applications encrypted: {updated}/{len(apps)}")


def main():
    if not config.PII_ENCRYPTION_KEY:
        print("PII_ENCRYPTION_KEY is not set. Aborting.")
        sys.exit(1)

    print("Starting PII encryption migration...")
    db = SessionLocal()
    try:
        print("\n[1/2] Encrypting User PII fields...")
        encrypt_users(db)
        print("\n[2/2] Encrypting JobApplication PII fields...")
        encrypt_applications(db)
        print("\nMigration complete!")
    except Exception as e:
        db.rollback()
        print(f"\nMigration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
