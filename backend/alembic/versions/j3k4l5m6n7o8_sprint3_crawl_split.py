"""Sprint 3: no schema changes needed (new job types are string values, not DB columns)

Revision ID: j3k4l5m6n7o8
Revises: i2j3k4l5m6n7
Create Date: 2026-05-27
"""
from alembic import op

revision = "j3k4l5m6n7o8"
down_revision = "i2j3k4l5m6n7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No schema changes — CRAWL_FETCH and CRAWL_INGEST_BATCH are string values
    # stored in the existing job_type VARCHAR(64) column.
    pass


def downgrade() -> None:
    pass
