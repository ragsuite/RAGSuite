"""
Database configuration for PostgreSQL
"""
import os

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
from sqlalchemy.exc import OperationalError
from fastapi import HTTPException, status
from .settings import settings

# Scale pool per worker so total connections = workers × (pool_size + max_overflow)
# stays within Postgres max_connections (default 100).
# Single process: pool_size=10, max_overflow=20 → max 30 connections.
# 2 workers:      pool_size=5,  max_overflow=10 → max 30 connections total.
# 4 workers:      pool_size=3,  max_overflow=7  → max 40 connections total.
_workers = int(os.environ.get("WEB_CONCURRENCY", 1))
_pool_size = max(2, 10 // _workers)
_max_overflow = max(5, 20 // _workers)

# Create database engine
# connect_timeout: fail fast if PostgreSQL is unreachable (avoids multi-minute TCP hangs).
# pool_timeout: max seconds to wait for a free connection from the pool.
_engine_connect_args: dict = {"connect_timeout": 10, "options": "-c timezone=utc"}
if settings.database_url.startswith("sqlite"):
    _engine_connect_args = {}

engine = create_engine(
    settings.database_url,
    poolclass=QueuePool,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_timeout=30,
    connect_args=_engine_connect_args,
    echo=settings.sql_echo
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models
Base = declarative_base()

def get_db():
    """
    FastAPI dependency to get database session.
    Automatically handles session lifecycle and cleanup.
    """
    db = SessionLocal()
    try:
        yield db
    except OperationalError as e:
        db.rollback()
        error_str = str(e.orig) if hasattr(e, 'orig') else str(e)
        if "Connection refused" in error_str or "could not connect" in error_str.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database service is currently unavailable. Please ensure PostgreSQL is running and try again."
            )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service error. Please try again later."
        )
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

def create_tables():
    """Create all tables in the database"""
    try:
        # Ensure model modules are imported so tables are attached to Base.metadata
        from .. import models  # noqa: F401
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables created successfully")
    except Exception as e:
        # Re-raise to allow caller to handle gracefully (caller will log the error)
        raise e

def drop_tables():
    """Drop all tables (use with caution!)"""
    try:
        Base.metadata.drop_all(bind=engine)
        print("✅ Database tables dropped successfully")
    except Exception as e:
        print(f"❌ Error dropping tables: {e}")
        raise e

def test_connection():
    """Test database connection"""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("✅ Database connection successful")
            return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False