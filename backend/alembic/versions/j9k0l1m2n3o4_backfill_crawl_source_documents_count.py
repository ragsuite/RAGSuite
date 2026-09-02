"""Backfill crawl_sources.documents_count from documents table.

Revision ID: j9k0l1m2n3o4
Revises: i8j9k0l1m2n3
Create Date: 2026-09-02
"""

from alembic import op
from sqlalchemy.orm import Session

revision = "j9k0l1m2n3o4"
down_revision = "i8j9k0l1m2n3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Safe data repair: recalculate denormalized link counts (UPDATE only).
    op.execute(
        """
        UPDATE crawl_sources cs
        SET documents_count = COALESCE(
            (SELECT COUNT(*) FROM documents d WHERE d.source_id = cs.id),
            0
        )
        """
    )

    # Best-effort diagnostics repair only — never abort schema upgrades if this fails.
    bind = op.get_bind()
    session = Session(bind=bind)
    try:
        from app.models import CrawlJob, CrawlJobStatus
        from app.services.crawl_ingest_helpers import get_crawl_diagnostics

        jobs = (
            session.query(CrawlJob)
            .filter(CrawlJob.status == CrawlJobStatus.COMPLETED)
            .all()
        )
        for job in jobs:
            diagnostics = get_crawl_diagnostics(job.errors)
            if not diagnostics:
                continue
            visited = int(diagnostics.get("crawled_urls_total") or 0)
            current = int(job.pages_fetched or 0)
            if visited > current:
                job.pages_fetched = visited
        session.commit()
    except Exception as exc:
        session.rollback()
        print(
            f"WARNING: crawl diagnostics backfill skipped (non-fatal): {exc}",
            flush=True,
        )
    finally:
        session.close()


def downgrade() -> None:
    # Counts were incorrect before upgrade; no safe revert.
    pass
