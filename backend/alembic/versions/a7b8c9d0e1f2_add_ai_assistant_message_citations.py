"""Add citations JSON on AI Assistant messages.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-09-17

Additive only — citations on ai_assistant_messages for Sources persistence.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "a7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns(table)}
    return column in cols


def upgrade() -> None:
    bind = op.get_bind()
    if "ai_assistant_messages" not in inspect(bind).get_table_names():
        return
    if not _has_column("ai_assistant_messages", "citations"):
        op.add_column(
            "ai_assistant_messages",
            sa.Column("citations", sa.JSON(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "ai_assistant_messages" not in inspect(bind).get_table_names():
        return
    if _has_column("ai_assistant_messages", "citations"):
        op.drop_column("ai_assistant_messages", "citations")
