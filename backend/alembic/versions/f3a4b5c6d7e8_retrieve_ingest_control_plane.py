"""Retrieve knobs, chunk profile, enhance-index.

Revision ID: f3a4b5c6d7e8
Revises: a0b1c2d3e4f5
Create Date: 2026-10-21
"""
from alembic import op
import sqlalchemy as sa

revision = "f3a4b5c6d7e8"
down_revision = "a0b1c2d3e4f5"
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
    _add("chatbot_settings", "chat_rerank_candidates", sa.Column("chat_rerank_candidates", sa.Integer(), nullable=True))
    _add("chatbot_settings", "chat_threshold_preset", sa.Column("chat_threshold_preset", sa.String(length=16), nullable=True))
    _add("chatbot_settings", "chat_prompt_template", sa.Column("chat_prompt_template", sa.String(length=16), nullable=True))
    _add("search_settings", "search_rerank_candidates", sa.Column("search_rerank_candidates", sa.Integer(), nullable=True))
    _add("search_settings", "search_threshold_preset", sa.Column("search_threshold_preset", sa.String(length=16), nullable=True))
    _add("projects", "chunk_profile", sa.Column("chunk_profile", sa.String(length=32), nullable=True))
    _add("projects", "enhance_index", sa.Column("enhance_index", sa.Boolean(), nullable=True))


def downgrade() -> None:
    for table, column in (
        ("chatbot_settings", "chat_rerank_candidates"),
        ("chatbot_settings", "chat_threshold_preset"),
        ("chatbot_settings", "chat_prompt_template"),
        ("search_settings", "search_rerank_candidates"),
        ("search_settings", "search_threshold_preset"),
        ("projects", "chunk_profile"),
        ("projects", "enhance_index"),
    ):
        if _has_column(table, column):
            op.drop_column(table, column)
