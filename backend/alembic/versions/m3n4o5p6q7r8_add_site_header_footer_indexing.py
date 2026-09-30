"""Add index_site_header / index_site_footer to crawl_sources.

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-09-30

Sources that kept header/footer text in every page (``skip_header_footer = false``)
opt in to both, so that text is still trained — now once per unique block.
"""

from alembic import op
import sqlalchemy as sa

revision = "m3n4o5p6q7r8"
down_revision = "l2m3n4o5p6q7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for column in ("index_site_header", "index_site_footer"):
        op.add_column(
            "crawl_sources",
            sa.Column(column, sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    op.execute(
        sa.text(
            "UPDATE crawl_sources SET index_site_header = true, index_site_footer = true "
            "WHERE skip_header_footer = false"
        )
    )


def downgrade() -> None:
    op.drop_column("crawl_sources", "index_site_footer")
    op.drop_column("crawl_sources", "index_site_header")
