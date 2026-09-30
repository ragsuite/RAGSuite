"""Add source_type to crawl_sources (domain | sitemap).

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-09-30

Existing rows become ``domain`` via the server default, so current sources keep
their link-following crawl behaviour.
"""

from alembic import op
import sqlalchemy as sa

revision = "l2m3n4o5p6q7"
down_revision = "k1l2m3n4o5p6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crawl_sources",
        sa.Column(
            "source_type",
            sa.String(16),
            nullable=False,
            server_default=sa.text("'domain'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("crawl_sources", "source_type")
