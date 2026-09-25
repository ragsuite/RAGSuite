"""Add voice_pilot_settings for AI Voice Pilot (EE)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-09-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "voice_pilot_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("elevenlabs_api_key", sa.Text(), nullable=True, comment="ElevenLabs API key (encrypted)"),
        sa.Column("selected_voice_id", sa.String(length=128), nullable=True),
        sa.Column("selected_voice_name", sa.String(length=255), nullable=True),
        sa.Column("stt_locale", sa.String(length=32), nullable=False, server_default="en-US"),
        sa.Column("auto_listen_after_reply", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("project_id", name="uq_voice_pilot_settings_project"),
    )
    op.create_index("ix_voice_pilot_settings_id", "voice_pilot_settings", ["id"])
    op.create_index("ix_voice_pilot_settings_project_id", "voice_pilot_settings", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_voice_pilot_settings_project_id", table_name="voice_pilot_settings")
    op.drop_index("ix_voice_pilot_settings_id", table_name="voice_pilot_settings")
    op.drop_table("voice_pilot_settings")
