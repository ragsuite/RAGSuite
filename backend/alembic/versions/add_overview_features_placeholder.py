"""Placeholder for lost add_overview_features migration

Revision ID: add_overview_features
Revises: merge_recreate_analytics_and_apikeys
Create Date: 2025-12-18 00:20:00.000000

This file restores the revision ID referenced in the database so that
Alembic can build a continuous migration graph. It intentionally makes
no schema changes because the original migration is not present here.
"""

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


# revision identifiers, used by Alembic.
revision = "add_overview_features"
down_revision = "merge_recreate_analytics_and_apikeys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No-op: original migration code is not available.
    # The database is assumed to already be at this schema state.
    pass


def downgrade() -> None:
    # No-op: since upgrade did nothing, nothing to undo here.
    pass


