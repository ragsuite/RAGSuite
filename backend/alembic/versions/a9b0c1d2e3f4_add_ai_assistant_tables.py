"""Add AI Assistant settings, sessions, and messages tables.

Revision ID: a9b0c1d2e3f4
Revises: z8a9b0c1d2e3
Create Date: 2026-09-14

Additive only — does not alter chatbot_settings, search_settings, or chat_messages.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import UUID, JSON


revision = "a9b0c1d2e3f4"
down_revision = "z8a9b0c1d2e3"
branch_labels = None
depends_on = None


def _has_table(name: str) -> bool:
    bind = op.get_bind()
    return name in inspect(bind).get_table_names()


def upgrade() -> None:
    if not _has_table("ai_assistant_settings"):
        op.create_table(
            "ai_assistant_settings",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("model_provider", sa.String(length=50), nullable=False, server_default="openai"),
            sa.Column("chat_model", sa.String(length=100), nullable=True),
            sa.Column("api_key", sa.Text(), nullable=True),
            sa.Column("base_url", sa.String(length=512), nullable=True),
            sa.Column("temperature", sa.String(length=10), nullable=True),
            sa.Column("max_tokens", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.UniqueConstraint("project_id", name="uq_ai_assistant_settings_project"),
        )
        op.create_index("ix_ai_assistant_settings_project_id", "ai_assistant_settings", ["project_id"])

    if not _has_table("ai_assistant_sessions"):
        op.create_table(
            "ai_assistant_sessions",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(length=255), nullable=False, server_default="New chat"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index("ix_ai_assistant_sessions_project_updated", "ai_assistant_sessions", ["project_id", "updated_at"])
        op.create_index("ix_ai_assistant_sessions_user_id", "ai_assistant_sessions", ["user_id"])

    if not _has_table("ai_assistant_messages"):
        op.create_table(
            "ai_assistant_messages",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column(
                "session_id",
                UUID(as_uuid=True),
                sa.ForeignKey("ai_assistant_sessions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("role", sa.String(length=20), nullable=False),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("tool_calls", JSON(), nullable=True),
            sa.Column("tool_call_id", sa.String(length=100), nullable=True),
            sa.Column("tool_name", sa.String(length=100), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index(
            "ix_ai_assistant_messages_session_created",
            "ai_assistant_messages",
            ["session_id", "created_at"],
        )


def downgrade() -> None:
    if _has_table("ai_assistant_messages"):
        op.drop_table("ai_assistant_messages")
    if _has_table("ai_assistant_sessions"):
        op.drop_table("ai_assistant_sessions")
    if _has_table("ai_assistant_settings"):
        op.drop_table("ai_assistant_settings")
