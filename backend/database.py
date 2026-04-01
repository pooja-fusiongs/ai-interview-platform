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

# ---------------------------------------------------------------------------
# GCP Cloud SQL support (same-region = ~1-3ms latency vs ~250ms cross-cloud)
# Set CLOUD_SQL_CONNECTION_NAME in env to enable Unix-socket connection.
# Example: "my-project:us-central1:my-db-instance"
# ---------------------------------------------------------------------------
CLOUD_SQL_CONNECTION_NAME = os.getenv("CLOUD_SQL_CONNECTION_NAME")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "ai_interview_db")

# Check for DATABASE_URL environment variable (Render PostgreSQL / Supabase)
DATABASE_URL = os.getenv("DATABASE_URL")

if CLOUD_SQL_CONNECTION_NAME:
    # ── GCP Cloud SQL via Unix socket (fastest — no TCP overhead) ──
    # Cloud Run automatically mounts the socket at /cloudsql/<connection-name>
    unix_socket_path = f"/cloudsql/{CLOUD_SQL_CONNECTION_NAME}"
    SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@/{DB_NAME}?host={unix_socket_path}"

    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=15,
        pool_timeout=30,
        pool_recycle=300,
        pool_reset_on_return="rollback",
    )
    print(f"GCP Cloud SQL connected via Unix socket (pool=10+15, ~1-3ms latency)")

elif DATABASE_URL:
    # Fix for Render: replace postgres:// with postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    is_supabase = "supabase" in DATABASE_URL or "pooler" in DATABASE_URL
    is_transaction_mode = ":6543/" in DATABASE_URL
    # Cloud SQL proxy (localhost) or private IP — no SSL needed
    is_local_or_proxy = "127.0.0.1" in DATABASE_URL or "localhost" in DATABASE_URL or "DB_HOST" in os.environ

    if is_supabase:
        mode = "transaction" if is_transaction_mode else "session"
        print(f"Using Supabase PostgreSQL ({mode} mode pooler)")
    else:
        print("Using PostgreSQL from DATABASE_URL")

    SQLALCHEMY_DATABASE_URL = DATABASE_URL

    if is_supabase:
        # Supabase — remote DB with SSL (higher latency)
        supabase_connect_args = {
            "sslmode": "require",
            "connect_timeout": 10,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
            "options": "-c statement_timeout=60000",
        }
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args=supabase_connect_args,
            poolclass=QueuePool,
            pool_size=5,
            max_overflow=10,
            pool_timeout=20,
            pool_recycle=120,
            pool_pre_ping=True,
            use_native_hstore=False,
        )
        print(f"PostgreSQL connected (QueuePool size=5+10)")
    else:
        # Non-Supabase (GCP Cloud SQL via private IP, Render, etc.)
        connect_args = {
            "connect_timeout": 10,
            "options": "-c statement_timeout=60000",
        }
        # Only require SSL for remote connections (not proxy/localhost)
        if not is_local_or_proxy:
            connect_args["sslmode"] = "require"

        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args=connect_args,
            pool_pre_ping=True,
            pool_size=10,
            max_overflow=15,
            pool_timeout=30,
            pool_recycle=300,
            pool_reset_on_return="rollback",
        )
        print(f"PostgreSQL connected (pool_size=10, max_overflow=15)")
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
