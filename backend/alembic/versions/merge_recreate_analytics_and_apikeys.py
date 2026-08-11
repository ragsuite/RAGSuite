"""Merge branch for analytics_days and api_keys

Revision ID: merge_recreate_analytics_and_apikeys
Revises: recreate_analytics_days, b51426d5a1ae
Create Date: 2025-12-18 00:10:00.000000

"""
from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401


# revision identifiers, used by Alembic.
revision = "merge_recreate_analytics_and_apikeys"
down_revision = ("recreate_analytics_days", "b51426d5a1ae")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This is a merge migration; no schema changes needed.
    pass


def downgrade() -> None:
    # To downgrade past this merge, Alembic will branch again to the two parents.
    pass


