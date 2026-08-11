"""Add WAITING to CrawlJobStatus enum.

Revision ID: b9f3e2d1c7a8
Revises: remove_rl_feedback_enabled
Create Date: 2026-05-21
"""

from typing import Sequence, Union

from alembic import op

revision: str = "b9f3e2d1c7a8"
down_revision: Union[str, None] = "remove_rl_feedback_enabled"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE crawljobstatus ADD VALUE IF NOT EXISTS 'WAITING'")


def downgrade() -> None:
    # Postgres does not support removing enum values — downgrade is a no-op.
    pass
