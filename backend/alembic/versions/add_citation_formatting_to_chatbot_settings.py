"""add_citation_formatting_to_chatbot_settings

Revision ID: add_citation_formatting
Revises: add_chat_settings_llm
Create Date: 2025-12-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_citation_formatting'
down_revision = 'add_chat_settings_llm'  # Point to latest migration head
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add citation_formatting JSON column to chatbot_settings table
    op.add_column('chatbot_settings', 
        sa.Column('citation_formatting', postgresql.JSON, nullable=True, 
                  comment='Citation formatting settings for search (JSON)')
    )


def downgrade() -> None:
    # Remove citation_formatting column
    op.drop_column('chatbot_settings', 'citation_formatting')

