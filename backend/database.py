from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Check for DATABASE_URL environment variable (Render PostgreSQL)
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Fix for Render: replace postgres:// with postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    print("Using PostgreSQL from DATABASE_URL")
    SQLALCHEMY_DATABASE_URL = DATABASE_URL
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    print("PostgreSQL connected successfully")
else:
    # Local development: try local PostgreSQL, fallback to SQLite
    POSTGRES_USER = "postgres"
    POSTGRES_PASSWORD = "postgres"
    POSTGRES_HOST = "localhost"
    POSTGRES_PORT = "5432"
    POSTGRES_DB = "ai_interview_db"

    try:
        SQLALCHEMY_DATABASE_URL = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
        print(f"Attempting PostgreSQL connection: {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}")

        engine = create_engine(SQLALCHEMY_DATABASE_URL)
        engine.connect()
        print("PostgreSQL connected successfully")

    except Exception as e:
        print(f"PostgreSQL connection failed: {e}")
        print("Falling back to SQLite database")

        SQLALCHEMY_DATABASE_URL = "sqlite:///./ai_interview.db"
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args={"check_same_thread": False}
        )
        print("SQLite database initialized")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()