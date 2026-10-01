"""Add chat_session_meta for transcript email recipients per session.

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-10-01

Optional on servers that cannot run Alembic: app startup ``create_tables()``
and runtime ``ensure_chat_session_meta_table()`` create this table with
``checkfirst``. This migration is idempotent if the table already exists.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

revision = "n4o5p6q7r8s9"
down_revision = "m3n4o5p6q7r8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("chat_session_meta"):
        return
    op.create_table(
        "chat_session_meta",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("session_id", sa.String(255), nullable=False, index=True),
        sa.Column(
            "message_type",
            sa.String(50),
            nullable=False,
            server_default="chat",
        ),
        sa.Column(
            "transcript_emails",
            sa.JSON(),
            nullable=False,
            server_default="[]",
            comment="Lowercase transcript recipient emails (append-only, deduped)",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "project_id",
            "session_id",
            "message_type",
            name="uq_chat_session_meta_project_session_type",
        ),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("chat_session_meta"):
        op.drop_table("chat_session_meta")
