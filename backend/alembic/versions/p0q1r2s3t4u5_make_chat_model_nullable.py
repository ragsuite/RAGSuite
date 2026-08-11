"""Make chat_model nullable on chatbot_settings and llm_configs

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-06-15

"""
from alembic import op
import sqlalchemy as sa

revision = "p0q1r2s3t4u5"
down_revision = "o9p0q1r2s3t4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "chatbot_settings",
        "chat_model",
        existing_type=sa.String(length=100),
        nullable=True,
        existing_comment="Chat model name",
    )
    op.alter_column(
        "llm_configs",
        "chat_model",
        existing_type=sa.String(length=100),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "llm_configs",
        "chat_model",
        existing_type=sa.String(length=100),
        nullable=False,
    )
    op.alter_column(
        "chatbot_settings",
        "chat_model",
        existing_type=sa.String(length=100),
        nullable=False,
        existing_comment="Chat model name",
    )
