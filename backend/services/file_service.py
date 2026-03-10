"""
File service for handling uploads and text extraction.
Merged from client's iHire codebase.
"""

import os
import uuid
from fastapi import UploadFile

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".doc"}


def validate_file(file: UploadFile) -> bool:
    """Validate file extension."""
    if not file.filename:
        return False
    ext = os.path.splitext(file.filename)[1].lower()
    return ext in ALLOWED_EXTENSIONS


async def save_upload_file(file: UploadFile, subfolder: str) -> str:
    """Save uploaded file and return the relative path."""
    if not file.filename:
        raise ValueError("No filename provided")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type {ext} not allowed. Allowed: {ALLOWED_EXTENSIONS}")

    upload_path = os.path.join(UPLOAD_DIR, subfolder)
    os.makedirs(upload_path, exist_ok=True)

    unique_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(upload_path, unique_filename)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    return file_path


def delete_file(file_path: str) -> bool:
    """Delete a file if it exists."""
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
            return True
    except Exception:
        pass
    return False


def extract_text_from_file(file_path: str) -> str:
    """Extract text content from uploaded files (.txt, .pdf, .docx)."""
    if not file_path or not os.path.exists(file_path):
        return ""

    ext = os.path.splitext(file_path)[1].lower()

    try:
        if ext == ".txt":
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        elif ext == ".pdf":
            from PyPDF2 import PdfReader
            reader = PdfReader(file_path)
            text = ""
            for page in reader.pages:
                text += page.extract_text() or ""
            return text
        elif ext in (".docx", ".doc"):
            from docx import Document
            doc = Document(file_path)
            return "\n".join([p.text for p in doc.paragraphs])
    except Exception as e:
        import logging
        logging.getLogger("ihire").error(f"Error extracting text from {file_path}: {e}")

    return ""
