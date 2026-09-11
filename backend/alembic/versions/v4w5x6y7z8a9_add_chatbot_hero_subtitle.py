"""Add chatbot hero_subtitle (tagline under title).

Revision ID: v4w5x6y7z8a9
Revises: u3v4w5x6y7z8
Create Date: 2026-09-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "v4w5x6y7z8a9"
down_revision = "u3v4w5x6y7z8"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("chatbot_settings", "hero_subtitle"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "hero_subtitle",
                sa.String(length=500),
                nullable=True,
                comment="Hero tagline under chatbot title",
            ),
        )


def downgrade() -> None:
    if _has_column("chatbot_settings", "hero_subtitle"):
        op.drop_column("chatbot_settings", "hero_subtitle")
