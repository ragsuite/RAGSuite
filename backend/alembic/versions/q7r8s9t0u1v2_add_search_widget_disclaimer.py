"""Add search widget disclaimer white-label fields.

Revision ID: q7r8s9t0u1v2
Revises: o5p6q7r8s9t0
Create Date: 2026-10-02

Additive columns on search_settings for independent Search safety note
(mirrors chatbot widget disclaimer; EE white-label gated).
Idempotent because create_all at app startup may already have added columns.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "q7r8s9t0u1v2"
down_revision = "o5p6q7r8s9t0"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("search_settings", "search_show_disclaimer"):
        op.add_column(
            "search_settings",
            sa.Column(
                "search_show_disclaimer",
                sa.Boolean(),
                nullable=True,
                server_default="true",
                comment="Show AI disclaimer footer in search widget",
            ),
        )
    if not _has_column("search_settings", "search_disclaimer_text"):
        op.add_column(
            "search_settings",
            sa.Column(
                "search_disclaimer_text",
                sa.Text(),
                nullable=True,
                comment="Custom disclaimer footer text (EE white-label; empty = i18n default)",
            ),
        )
    if not _has_column("search_settings", "search_show_disclaimer_link"):
        op.add_column(
            "search_settings",
            sa.Column(
                "search_show_disclaimer_link",
                sa.Boolean(),
                nullable=True,
                server_default="true",
                comment="Show brand link next to search disclaimer footer",
            ),
        )
    if not _has_column("search_settings", "search_disclaimer_link_label"):
        op.add_column(
            "search_settings",
            sa.Column(
                "search_disclaimer_link_label",
                sa.String(length=120),
                nullable=True,
                comment="Search disclaimer brand link label (EE white-label)",
            ),
        )
    if not _has_column("search_settings", "search_disclaimer_link_url"):
        op.add_column(
            "search_settings",
            sa.Column(
                "search_disclaimer_link_url",
                sa.Text(),
                nullable=True,
                comment="Search disclaimer brand link URL (EE white-label)",
            ),
        )


def downgrade() -> None:
    for column in (
        "search_disclaimer_link_url",
        "search_disclaimer_link_label",
        "search_show_disclaimer_link",
        "search_disclaimer_text",
        "search_show_disclaimer",
    ):
        if _has_column("search_settings", column):
            op.drop_column("search_settings", column)
