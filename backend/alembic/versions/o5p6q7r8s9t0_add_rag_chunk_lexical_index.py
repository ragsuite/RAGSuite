"""Add rag_chunk_lexical_index (full-text sidecar for keyword retrieval).

Revision ID: o5p6q7r8s9t0
Revises: p6q7r8s9t0u1
Create Date: 2026-10-01

Additive only: a new table rebuilt from Chroma by the lexical index backfill.
No existing table or row is touched. Postgres-only (tsvector + GIN); skipped on
other dialects. Idempotent because ``create_all`` at app startup may already
have created the table.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TSVECTOR

revision = "o5p6q7r8s9t0"
down_revision = "p6q7r8s9t0u1"
branch_labels = None
depends_on = None

TABLE = "rag_chunk_lexical_index"


def _is_postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def _existing_indexes() -> set:
    inspector = sa.inspect(op.get_bind())
    return {ix["name"] for ix in inspector.get_indexes(TABLE)}


def upgrade() -> None:
    if not _is_postgres():
        return
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column("collection_name", sa.String(length=255), primary_key=True),
            sa.Column("chunk_id", sa.String(length=255), primary_key=True),
            sa.Column("project_id", sa.String(length=64), nullable=True),
            sa.Column("document_id", sa.String(length=255), nullable=True),
            sa.Column("source_file", sa.String(length=512), nullable=True),
            sa.Column("tsv", TSVECTOR(), nullable=True),
        )
    existing = _existing_indexes()
    if "ix_rag_chunk_lexical_index_tsv" not in existing:
        op.create_index(
            "ix_rag_chunk_lexical_index_tsv", TABLE, ["tsv"], postgresql_using="gin"
        )
    if "ix_rag_chunk_lexical_index_coll_project" not in existing:
        op.create_index(
            "ix_rag_chunk_lexical_index_coll_project", TABLE, ["collection_name", "project_id"]
        )
    if "ix_rag_chunk_lexical_index_coll_document" not in existing:
        op.create_index(
            "ix_rag_chunk_lexical_index_coll_document", TABLE, ["collection_name", "document_id"]
        )


def downgrade() -> None:
    if not _is_postgres():
        return
    if sa.inspect(op.get_bind()).has_table(TABLE):
        op.drop_table(TABLE)
