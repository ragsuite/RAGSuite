"""Split legacy crawl sources with ingest_embedding_target=both.

Revision ID: i8j9k0l1m2n3
Revises: h7i8j9k0l1m2
Create Date: 2026-09-01
"""

from alembic import op
from sqlalchemy.orm import Session

revision = "i8j9k0l1m2n3"
down_revision = "h7i8j9k0l1m2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    session = Session(bind=bind)
    try:
        from app.services.crawl_source_embedding import split_all_legacy_both_crawl_sources

        split_all_legacy_both_crawl_sources(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def downgrade() -> None:
    # Data migration is not safely reversible without losing sibling identity.
    pass
