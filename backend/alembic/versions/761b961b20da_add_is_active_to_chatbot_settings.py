"""add_is_active_to_chatbot_settings

Revision ID: 761b961b20da
Revises: add_failed_crawl_urls_table
Create Date: 2025-12-25 12:18:19.161305

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '761b961b20da'
down_revision = 'add_failed_crawl_urls_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_active column to chatbot_settings table
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    
    # Check if table exists
    tables = inspector.get_table_names()
    if 'chatbot_settings' not in tables:
        return  # Table doesn't exist, skip
    
    # Check if column already exists
    columns = [col['name'] for col in inspector.get_columns('chatbot_settings')]
    
    if 'is_active' not in columns:
        op.add_column('chatbot_settings', 
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true', comment='Whether chatbot/chat and search are enabled')
        )


def downgrade() -> None:
    # Remove is_active column from chatbot_settings table
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    
    # Check if table exists
    tables = inspector.get_table_names()
    if 'chatbot_settings' not in tables:
        return  # Table doesn't exist, skip
    
    # Check if column exists before dropping
    columns = [col['name'] for col in inspector.get_columns('chatbot_settings')]
    if 'is_active' in columns:
        op.drop_column('chatbot_settings', 'is_active')
