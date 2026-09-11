"""Change chatbot FAQ questions limit default to 3 (max 5).

Revision ID: u3v4w5x6y7z8
Revises: t2u3v4w5x6y7
Create Date: 2026-09-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "u3v4w5x6y7z8"
down_revision = "t2u3v4w5x6y7"
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
    if not _has_column("chatbot_settings", "faq_questions_limit"):
        return
    # New rows default to 3; clamp stored limits above the new max of 5.
    op.execute(
        sa.text(
            "UPDATE chatbot_settings SET faq_questions_limit = 5 "
            "WHERE faq_questions_limit IS NOT NULL AND faq_questions_limit > 5"
        )
    )
    op.alter_column(
        "chatbot_settings",
        "faq_questions_limit",
        existing_type=sa.Integer(),
        server_default="3",
        existing_nullable=False,
        comment="Max FAQ questions to show (1-5)",
    )


def downgrade() -> None:
    if not _has_column("chatbot_settings", "faq_questions_limit"):
        return
    op.alter_column(
        "chatbot_settings",
        "faq_questions_limit",
        existing_type=sa.Integer(),
        server_default="4",
        existing_nullable=False,
        comment="Max FAQ questions to show (1-8)",
    )
