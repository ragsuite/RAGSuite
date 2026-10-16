"""pgvector vector store: extension, ragvec schema, collection registry, import state.

Revision ID: b9d8c7e6f5a4
Revises: a7c6e1b3d8f0, a8b9c0d1e2f3
Create Date: 2026-10-14

Also merges the two branch heads into one. Additive and idempotent: the schema safety
net and the vector store run the same DDL (fresh databases are stamped, not migrated).
Per-collection tables are created on first write or by the Chroma import.
Postgres-only; skipped on other dialects.
"""

from alembic import op

from app.platform.vector_schema import ensure_vector_schema

revision = "b9d8c7e6f5a4"
down_revision = ("a7c6e1b3d8f0", "a8b9c0d1e2f3")
branch_labels = None
depends_on = None


def upgrade() -> None:
    ensure_vector_schema(op.get_bind())


def downgrade() -> None:
    # Vectors are the only copy after migration: never drop them on downgrade.
    pass
