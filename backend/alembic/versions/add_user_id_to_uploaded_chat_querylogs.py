"""add_user_id_to_uploaded_chat_querylogs

Revision ID: add_user_id_user_scoping
Revises: b51426d5a1ae
Create Date: 2025-12-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_user_id_user_scoping"
down_revision = "add_overview_features"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # uploaded_documents.user_id
    op.add_column(
        "uploaded_documents",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index(
        "ix_uploaded_documents_user_id",
        "uploaded_documents",
        ["user_id"],
        unique=False,
    )

    # chat_messages.user_id
    op.add_column(
        "chat_messages",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index(
        "ix_chat_messages_user_id",
        "chat_messages",
        ["user_id"],
        unique=False,
    )

    # query_logs.user_id
    op.add_column(
        "query_logs",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index(
        "ix_query_logs_user_id",
        "query_logs",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    # query_logs.user_id
    op.drop_index("ix_query_logs_user_id", table_name="query_logs")
    op.drop_column("query_logs", "user_id")

    # chat_messages.user_id
    op.drop_index("ix_chat_messages_user_id", table_name="chat_messages")
    op.drop_column("chat_messages", "user_id")

    # uploaded_documents.user_id
    op.drop_index("ix_uploaded_documents_user_id", table_name="uploaded_documents")
    op.drop_column("uploaded_documents", "user_id")


