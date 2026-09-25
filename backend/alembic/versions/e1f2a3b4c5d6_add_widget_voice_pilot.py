"""Add widget Voice Pilot enable + provider columns

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-09-24

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "e1f2a3b4c5d6"
down_revision = "d0e1f2a3b4c5"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("chatbot_settings", "widget_voice_pilot_enabled"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_voice_pilot_enabled",
                sa.Boolean(),
                nullable=True,
                server_default="false",
                comment="Show Voice Pilot tab in Layout-2 chatbot (EE)",
            ),
        )
    if not _has_column("chatbot_settings", "widget_voice_pilot_provider"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_voice_pilot_provider",
                sa.String(32),
                nullable=True,
                server_default="elevenlabs",
                comment="Voice Pilot widget provider: elevenlabs | custom",
            ),
        )


def downgrade() -> None:
    if _has_column("chatbot_settings", "widget_voice_pilot_provider"):
        op.drop_column("chatbot_settings", "widget_voice_pilot_provider")
    if _has_column("chatbot_settings", "widget_voice_pilot_enabled"):
        op.drop_column("chatbot_settings", "widget_voice_pilot_enabled")
