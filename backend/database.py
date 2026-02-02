from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# PostgreSQL Database Configuration (with SQLite fallback)
POSTGRES_USER = "postgres"
POSTGRES_PASSWORD = "postgres"
POSTGRES_HOST = "localhost"
POSTGRES_PORT = "5432"
POSTGRES_DB = "ai_interview_db"

# Try PostgreSQL first, fallback to SQLite
try:
    # PostgreSQL Database URL
    SQLALCHEMY_DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    print(f"🔗 Attempting PostgreSQL connection: {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}")
    
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    # Test connection
    engine.connect()
    print("✅ PostgreSQL connected successfully")
    
except Exception as e:
    print(f"⚠️ PostgreSQL connection failed: {e}")
    print("🔄 Falling back to SQLite database")
    
    # SQLite fallback
    SQLALCHEMY_DATABASE_URL = "sqlite:///./ai_interview.db"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args={"check_same_thread": False}  # Only needed for SQLite
    )
    print("✅ SQLite database initialized")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()