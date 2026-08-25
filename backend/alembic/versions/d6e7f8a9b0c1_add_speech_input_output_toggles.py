"""Add speech input/output toggles for chat and search widgets

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-08-25

"""
from alembic import op
import sqlalchemy as sa

revision = "d6e7f8a9b0c1"
down_revision = "c5d6e7f8a9b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "widget_show_speech_input",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("true"),
            comment="Show microphone (speech-to-text) control in chatbot",
        ),
    )
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "widget_show_speech_output",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("true"),
            comment="Show speaker (text-to-speech) control in chatbot",
        ),
    )
    op.add_column(
        "search_settings",
        sa.Column(
            "search_show_speech_input",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("true"),
            comment="Show microphone (speech-to-text) control in search",
        ),
    )
    op.add_column(
        "search_settings",
        sa.Column(
            "search_show_speech_output",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("true"),
            comment="Show speaker (text-to-speech) control in search",
        ),
    )


def downgrade() -> None:
    op.drop_column("search_settings", "search_show_speech_output")
    op.drop_column("search_settings", "search_show_speech_input")
    op.drop_column("chatbot_settings", "widget_show_speech_output")
    op.drop_column("chatbot_settings", "widget_show_speech_input")
