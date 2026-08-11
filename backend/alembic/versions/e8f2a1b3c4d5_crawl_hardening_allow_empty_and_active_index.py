"""Crawl hardening: allow_empty_crawl + one active job per source index

Revision ID: e8f2a1b3c4d5
Revises: d4e8f1a2b3c4
Create Date: 2026-05-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8f2a1b3c4d5"
down_revision: Union[str, None] = "d4e8f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "crawl_sources",
        sa.Column(
            "allow_empty_crawl",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crawl_jobs_one_active_per_source
        ON crawl_jobs (source_id)
        WHERE status IN ('PENDING', 'RUNNING', 'INDEXING')
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_crawl_jobs_one_active_per_source")
    op.drop_column("crawl_sources", "allow_empty_crawl")
