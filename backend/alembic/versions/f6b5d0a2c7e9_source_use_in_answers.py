"""Per-source "use in answers" switch: crawl_sources.use_in_answers.

Revision ID: f6b5d0a2c7e9
Revises: e5a4c9f1b6d8
Create Date: 2026-10-12

Additive only. A constant default makes this a metadata-only change on Postgres, so every
existing source stays enabled without rewriting the table. Idempotent because the schema
safety net may already have added the column.
"""

from alembic import op
import sqlalchemy as sa

revision = "f6b5d0a2c7e9"
down_revision = "e5a4c9f1b6d8"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    if not _has_column("crawl_sources", "use_in_answers"):
        op.add_column(
            "crawl_sources",
            sa.Column("use_in_answers", sa.Boolean(), nullable=False, server_default=sa.true()),
        )


def downgrade() -> None:
    if _has_column("crawl_sources", "use_in_answers"):
        op.drop_column("crawl_sources", "use_in_answers")
