"""Add AI Assistant loading_style preference.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-17

Additive only — loading_style on ai_assistant_settings.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns(table)}
    return column in cols


def upgrade() -> None:
    bind = op.get_bind()
    if "ai_assistant_settings" not in inspect(bind).get_table_names():
        return
    if not _has_column("ai_assistant_settings", "loading_style"):
        op.add_column(
            "ai_assistant_settings",
            sa.Column(
                "loading_style",
                sa.String(length=20),
                nullable=True,
                server_default="typing",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "ai_assistant_settings" not in inspect(bind).get_table_names():
        return
    if _has_column("ai_assistant_settings", "loading_style"):
        op.drop_column("ai_assistant_settings", "loading_style")
