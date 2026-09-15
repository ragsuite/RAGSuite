"""Add language column to ai_assistant_settings.

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-09-15

Additive only — reply language for AI Assistant (chatbot-aligned codes).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "b0c1d2e3f4a5"
down_revision = "a9b0c1d2e3f4"
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
    if _has_column("ai_assistant_settings", "language"):
        return
    op.add_column(
        "ai_assistant_settings",
        sa.Column("language", sa.String(length=10), nullable=True, server_default="en"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if "ai_assistant_settings" not in inspect(bind).get_table_names():
        return
    if not _has_column("ai_assistant_settings", "language"):
        return
    op.drop_column("ai_assistant_settings", "language")
