"""Add voice_provider and provider_voice_state to voice_pilot_settings

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-09-23

"""
from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "d0e1f2a3b4c5"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "voice_pilot_settings",
        sa.Column(
            "voice_provider",
            sa.String(32),
            nullable=False,
            server_default="elevenlabs",
            comment="Active TTS provider: elevenlabs | custom",
        ),
    )
    op.add_column(
        "voice_pilot_settings",
        sa.Column(
            "provider_voice_state",
            sa.JSON(),
            nullable=True,
            comment="Per-provider selected voice + configs: {elevenlabs: {...}, custom: {...}}",
        ),
    )
    conn = op.get_bind()
    rows = conn.execute(
        text(
            "SELECT id, selected_voice_id, selected_voice_name, voice_configurations "
            "FROM voice_pilot_settings"
        )
    ).fetchall()
    for row in rows:
        rid, sel_id, sel_name, configs = row[0], row[1], row[2], row[3]
        state = {
            "elevenlabs": {
                "selected_voice_id": sel_id,
                "selected_voice_name": sel_name,
                "voice_configurations": configs if isinstance(configs, dict) else {},
            },
            "custom": {
                "selected_voice_id": None,
                "selected_voice_name": None,
                "voice_configurations": {},
            },
        }
        conn.execute(
            text(
                "UPDATE voice_pilot_settings SET provider_voice_state = CAST(:state AS json) "
                "WHERE id = CAST(:id AS uuid)"
            ),
            {"state": json.dumps(state), "id": str(rid)},
        )


def downgrade() -> None:
    op.drop_column("voice_pilot_settings", "provider_voice_state")
    op.drop_column("voice_pilot_settings", "voice_provider")
