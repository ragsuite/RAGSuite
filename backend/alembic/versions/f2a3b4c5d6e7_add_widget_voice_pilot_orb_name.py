"""Add chatbot Voice Pilot orb display name

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-09-24

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("chatbot_settings", "widget_voice_pilot_orb_name"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_voice_pilot_orb_name",
                sa.String(120),
                nullable=True,
                comment="Chatbot-only display name under Voice Pilot orb",
            ),
        )


def downgrade() -> None:
    if _has_column("chatbot_settings", "widget_voice_pilot_orb_name"):
        op.drop_column("chatbot_settings", "widget_voice_pilot_orb_name")
