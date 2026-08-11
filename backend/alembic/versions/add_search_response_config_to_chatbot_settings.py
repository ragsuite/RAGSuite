"""add_search_response_config_to_chatbot_settings

Revision ID: add_search_response_config
Revises: add_citation_formatting
Create Date: 2025-12-26 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_search_response_config'
down_revision = 'add_citation_formatting'  # Point to latest migration head
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add search_response_config JSON column to chatbot_settings table
    op.add_column('chatbot_settings', 
        sa.Column('search_response_config', postgresql.JSON, nullable=True, 
                  comment="Response configuration for search (JSON: {response_type: 'long'|'short'})")
    )


def downgrade() -> None:
    # Remove search_response_config column
    op.drop_column('chatbot_settings', 'search_response_config')

