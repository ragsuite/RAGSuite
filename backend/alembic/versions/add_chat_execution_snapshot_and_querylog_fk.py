"""add chat_messages.execution_snapshot and query_logs.chat_message_id

Revision ID: add_chat_exec_snapshot
Revises: add_querylog_provider_model
Create Date: 2026-05-15

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "add_chat_exec_snapshot"
down_revision: Union[str, None] = "add_querylog_provider_model"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chat_messages",
        sa.Column(
            "execution_snapshot",
            sa.JSON(),
            nullable=True,
            comment="Versioned JSON: retrieval_meta, token_usage, runtime params, sources trace",
        ),
    )
    op.add_column(
        "query_logs",
        sa.Column(
            "chat_message_id",
            sa.UUID(),
            nullable=True,
            comment="Assistant ChatMessage.message_id for this query log row",
        ),
    )
    op.create_index(
        op.f("ix_query_logs_chat_message_id"),
        "query_logs",
        ["chat_message_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_query_logs_chat_message_id",
        "query_logs",
        "chat_messages",
        ["chat_message_id"],
        ["message_id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_query_logs_chat_message_id", "query_logs", type_="foreignkey")
    op.drop_index(op.f("ix_query_logs_chat_message_id"), table_name="query_logs")
    op.drop_column("query_logs", "chat_message_id")
    op.drop_column("chat_messages", "execution_snapshot")
