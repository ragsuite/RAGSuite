"""Nullable keyword/vector blend for chat and search retrieve.

Revision ID: a7c9e1b3d5f7
Revises: f3a4b5c6d7e8
Create Date: 2026-10-21
"""
from alembic import op
import sqlalchemy as sa

revision = "a7c9e1b3d5f7"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def _add(table: str, column: str, col: sa.Column) -> None:
    if not _has_column(table, column):
        op.add_column(table, col)


def upgrade() -> None:
    _add("chatbot_settings", "chat_keyword_blend", sa.Column("chat_keyword_blend", sa.Float(), nullable=True))
    _add("search_settings", "search_keyword_blend", sa.Column("search_keyword_blend", sa.Float(), nullable=True))


def downgrade() -> None:
    for table, column in (
        ("chatbot_settings", "chat_keyword_blend"),
        ("search_settings", "search_keyword_blend"),
    ):
        if _has_column(table, column):
            op.drop_column(table, column)
