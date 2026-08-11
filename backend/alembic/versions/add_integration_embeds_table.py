"""add integration_embeds table

Revision ID: add_integration_embeds_table
Revises: merge_recreate_analytics_and_apikeys
Create Date: 2025-12-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "add_integration_embeds_table"
down_revision: Union[str, None] = "merge_recreate_analytics_and_apikeys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The integration_embeds table already exists in this database.
    # Make this migration a no-op to avoid DuplicateTable errors.
    pass


def downgrade() -> None:
    op.drop_table("integration_embeds")


