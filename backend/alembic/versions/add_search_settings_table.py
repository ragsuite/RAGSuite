"""add_search_settings_table

Revision ID: add_search_settings
Revises: add_search_response_config
Create Date: 2025-12-29 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = 'add_search_settings'
down_revision = 'add_hidden_from_widget'  # Point to latest migration head
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if table already exists (in case it was created manually or migration partially ran)
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    tables = inspector.get_table_names()
    
    if 'search_settings' in tables:
        # Table already exists - migration was likely partially run or table created manually
        # Just verify indexes exist and return (don't do anything that could fail)
        try:
            existing_indexes = inspector.get_indexes('search_settings')
            index_names = [idx['name'] for idx in existing_indexes] if existing_indexes else []
            
            # Check and create missing indexes only if they don't exist
            if 'ix_search_settings_id' not in index_names:
                op.create_index('ix_search_settings_id', 'search_settings', ['id'], unique=False)
            if 'ix_search_settings_user_id' not in index_names:
                op.create_index('ix_search_settings_user_id', 'search_settings', ['user_id'], unique=False)
            if 'ix_search_settings_project_id' not in index_names:
                op.create_index('ix_search_settings_project_id', 'search_settings', ['project_id'], unique=False)
        except Exception:
            # If anything fails, just return - table exists, that's what matters
            pass
        return  # Exit early - table already exists
    
    # Table doesn't exist - create it
    op.create_table(
        'search_settings',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('project_id', UUID(as_uuid=True), nullable=False),
        sa.Column('search_prompt', sa.Text(), nullable=True, comment="System prompt for search functionality"),
        sa.Column('is_search_active', sa.Boolean(), nullable=False, default=True, comment="Whether search is enabled"),
        sa.Column('search_response_config', postgresql.JSON, nullable=True, comment="Response configuration for search (JSON: {response_type: 'long'|'short'})"),
        sa.Column('citation_formatting', postgresql.JSON, nullable=True, comment="Citation formatting settings for search (JSON)"),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.UniqueConstraint('user_id', 'project_id', name='uq_search_settings_user_project'),
    )
    
    # Create indexes
    op.create_index(op.f('ix_search_settings_id'), 'search_settings', ['id'], unique=False)
    op.create_index(op.f('ix_search_settings_user_id'), 'search_settings', ['user_id'], unique=False)
    op.create_index(op.f('ix_search_settings_project_id'), 'search_settings', ['project_id'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_search_settings_project_id'), table_name='search_settings')
    op.drop_index(op.f('ix_search_settings_user_id'), table_name='search_settings')
    op.drop_index(op.f('ix_search_settings_id'), table_name='search_settings')
    
    # Drop table
    op.drop_table('search_settings')

