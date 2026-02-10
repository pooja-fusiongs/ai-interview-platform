"""
Migration script to re-parse existing resumes with the improved parser.
Fixes: empty skills, NULL experience_level, partial parsed_text.

Usage:
    cd backend
    python -m scripts.reparse_resumes              # full run
    python -m scripts.reparse_resumes --dry-run     # preview changes only
    python -m scripts.reparse_resumes --no-ai       # skip Gemini AI calls
"""

import sys
import os
import json
import argparse

# Add parent dir so imports work when run as `python -m scripts.reparse_resumes`
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Load .env BEFORE importing database (which reads DATABASE_URL from env)
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from database import SessionLocal
from models import CandidateResume, Job
import config

# Local uploads directory (fallback when stored path is from a different environment)
LOCAL_UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads", "resumes")


def _resolve_resume_path(stored_path: str) -> str:
    """Resolve resume file path, falling back to local uploads dir."""
    if os.path.exists(stored_path):
        return stored_path
    filename = os.path.basename(stored_path)
    local_path = os.path.normpath(os.path.join(LOCAL_UPLOADS_DIR, filename))
    if os.path.exists(local_path):
        return local_path
    return stored_path  # return original (will fail gracefully)


def main():
    parser = argparse.ArgumentParser(description="Re-parse existing resumes")
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing to DB")
    parser.add_argument("--no-ai", action="store_true", help="Skip Gemini AI calls (rule-based only)")
    args = parser.parse_args()

    # Disable Gemini if --no-ai
    if args.no_ai:
        config.GEMINI_API_KEY = ""

    from services.resume_parser import parse_resume

    print(f"Re-parse resumes {'(DRY RUN)' if args.dry_run else ''}")
    print(f"AI: {'disabled' if args.no_ai else 'enabled' if config.GEMINI_API_KEY else 'no API key'}")

    db = SessionLocal()
    try:
        resumes = db.query(CandidateResume).all()
        print(f"\nFound {len(resumes)} resume records\n")

        updated = 0
        skipped = 0
        errors = 0
        batch_size = 50

        for i, resume in enumerate(resumes):
            try:
                # Resolve file path
                file_path = _resolve_resume_path(resume.resume_path)
                if not os.path.exists(file_path):
                    print(f"  [{i+1}] SKIP - file not found: {os.path.basename(resume.resume_path)}")
                    skipped += 1
                    continue

                # Get job skills
                job_skills_list = []
                job = db.query(Job).filter(Job.id == resume.job_id).first()
                if job and job.skills_required:
                    try:
                        job_skills_list = json.loads(job.skills_required) if isinstance(job.skills_required, str) else job.skills_required
                    except Exception:
                        pass

                # Parse resume
                result = parse_resume(
                    file_path,
                    resume.original_filename,
                    job_skills_list,
                    resume.experience_years
                )

                # Report changes
                old_skills = json.loads(resume.skills) if resume.skills else []
                new_skills = result["skills"]
                old_exp = resume.experience_level
                new_exp = result["experience_level"]
                old_text_len = len(resume.parsed_text) if resume.parsed_text else 0
                new_text_len = len(result["parsed_text"]) if result["parsed_text"] else 0

                changes = []
                if set(new_skills) != set(old_skills):
                    changes.append(f"skills: {old_skills} -> {new_skills}")
                if new_exp != old_exp:
                    changes.append(f"exp: {old_exp} -> {new_exp}")
                if abs(new_text_len - old_text_len) > 50:
                    changes.append(f"text: {old_text_len} -> {new_text_len} chars")

                if changes:
                    print(f"  [{i+1}] {resume.original_filename}: {'; '.join(changes)}")

                    if not args.dry_run:
                        resume.parsed_text = result["parsed_text"]
                        resume.skills = json.dumps(new_skills)
                        resume.experience_level = new_exp
                        resume.parsing_status = result["parsing_status"]
                    updated += 1
                else:
                    print(f"  [{i+1}] {resume.original_filename}: no changes")

                # Commit in batches
                if not args.dry_run and (i + 1) % batch_size == 0:
                    db.commit()
                    print(f"  ... committed batch ({i+1}/{len(resumes)})")

            except Exception as e:
                print(f"  [{i+1}] ERROR ({resume.original_filename}): {e}")
                errors += 1

        if not args.dry_run:
            db.commit()

        print(f"\nDone! Updated: {updated}, Skipped: {skipped}, Errors: {errors}")
        if args.dry_run:
            print("(Dry run - no changes written to database)")

    except Exception as e:
        db.rollback()
        print(f"\nFailed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
