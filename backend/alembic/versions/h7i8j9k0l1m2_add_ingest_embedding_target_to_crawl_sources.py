"""Add ingest_embedding_target to crawl_sources.

Revision ID: h7i8j9k0l1m2
Revises: g1h2i3j4k5l6
Create Date: 2026-09-01
"""

from alembic import op
import sqlalchemy as sa

revision = "h7i8j9k0l1m2"
down_revision = "g1h2i3j4k5l6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("crawl_sources")}
    if "ingest_embedding_target" not in cols:
        op.add_column(
            "crawl_sources",
            sa.Column(
                "ingest_embedding_target",
                sa.String(length=16),
                nullable=True,
                comment="search|chat|both — NULL keeps legacy EMBEDDING_PREFERRED_SOURCE ingest",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("crawl_sources")}
    if "ingest_embedding_target" in cols:
        op.drop_column("crawl_sources", "ingest_embedding_target")
