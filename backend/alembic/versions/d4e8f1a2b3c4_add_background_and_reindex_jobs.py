"""add background_jobs and reindex_jobs tables

Revision ID: d4e8f1a2b3c4
Revises: f7e8d9c0b1a2
Create Date: 2026-05-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d4e8f1a2b3c4"
down_revision: Union[str, None] = "b7e8f9a0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "background_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="PENDING"),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("idempotency_key", sa.String(255), nullable=True, unique=True),
        sa.Column("payload", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column(
            "queued_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_background_jobs_job_type", "background_jobs", ["job_type"])
    op.create_index("ix_background_jobs_status", "background_jobs", ["status"])
    op.create_index("ix_background_jobs_queued_at", "background_jobs", ["queued_at"])

    op.create_table(
        "reindex_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="running"),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("embedded", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("collection_name", sa.String(512), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("project_id", "source", name="uq_reindex_jobs_project_source"),
    )
    op.create_index("ix_reindex_jobs_project_id", "reindex_jobs", ["project_id"])
    op.create_index("ix_reindex_jobs_status", "reindex_jobs", ["status"])


def downgrade() -> None:
    op.drop_table("reindex_jobs")
    op.drop_table("background_jobs")
