"""
Centralized configuration with environment variable support.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# JWT / Auth
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# Database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./ai_interview.db")

# OpenAI (optional, for live question generation)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# Google Gemini (for LLM question generation and transcript scoring)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Groq API (Alternative to Gemini for transcript scoring - FREE, FAST, NO QUOTA LIMITS)
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Question generation mode: "live" (use LLM APIs) or "preview" (rule-based/mock)
QUESTION_GENERATION_MODE = os.getenv("QUESTION_GENERATION_MODE", "live")

# Scoring thresholds (out of 100)
SCORE_SELECT_THRESHOLD = float(os.getenv("SCORE_SELECT_THRESHOLD", "75"))
SCORE_NEXT_ROUND_THRESHOLD = float(os.getenv("SCORE_NEXT_ROUND_THRESHOLD", "50"))

# Scoring weights for answer dimensions
WEIGHT_RELEVANCE = float(os.getenv("WEIGHT_RELEVANCE", "0.30"))
WEIGHT_COMPLETENESS = float(os.getenv("WEIGHT_COMPLETENESS", "0.25"))
WEIGHT_ACCURACY = float(os.getenv("WEIGHT_ACCURACY", "0.30"))
WEIGHT_CLARITY = float(os.getenv("WEIGHT_CLARITY", "0.15"))

# GDPR / Encryption
PII_ENCRYPTION_KEY = os.getenv("PII_ENCRYPTION_KEY", "")
DATA_RETENTION_DEFAULT_DAYS = int(os.getenv("DATA_RETENTION_DEFAULT_DAYS", "365"))
DATA_EXPORT_EXPIRY_HOURS = int(os.getenv("DATA_EXPORT_EXPIRY_HOURS", "48"))

# Zoom Integration
ZOOM_ACCOUNT_ID = os.getenv("ZOOM_ACCOUNT_ID", "")
ZOOM_CLIENT_ID = os.getenv("ZOOM_CLIENT_ID", "")
ZOOM_CLIENT_SECRET = os.getenv("ZOOM_CLIENT_SECRET", "")
ZOOM_SDK_KEY = os.getenv("ZOOM_SDK_KEY", "")
ZOOM_SDK_SECRET = os.getenv("ZOOM_SDK_SECRET", "")

# CORS
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:5173"
).split(",")
