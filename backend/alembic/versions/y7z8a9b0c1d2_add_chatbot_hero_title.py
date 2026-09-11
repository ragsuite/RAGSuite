"""Add chatbot hero_title (welcome title under avatar).

Revision ID: y7z8a9b0c1d2
Revises: x6y7z8a9b0c1
Create Date: 2026-09-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "y7z8a9b0c1d2"
down_revision = "x6y7z8a9b0c1"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("chatbot_settings", "hero_title"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "hero_title",
                sa.String(length=255),
                nullable=True,
                comment="Welcome title under avatar in chat hero",
            ),
        )


def downgrade() -> None:
    if _has_column("chatbot_settings", "hero_title"):
        op.drop_column("chatbot_settings", "hero_title")
