"""Migrate 3 specific recordings to Supabase DB."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv(override=True)

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

db_url = os.getenv("DATABASE_URL")
engine = create_engine(
    db_url.replace("postgres://", "postgresql://", 1) if db_url.startswith("postgres://") else db_url,
    connect_args={"sslmode": "require", "connect_timeout": 10},
)

# Ensure column exists
with engine.begin() as conn:
    conn.execute(text("ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS recording_data BYTEA"))
print("✅ Column ready")

Session = sessionmaker(bind=engine)
db = Session()

files = [
    "interview_nikhil.mp4",
    "interview_ramesh.mp4",
    "interview_shravya.mp4",
]

for fname in files:
    file_path = os.path.join(os.path.dirname(__file__), "uploads", "recordings", fname)
    recording_url = f"/uploads/recordings/{fname}"

    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        continue

    size_mb = os.path.getsize(file_path) / (1024 * 1024)
    print(f"📤 {fname} ({size_mb:.1f} MB)...", end="", flush=True)

    result = db.execute(
        text("UPDATE video_interviews SET recording_data = :data WHERE recording_url = :url"),
        {"data": open(file_path, "rb").read(), "url": recording_url}
    )

    if result.rowcount > 0:
        db.commit()
        print(f" ✅ ({result.rowcount} row updated)")
    else:
        print(f" ⚠️ No interview found with recording_url = {recording_url}")

db.close()
print("\n✅ Done!")
