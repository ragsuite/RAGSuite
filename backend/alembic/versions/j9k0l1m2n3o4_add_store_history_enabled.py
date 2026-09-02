"""add store_history_enabled to chatbot and search settings

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa

revision = "j9k0l1m2n3o4"
down_revision = "i8j9k0l1m2n3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "store_history_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Whether to persist end-user chat queries and responses in the database",
        ),
    )
    op.add_column(
        "search_settings",
        sa.Column(
            "store_history_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
            comment="Whether to persist end-user search queries and responses in the database",
        ),
    )


def downgrade() -> None:
    op.drop_column("search_settings", "store_history_enabled")
    op.drop_column("chatbot_settings", "store_history_enabled")
