from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
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

    if is_supabase and is_transaction_mode:
        # TRANSACTION MODE (port 6543) — Supabase pgbouncer handles pooling
        # Use NullPool: SQLAlchemy does NOT pool, each request gets fresh connection
        # keepalives prevent SSL drops on Cloud Run <-> Supabase (cross-region)
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args={
                "sslmode": "require",
                "connect_timeout": 10,
                "keepalives": 1,
                "keepalives_idle": 30,
                "keepalives_interval": 10,
                "keepalives_count": 5,
                "options": "-c statement_timeout=60000 -c plan_cache_mode=force_custom_plan",
            },
            poolclass=NullPool,
            use_native_hstore=False,
        )
        print("PostgreSQL connected (NullPool + keepalives — Supabase pgbouncer)")
    elif is_supabase:
        # SESSION MODE (port 5432) — use NullPool to prevent MaxClients error
        # Each request opens fresh connection, uses it, closes immediately
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args={
                "sslmode": "require",
                "connect_timeout": 30,
                "options": "-c statement_timeout=60000 -c tcp_keepalives_idle=60"
            },
            poolclass=NullPool,
            pool_pre_ping=True,  
        )
        print("PostgreSQL connected (NullPool — no connection hoarding)")
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

# Auto-reconnect: if SSL drops, invalidate and get fresh connection
@event.listens_for(engine, "handle_error")
def handle_db_error(context):
    if context.original_exception and "SSL" in str(context.original_exception):
        logger.warning("SSL connection dropped — will retry with fresh connection")


def get_db():
    """FastAPI dependency — yields a DB session. Retries once on SSL drop."""
    from sqlalchemy import text
    db = SessionLocal()
    try:
        # Ping to check connection is alive
        db.execute(text("SELECT 1"))
    except Exception:
        # SSL dropped — close dead session, create fresh one
        db.close()
        db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_safe_db():
    """For background threads — returns a session that MUST be manually closed."""
    return SessionLocal()
