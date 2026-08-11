"""Add gmail_staged_messages for inbox-before-index flow.

Revision ID: c8f3a1b2d4e5
Revises: ab12cd34ef56
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c8f3a1b2d4e5"
down_revision = "ab12cd34ef56"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gmail_staged_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "integration_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("gmail_integrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("gmail_message_id", sa.String(255), nullable=False),
        sa.Column("thread_id", sa.String(255), nullable=False, server_default=""),
        sa.Column("subject", sa.Text(), nullable=False, server_default=""),
        sa.Column("sender", sa.String(1024), nullable=False, server_default=""),
        sa.Column("date_raw", sa.String(512), nullable=False, server_default=""),
        sa.Column("body_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("staged_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_gmail_staged_messages_id", "gmail_staged_messages", ["id"])
    op.create_index("ix_gmail_staged_messages_integration_id", "gmail_staged_messages", ["integration_id"])
    op.create_unique_constraint(
        "uq_gmail_staged_integration_message",
        "gmail_staged_messages",
        ["integration_id", "gmail_message_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_gmail_staged_integration_message", "gmail_staged_messages", type_="unique")
    op.drop_index("ix_gmail_staged_messages_integration_id", "gmail_staged_messages")
    op.drop_index("ix_gmail_staged_messages_id", "gmail_staged_messages")
    op.drop_table("gmail_staged_messages")
