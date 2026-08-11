"""Add rescope_root_links to crawl_sources.

Revision ID: q1r2s3t4u5v6
Revises: p0q1r2s3t4u5
Create Date: 2026-06-18
"""

from alembic import op
import sqlalchemy as sa

revision = "q1r2s3t4u5v6"
down_revision = "p0q1r2s3t4u5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crawl_sources",
        sa.Column(
            "rescope_root_links",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column(
        "crawl_sources",
        "rescope_root_links",
        server_default=sa.text("false"),
    )


def downgrade() -> None:
    op.drop_column("crawl_sources", "rescope_root_links")
