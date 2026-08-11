"""Add composite indexes for fair job queue, ingest caps, and WAITING crawl sweep

Revision ID: h1i2j3k4l5m6
Revises: add_query_logs_composite_index, add_gmail_project_credentials, create_clickup_tables
Create Date: 2026-05-27

"""
from typing import Sequence, Union

from alembic import op

revision: str = "h1i2j3k4l5m6"
down_revision: Union[str, Sequence[str], None] = (
    "add_query_logs_composite_index",
    "add_gmail_project_credentials",
    "create_clickup_tables",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tenant scan for fair round-robin claim: WHERE status='PENDING' AND user_id=? ORDER BY queued_at
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bg_jobs_status_user_queued
        ON background_jobs (status, user_id, queued_at)
        """
    )

    # Per-project ingest concurrency count: WHERE project_id=? AND job_type='DOCUMENT_INGEST' AND status=?
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bg_jobs_project_ingest
        ON background_jobs (project_id, job_type, status)
        WHERE job_type = 'DOCUMENT_INGEST'
        """
    )

    # System-job (user_id IS NULL) fallback claim: WHERE status='PENDING' AND user_id IS NULL ORDER BY queued_at
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_bg_jobs_status_queued
        ON background_jobs (status, queued_at)
        WHERE user_id IS NULL
        """
    )

    # WAITING crawl sweeper + stale-job cleanup: WHERE status='WAITING'/'PENDING'/'RUNNING' ORDER BY queued_at
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status_queued
        ON crawl_jobs (status, queued_at)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_crawl_jobs_status_queued")
    op.execute("DROP INDEX IF EXISTS idx_bg_jobs_status_queued")
    op.execute("DROP INDEX IF EXISTS idx_bg_jobs_project_ingest")
    op.execute("DROP INDEX IF EXISTS idx_bg_jobs_status_user_queued")
