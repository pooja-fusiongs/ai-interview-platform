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

# Scoring thresholds
SCORE_SELECT_THRESHOLD = float(os.getenv("SCORE_SELECT_THRESHOLD", "7.5"))
SCORE_NEXT_ROUND_THRESHOLD = float(os.getenv("SCORE_NEXT_ROUND_THRESHOLD", "5.0"))

# Scoring weights for answer dimensions
WEIGHT_RELEVANCE = float(os.getenv("WEIGHT_RELEVANCE", "0.30"))
WEIGHT_COMPLETENESS = float(os.getenv("WEIGHT_COMPLETENESS", "0.25"))
WEIGHT_ACCURACY = float(os.getenv("WEIGHT_ACCURACY", "0.30"))
WEIGHT_CLARITY = float(os.getenv("WEIGHT_CLARITY", "0.15"))

# CORS
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:5173"
).split(",")
