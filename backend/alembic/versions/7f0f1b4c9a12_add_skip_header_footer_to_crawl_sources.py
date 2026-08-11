"""Add skip_header_footer to crawl_sources.

Revision ID: 7f0f1b4c9a12
Revises: c8f3a1b2d4e5
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa

revision = "7f0f1b4c9a12"
down_revision = "c8f3a1b2d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crawl_sources",
        sa.Column(
            "skip_header_footer",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    # Keep default for new rows at DB-level for consistency.
    op.alter_column("crawl_sources", "skip_header_footer", server_default=sa.text("true"))


def downgrade() -> None:
    op.drop_column("crawl_sources", "skip_header_footer")

