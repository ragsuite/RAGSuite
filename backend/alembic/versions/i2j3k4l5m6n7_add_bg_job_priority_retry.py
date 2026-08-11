"""Add priority, job_class, retry_after to background_jobs + finished_at/retry_after indexes

Revision ID: i2j3k4l5m6n7
Revises: h1i2j3k4l5m6
Create Date: 2026-05-27 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "i2j3k4l5m6n7"
down_revision = "h1i2j3k4l5m6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("background_jobs", sa.Column("priority", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("background_jobs", sa.Column("job_class", sa.String(32), nullable=True))
    op.add_column("background_jobs", sa.Column("retry_after", sa.DateTime(timezone=True), nullable=True))

    op.create_index("idx_bg_jobs_finished_at", "background_jobs", ["finished_at"])
    op.create_index("idx_bg_jobs_retry_after", "background_jobs", ["retry_after"])
    op.create_index(
        "idx_bg_jobs_status_priority",
        "background_jobs",
        ["status", "priority", "queued_at"],
    )


def downgrade() -> None:
    op.drop_index("idx_bg_jobs_status_priority", table_name="background_jobs")
    op.drop_index("idx_bg_jobs_retry_after", table_name="background_jobs")
    op.drop_index("idx_bg_jobs_finished_at", table_name="background_jobs")
    op.drop_column("background_jobs", "retry_after")
    op.drop_column("background_jobs", "job_class")
    op.drop_column("background_jobs", "priority")
