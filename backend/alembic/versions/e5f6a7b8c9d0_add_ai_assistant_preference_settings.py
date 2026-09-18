"""Add AI Assistant preference columns (Sources-aware settings).

Revision ID: e5f6a7b8c9d0
Revises: d3e4f5a6b7c8
Create Date: 2026-09-17

Additive only — default_mode, answer_length, show_citations, tool_scope, ops_lookback_days.
Chains after widget logo shape (d3e4f5a6b7c8) to avoid revision ID collision.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "e5f6a7b8c9d0"
down_revision = "d3e4f5a6b7c8"
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
    if not _has_column("ai_assistant_settings", "default_mode"):
        op.add_column(
            "ai_assistant_settings",
            sa.Column("default_mode", sa.String(length=20), nullable=True, server_default="ops"),
        )
    if not _has_column("ai_assistant_settings", "answer_length"):
        op.add_column(
            "ai_assistant_settings",
            sa.Column(
                "answer_length",
                sa.String(length=20),
                nullable=True,
                server_default="balanced",
            ),
        )
    if not _has_column("ai_assistant_settings", "show_citations"):
        op.add_column(
            "ai_assistant_settings",
            sa.Column(
                "show_citations",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )
    if not _has_column("ai_assistant_settings", "tool_scope"):
        op.add_column(
            "ai_assistant_settings",
            sa.Column("tool_scope", sa.JSON(), nullable=True),
        )
    if not _has_column("ai_assistant_settings", "ops_lookback_days"):
        op.add_column(
            "ai_assistant_settings",
            sa.Column("ops_lookback_days", sa.Integer(), nullable=True, server_default="7"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "ai_assistant_settings" not in inspect(bind).get_table_names():
        return
    for col in (
        "ops_lookback_days",
        "tool_scope",
        "show_citations",
        "answer_length",
        "default_mode",
    ):
        if _has_column("ai_assistant_settings", col):
            op.drop_column("ai_assistant_settings", col)
