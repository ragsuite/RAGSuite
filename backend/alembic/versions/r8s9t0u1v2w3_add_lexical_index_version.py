"""Add rag_chunk_lexical_index.index_version (keyword index lexeme version).

Revision ID: r8s9t0u1v2w3
Revises: a7c3e9f1b2d4
Create Date: 2026-10-02

Additive only: a nullable column, so existing rows stay valid (NULL = written before
versioning). The daily lexical backfill re-indexes rows below the current version from
Chroma text; Chroma vectors are never touched. Postgres-only like the table itself.
Idempotent because ``create_all`` on a fresh database may already have the column.
"""

from alembic import op
import sqlalchemy as sa

revision = "r8s9t0u1v2w3"
down_revision = "a7c3e9f1b2d4"
branch_labels = None
depends_on = None

TABLE = "rag_chunk_lexical_index"
COLUMN = "index_version"


def _has_column(inspector) -> bool:
    return COLUMN in {col["name"] for col in inspector.get_columns(TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE) or _has_column(inspector):
        return
    op.add_column(TABLE, sa.Column(COLUMN, sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    inspector = sa.inspect(bind)
    if inspector.has_table(TABLE) and _has_column(inspector):
        op.drop_column(TABLE, COLUMN)
