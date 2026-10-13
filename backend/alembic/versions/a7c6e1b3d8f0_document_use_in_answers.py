"""Per-source "use in answers" switch for Document / Text / Q&A sources: uploaded_documents.use_in_answers.

Revision ID: a7c6e1b3d8f0
Revises: f6b5d0a2c7e9
Create Date: 2026-10-13

Additive only. A constant default makes this a metadata-only change on Postgres, so every
existing document stays enabled without rewriting the table. Idempotent because the schema
safety net may already have added the column.
"""

from alembic import op
import sqlalchemy as sa

revision = "a7c6e1b3d8f0"
down_revision = "f6b5d0a2c7e9"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    if not _has_column("uploaded_documents", "use_in_answers"):
        op.add_column(
            "uploaded_documents",
            sa.Column("use_in_answers", sa.Boolean(), nullable=False, server_default=sa.true()),
        )


def downgrade() -> None:
    if _has_column("uploaded_documents", "use_in_answers"):
        op.drop_column("uploaded_documents", "use_in_answers")
