"""Add chatbot widget_layout and Layout 2 Home fields.

Revision ID: z8a9b0c1d2e3
Revises: y7z8a9b0c1d2
Create Date: 2026-09-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "z8a9b0c1d2e3"
down_revision = "y7z8a9b0c1d2"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("chatbot_settings", "widget_layout"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_layout",
                sa.String(length=20),
                nullable=True,
                server_default="direct",
                comment="Widget UI layout: direct (Layout 1) or tabbed (Layout 2 Home+Messages)",
            ),
        )
    if not _has_column("chatbot_settings", "home_display_name"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "home_display_name",
                sa.String(length=255),
                nullable=True,
                comment="Layout 2 Home header display name",
            ),
        )
    if not _has_column("chatbot_settings", "home_status_text"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "home_status_text",
                sa.String(length=500),
                nullable=True,
                comment="Layout 2 Home status / online hours text",
            ),
        )
    if not _has_column("chatbot_settings", "home_cta_label"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "home_cta_label",
                sa.String(length=200),
                nullable=True,
                comment="Layout 2 Home CTA card label",
            ),
        )


def downgrade() -> None:
    for column in ("home_cta_label", "home_status_text", "home_display_name", "widget_layout"):
        if _has_column("chatbot_settings", column):
            op.drop_column("chatbot_settings", column)
