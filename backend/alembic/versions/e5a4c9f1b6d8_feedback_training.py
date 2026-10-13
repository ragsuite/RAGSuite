"""Admin feedback training: chat_messages.feedback_at + feedback_training_examples.

Revision ID: e5a4c9f1b6d8
Revises: d4f3b8e0a5c7
Create Date: 2026-10-12

Additive only. ``feedback_at`` stays NULL for feedback given before this revision, which is
what hides the train action on older feedback. Idempotent because ``create_all`` at app
startup and the schema safety net may already have created the table / column.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e5a4c9f1b6d8"
down_revision = "d4f3b8e0a5c7"
branch_labels = None
depends_on = None

TABLE = "feedback_training_examples"


def _has_column(table: str, column: str) -> bool:
    return any(c["name"] == column for c in sa.inspect(op.get_bind()).get_columns(table))


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    if not _has_column("chat_messages", "feedback_at"):
        op.add_column("chat_messages", sa.Column("feedback_at", sa.DateTime(timezone=True), nullable=True))

    if sa.inspect(op.get_bind()).has_table(TABLE):
        return
    op.create_table(
        TABLE,
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chat_messages.message_id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("reward", sa.SmallInteger(), nullable=False),
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("reason_tags", sa.JSON(), nullable=True),
        sa.Column("user_comment", sa.Text(), nullable=True),
        sa.Column("guidance", sa.Text(), nullable=True),
        sa.Column("cited_urls", sa.JSON(), nullable=True),
        sa.Column("answer_profile", sa.JSON(), nullable=True),
        sa.Column("embeddings", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "trained_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("trained_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_feedback_training_project_active", TABLE, ["project_id", "is_active"])


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(TABLE):
        op.drop_table(TABLE)
    if _has_column("chat_messages", "feedback_at"):
        op.drop_column("chat_messages", "feedback_at")
