"""Additive JSON split_config on crawl_sources.

Revision ID: c4d5e6f7a8b9
Revises: b8c0d2e4f6a8
Create Date: 2026-10-22
"""
from alembic import op
import sqlalchemy as sa

revision = "c4d5e6f7a8b9"
down_revision = "b8c0d2e4f6a8"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def upgrade() -> None:
    if not _has_column("crawl_sources", "split_config"):
        op.add_column(
            "crawl_sources",
            sa.Column("split_config", sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    if _has_column("crawl_sources", "split_config"):
        op.drop_column("crawl_sources", "split_config")
