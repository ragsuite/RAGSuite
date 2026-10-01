"""Add ingest_embedding_target to uploaded_documents.

Revision ID: p6q7r8s9t0u1
Revises: n4o5p6q7r8s9
Create Date: 2026-10-01

Uploaded files, Text and Q&A sources may pin a Model Configuration provider, like
crawl sources. Existing rows stay NULL and keep training into every Search/Chat collection.
Idempotent because ``create_all`` at app startup may already have added the column.
"""

from alembic import op
import sqlalchemy as sa

revision = "p6q7r8s9t0u1"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None

TABLE = "uploaded_documents"
COLUMN = "ingest_embedding_target"


def _has_column() -> bool:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(TABLE):
        return False
    return any(col["name"] == COLUMN for col in inspector.get_columns(TABLE))


def upgrade() -> None:
    if _has_column():
        return
    op.add_column(
        TABLE,
        sa.Column(
            COLUMN,
            sa.String(length=16),
            nullable=True,
            comment="openai|mistral|gemini|ollama provider key — NULL trains into every Search/Chat collection",
        ),
    )


def downgrade() -> None:
    if _has_column():
        op.drop_column(TABLE, COLUMN)
