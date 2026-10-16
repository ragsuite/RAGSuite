"""Throwaway-database fixtures for pgvector integration tests.

Set ``PGVECTOR_TEST_DATABASE_URL`` to any database on a Postgres server that ships
pgvector (e.g. ``postgresql://ragsuite:ragsuite@localhost:5436/postgres``). A fresh
database is created for the session and dropped afterwards; nothing else is touched.
"""
from __future__ import annotations

import os
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ENV = "PGVECTOR_TEST_DATABASE_URL"

requires_pgvector = pytest.mark.skipif(
    not os.environ.get(ENV), reason=f"{ENV} not set (pgvector integration tests)"
)


def _reset_vector_store() -> None:
    from app.services.rag.vector_store import engine, schema

    engine.reset_engine()
    schema.forget()
    schema._schema_ready = False


@pytest.fixture(scope="session")
def pgvector_database():
    base = make_url(os.environ[ENV])
    name = f"ragvec_pytest_{uuid.uuid4().hex[:10]}"
    admin = create_engine(base, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    url = base.set(database=name).render_as_string(hide_password=False)

    from app.settings import settings

    previous = settings.vector_database_url
    settings.vector_database_url = url
    _reset_vector_store()
    try:
        yield url
    finally:
        _reset_vector_store()
        settings.vector_database_url = previous
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


@pytest.fixture()
def vector_store(pgvector_database):
    """Clean store per test: every collection and import checkpoint removed."""
    from app.services.rag.vector_store import schema
    from app.services.rag.vector_store.engine import write_tx

    schema.ensure_schema_once()

    def _wipe() -> None:
        with write_tx() as conn:
            for name in schema.list_names(conn):
                schema.drop_collection(conn, name)
            conn.execute(text(f"DELETE FROM {schema.IMPORT_STATE}"))
        schema.forget()

    _wipe()
    yield pgvector_database
    _wipe()
