"""Add privacy notice columns to chatbot_settings.

Revision ID: w5x6y7z8a9b0
Revises: v4w5x6y7z8a9
Create Date: 2026-09-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "w5x6y7z8a9b0"
down_revision = "v4w5x6y7z8a9"
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
    if not _has_column("chatbot_settings", "privacy_notice_enabled"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "privacy_notice_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
                comment="Show privacy-policy consent notice for first-time chatbot users",
            ),
        )
    if not _has_column("chatbot_settings", "privacy_notice"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "privacy_notice",
                sa.JSON(),
                nullable=True,
                comment="Privacy notice JSON: content, url, linkPhrases, underlineLinks, version",
            ),
        )


def downgrade() -> None:
    if _has_column("chatbot_settings", "privacy_notice"):
        op.drop_column("chatbot_settings", "privacy_notice")
    if _has_column("chatbot_settings", "privacy_notice_enabled"):
        op.drop_column("chatbot_settings", "privacy_notice_enabled")
