"""Add FAQ settings columns to chatbot_settings.

Revision ID: t2u3v4w5x6y7
Revises: s1t2u3v4w5x6
Create Date: 2026-09-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "t2u3v4w5x6y7"
down_revision = "s1t2u3v4w5x6"
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
    if not _has_column("chatbot_settings", "faq_enabled"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "faq_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
                comment="Show FAQ suggested questions in empty chatbot sessions",
            ),
        )
    if not _has_column("chatbot_settings", "faq_questions_limit"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "faq_questions_limit",
                sa.Integer(),
                nullable=False,
                server_default="4",
                comment="Max FAQ questions to show (1-8)",
            ),
        )
    if not _has_column("chatbot_settings", "faq_questions"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "faq_questions",
                sa.JSON(),
                nullable=True,
                comment="FAQ suggested questions JSON array of {id, text, order}",
            ),
        )


def downgrade() -> None:
    if _has_column("chatbot_settings", "faq_questions"):
        op.drop_column("chatbot_settings", "faq_questions")
    if _has_column("chatbot_settings", "faq_questions_limit"):
        op.drop_column("chatbot_settings", "faq_questions_limit")
    if _has_column("chatbot_settings", "faq_enabled"):
        op.drop_column("chatbot_settings", "faq_enabled")
