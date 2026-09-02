"""add store_history_enabled to chatbot and search settings

Revision ID: k0l1m2n3o4p5
Revises: j9k0l1m2n3o4
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "k0l1m2n3o4p5"
down_revision = "j9k0l1m2n3o4"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table(table):
        return False
    cols = {c["name"] for c in inspector.get_columns(table)}
    return column in cols


def upgrade() -> None:
    if not _has_column("chatbot_settings", "store_history_enabled"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "store_history_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
                comment="Whether to persist end-user chat queries and responses in the database",
            ),
        )
    if not _has_column("search_settings", "store_history_enabled"):
        op.add_column(
            "search_settings",
            sa.Column(
                "store_history_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
                comment="Whether to persist end-user search queries and responses in the database",
            ),
        )


def downgrade() -> None:
    if _has_column("search_settings", "store_history_enabled"):
        op.drop_column("search_settings", "store_history_enabled")
    if _has_column("chatbot_settings", "store_history_enabled"):
        op.drop_column("chatbot_settings", "store_history_enabled")
