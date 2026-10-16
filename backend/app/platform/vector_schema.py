"""Base pgvector DDL (extension, ``ragvec`` schema, registry + import state).

Dependency-free on purpose: Alembic, the schema safety net and the vector store all
call ``ensure_vector_schema``. Idempotent and serialized by an advisory lock.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection

SCHEMA = "ragvec"
REGISTRY = f"{SCHEMA}.collections"
IMPORT_STATE = f"{SCHEMA}.import_state"
_SCHEMA_LOCK_KEY = 0x52414756  # "RAGV"

_DDL = (
    "CREATE EXTENSION IF NOT EXISTS vector",
    f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}",
    f"""
    CREATE TABLE IF NOT EXISTS {REGISTRY} (
        name        text PRIMARY KEY,
        table_name  text NOT NULL UNIQUE,
        dim         integer,
        metric      text NOT NULL DEFAULT 'cosine',
        index_kind  text,
        created_at  timestamptz NOT NULL DEFAULT now()
    )
    """,
    f"""
    CREATE TABLE IF NOT EXISTS {IMPORT_STATE} (
        collection    text PRIMARY KEY,
        source_count  bigint,
        copied        bigint NOT NULL DEFAULT 0,
        next_offset   bigint NOT NULL DEFAULT 0,
        index_built   boolean NOT NULL DEFAULT false,
        verified      boolean NOT NULL DEFAULT false,
        status        text NOT NULL DEFAULT 'pending',
        detail        text,
        updated_at    timestamptz NOT NULL DEFAULT now()
    )
    """,
)


def ensure_vector_schema(conn: Connection) -> None:
    """Create the extension, schema and registry tables if missing (Postgres only)."""
    if conn.dialect.name != "postgresql":
        return
    conn.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _SCHEMA_LOCK_KEY})
    for ddl in _DDL:
        conn.execute(text(ddl))


def vector_schema_present(conn: Connection) -> bool:
    """True when nothing is missing (read-only catalog check; no DDL, no locks)."""
    if conn.dialect.name != "postgresql":
        return True
    return bool(
        conn.execute(
            text(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') "
                "AND to_regclass(:registry) IS NOT NULL AND to_regclass(:state) IS NOT NULL"
            ),
            {"registry": REGISTRY, "state": IMPORT_STATE},
        ).scalar()
    )
