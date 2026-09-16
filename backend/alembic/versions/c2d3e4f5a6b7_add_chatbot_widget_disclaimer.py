"""Add chatbot widget disclaimer white-label fields.

Revision ID: c2d3e4f5a6b7
Revises: b0c1d2e3f4a5
Create Date: 2026-09-16

Unique revision ID (a1b2c3d4e5f6 is already used by 2FA migration).
Chains after AI assistant language so there is a single Alembic head.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "c2d3e4f5a6b7"
down_revision = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("chatbot_settings", "widget_show_disclaimer"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_show_disclaimer",
                sa.Boolean(),
                nullable=True,
                server_default="true",
                comment="Show AI disclaimer footer in chatbot widget",
            ),
        )
    if not _has_column("chatbot_settings", "widget_disclaimer_text"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_disclaimer_text",
                sa.Text(),
                nullable=True,
                comment="Custom disclaimer footer text (EE white-label; empty = i18n default)",
            ),
        )
    if not _has_column("chatbot_settings", "widget_show_disclaimer_link"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_show_disclaimer_link",
                sa.Boolean(),
                nullable=True,
                server_default="true",
                comment="Show brand link next to disclaimer footer",
            ),
        )
    if not _has_column("chatbot_settings", "widget_disclaimer_link_label"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_disclaimer_link_label",
                sa.String(length=120),
                nullable=True,
                comment="Disclaimer brand link label (EE white-label)",
            ),
        )
    if not _has_column("chatbot_settings", "widget_disclaimer_link_url"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_disclaimer_link_url",
                sa.Text(),
                nullable=True,
                comment="Disclaimer brand link URL (EE white-label)",
            ),
        )


def downgrade() -> None:
    for column in (
        "widget_disclaimer_link_url",
        "widget_disclaimer_link_label",
        "widget_show_disclaimer_link",
        "widget_disclaimer_text",
        "widget_show_disclaimer",
    ):
        if _has_column("chatbot_settings", column):
            op.drop_column("chatbot_settings", column)
