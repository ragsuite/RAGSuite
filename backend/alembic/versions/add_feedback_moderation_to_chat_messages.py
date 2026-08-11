"""add chat_messages.feedback_moderation JSON for admin moderation state

Revision ID: add_feedback_moderation
Revises: add_chat_exec_snapshot
Create Date: 2026-05-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "add_feedback_moderation"
down_revision: Union[str, None] = "add_chat_exec_snapshot"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column(
            "feedback_moderation",
            sa.JSON(),
            nullable=True,
            comment="Admin moderation: reviewed, notes, flagged, etc.",
        ),
    )
    op.create_index(
        "ix_chat_messages_project_id_message_type",
        "chat_messages",
        ["project_id", "message_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_project_id_message_type", table_name="chat_messages")
    op.drop_column("chat_messages", "feedback_moderation")
