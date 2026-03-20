"""
One-time script: Migrate existing local recordings to Supabase database.
Run: python migrate_recordings_to_db.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(override=True)

# Force Supabase connection
db_url = os.getenv("DATABASE_URL")
if not db_url or "localhost" in db_url:
    print("ERROR: DATABASE_URL not set to Supabase. Check .env file.")
    sys.exit(1)

print(f"Connecting to: {db_url[:50]}...")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

engine = create_engine(
    db_url.replace("postgres://", "postgresql://", 1) if db_url.startswith("postgres://") else db_url,
    connect_args={"sslmode": "require", "connect_timeout": 10},
)

# Ensure recording_data column exists
try:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS recording_data BYTEA"))
    print("✅ recording_data column ready")
except Exception as e:
    print(f"Column check: {e}")

Session = sessionmaker(bind=engine)
db = Session()

from models import VideoInterview

interviews = db.query(VideoInterview).filter(
    VideoInterview.recording_url.isnot(None),
    VideoInterview.recording_data.is_(None)
).all()

print(f"Found {len(interviews)} interviews with recordings to migrate")

migrated = 0
skipped = 0
for vi in interviews:
    file_path = os.path.join(os.path.dirname(__file__), vi.recording_url.lstrip("/"))
    if os.path.exists(file_path):
        size_mb = os.path.getsize(file_path) / (1024 * 1024)
        print(f"  [{migrated+1}] Interview {vi.id}: {os.path.basename(file_path)} ({size_mb:.1f} MB)...", end="", flush=True)
        with open(file_path, "rb") as f:
            vi.recording_data = f.read()
        db.commit()
        print(" ✅")
        migrated += 1
    else:
        print(f"  Skipping interview {vi.id}: file not found locally")
        skipped += 1

print(f"\n✅ Done! Migrated: {migrated}, Skipped: {skipped}, Total: {len(interviews)}")
db.close()
