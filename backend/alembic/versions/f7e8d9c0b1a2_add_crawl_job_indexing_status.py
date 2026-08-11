"""Add INDEXING to crawl job status enum.

Revision ID: f7e8d9c0b1a2
Revises: add_feedback_moderation
Create Date: 2026-05-15
"""

from typing import Sequence, Union

from alembic import op

revision: str = "f7e8d9c0b1a2"
down_revision: Union[str, None] = "add_feedback_moderation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE crawljobstatus ADD VALUE IF NOT EXISTS 'INDEXING'")


def downgrade() -> None:
    pass
