from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, QueuePool
import os
import logging
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Always load .env so DATABASE_URL is available regardless of import order
load_dotenv()

# Check for DATABASE_URL environment variable (Render PostgreSQL / Supabase)
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Fix for Render: replace postgres:// with postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    is_supabase = "supabase" in DATABASE_URL or "pooler" in DATABASE_URL
    is_transaction_mode = ":6543/" in DATABASE_URL

    if is_supabase:
        mode = "transaction" if is_transaction_mode else "session"
        print(f"Using Supabase PostgreSQL ({mode} mode pooler)")
    else:
        print("Using PostgreSQL from DATABASE_URL")

    SQLALCHEMY_DATABASE_URL = DATABASE_URL

    # Common connection args for Supabase
    supabase_connect_args = {
        "sslmode": "require",
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
        "options": "-c statement_timeout=60000",
    }

    if is_supabase:
        # QueuePool with connection reuse — 3-5x faster than NullPool
        # pgbouncer handles the actual pooling, SQLAlchemy reuses connections locally
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args=supabase_connect_args,
            poolclass=QueuePool,
            pool_size=3,
            max_overflow=7,
            pool_timeout=20,
            pool_recycle=120,  # Recycle connections every 2 min (pgbouncer compat)
            pool_pre_ping=True,  # Check connection alive before using
            use_native_hstore=False,
        )
        print(f"PostgreSQL connected (QueuePool size=3+7 — fast connection reuse)")
    else:
        # Non-Supabase (Render, etc.)
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args={
                "sslmode": "require",
                "connect_timeout": 10,
                "options": "-c statement_timeout=60000"
            },
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=120,
            pool_reset_on_return="rollback",
        )
        print("PostgreSQL connected (pool_size=5, max_overflow=10)")
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

        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_reset_on_return="rollback",
        )
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

# Auto-reconnect: if SSL drops, invalidate connection so pool replaces it
@event.listens_for(engine, "handle_error")
def handle_db_error(context):
    if context.original_exception and "SSL" in str(context.original_exception):
        logger.warning("SSL connection dropped — invalidating for pool replacement")
        if hasattr(context, 'invalidate_pool_on_disconnect'):
            context.invalidate_pool_on_disconnect = True


def get_db():
    """FastAPI dependency — yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


def get_safe_db():
    """For background threads — returns a session that MUST be manually closed."""
    return SessionLocal()
