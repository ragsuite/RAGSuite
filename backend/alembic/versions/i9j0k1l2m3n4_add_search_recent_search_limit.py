"""Add search_settings.search_recent_search_limit and merge heads.

Revision ID: i9j0k1l2m3n4
Revises: f2a3b4c5d6e7, h8i9j0k1l2m3
Create Date: 2026-09-28

Also merges the Voice Pilot orb-name and MCP/citations heads back into a single head.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "i9j0k1l2m3n4"
down_revision = ("f2a3b4c5d6e7", "h8i9j0k1l2m3")
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("search_settings", "search_recent_search_limit"):
        op.add_column(
            "search_settings",
            sa.Column(
                "search_recent_search_limit",
                sa.Integer(),
                nullable=True,
                server_default=sa.text("5"),
                comment="Number of recent searches to show (1-5)",
            ),
        )


def downgrade() -> None:
    if _has_column("search_settings", "search_recent_search_limit"):
        op.drop_column("search_settings", "search_recent_search_limit")
