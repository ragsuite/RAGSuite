"""fix_chatbot_settings_column_types

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2025-01-20 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd2e3f4a5b6c7'
down_revision = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if table exists
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    tables = inspector.get_table_names()
    
    if 'chatbot_settings' not in tables:
        # Table doesn't exist, skip
        return
    
    # Get current column types
    columns = {col['name']: col for col in inspector.get_columns('chatbot_settings')}
    
    # Alter widget_avatar from VARCHAR(255) to TEXT if it exists and is VARCHAR
    if 'widget_avatar' in columns:
        current_type = str(columns['widget_avatar']['type'])
        if 'VARCHAR' in current_type or 'varchar' in current_type.lower():
            op.alter_column('chatbot_settings', 'widget_avatar',
                          existing_type=sa.String(length=255),
                          type_=sa.Text(),
                          existing_nullable=True)
    
    # Alter widget_chatbot_color from VARCHAR(255) to TEXT if it exists and is VARCHAR
    if 'widget_chatbot_color' in columns:
        current_type = str(columns['widget_chatbot_color']['type'])
        if 'VARCHAR' in current_type or 'varchar' in current_type.lower():
            op.alter_column('chatbot_settings', 'widget_chatbot_color',
                          existing_type=sa.String(length=255),
                          type_=sa.Text(),
                          existing_nullable=True)


def downgrade() -> None:
    # Revert back to VARCHAR(255) - but this might truncate data
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    tables = inspector.get_table_names()
    
    if 'chatbot_settings' not in tables:
        return
    
    columns = {col['name']: col for col in inspector.get_columns('chatbot_settings')}
    
    if 'widget_avatar' in columns:
        op.alter_column('chatbot_settings', 'widget_avatar',
                      existing_type=sa.Text(),
                      type_=sa.String(length=255),
                      existing_nullable=True)
    
    if 'widget_chatbot_color' in columns:
        op.alter_column('chatbot_settings', 'widget_chatbot_color',
                      existing_type=sa.Text(),
                      type_=sa.String(length=255),
                      existing_nullable=True)

