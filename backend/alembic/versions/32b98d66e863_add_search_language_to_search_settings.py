"""add_search_language_to_search_settings

Revision ID: 32b98d66e863
Revises: e171f29ea088
Create Date: 2026-01-01 15:31:57.326305

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '32b98d66e863'
down_revision = 'e171f29ea088'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add search_language column to search_settings table
    op.add_column('search_settings', sa.Column('search_language', sa.String(10), nullable=True, server_default='en', comment='Language code for search responses (e.g., en, es, fr)'))


def downgrade() -> None:
    # Remove search_language column
    op.drop_column('search_settings', 'search_language')
