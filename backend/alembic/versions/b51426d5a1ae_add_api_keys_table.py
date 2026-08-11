"""add_api_keys_table

Revision ID: b51426d5a1ae
Revises: cfef2344a8c6
Create Date: 2025-12-15 05:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'b51426d5a1ae'
down_revision = 'cfef2344a8c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create api_keys_environment enum
    api_key_environment_enum = postgresql.ENUM('Production', 'Staging', 'Development', name='apikeyenvironment', create_type=False)
    api_key_environment_enum.create(op.get_bind(), checkfirst=True)
    
    # Create api_keys table
    op.create_table('api_keys',
    sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('key', sa.String(length=255), nullable=False),
    sa.Column('environment', api_key_environment_enum, nullable=False),
    sa.Column('rate_limit', sa.Integer(), nullable=True, server_default='100'),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=True, server_default='true'),
    sa.Column('request_count', sa.Integer(), nullable=True, server_default='0'),
    sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('key')
    )
    op.create_index(op.f('ix_api_keys_id'), 'api_keys', ['id'], unique=False)
    op.create_index(op.f('ix_api_keys_key'), 'api_keys', ['key'], unique=True)
    op.create_index(op.f('ix_api_keys_name'), 'api_keys', ['name'], unique=False)
    op.create_index(op.f('ix_api_keys_environment'), 'api_keys', ['environment'], unique=False)
    op.create_index(op.f('ix_api_keys_is_active'), 'api_keys', ['is_active'], unique=False)
    op.create_index(op.f('ix_api_keys_expires_at'), 'api_keys', ['expires_at'], unique=False)
    
    # Add foreign key constraint to query_logs.apikey_id if it doesn't exist
    # Check if the column exists and add foreign key if needed
    op.create_foreign_key(
        'fk_query_logs_apikey_id', 
        'query_logs', 
        'api_keys', 
        ['apikey_id'], 
        ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    # Drop foreign key constraint from query_logs
    op.drop_constraint('fk_query_logs_apikey_id', 'query_logs', type_='foreignkey')
    
    # Drop indexes
    op.drop_index(op.f('ix_api_keys_expires_at'), table_name='api_keys')
    op.drop_index(op.f('ix_api_keys_is_active'), table_name='api_keys')
    op.drop_index(op.f('ix_api_keys_environment'), table_name='api_keys')
    op.drop_index(op.f('ix_api_keys_name'), table_name='api_keys')
    op.drop_index(op.f('ix_api_keys_key'), table_name='api_keys')
    op.drop_index(op.f('ix_api_keys_id'), table_name='api_keys')
    
    # Drop table
    op.drop_table('api_keys')
    
    # Drop enum
    api_key_environment_enum = postgresql.ENUM('Production', 'Staging', 'Development', name='apikeyenvironment')
    api_key_environment_enum.drop(op.get_bind(), checkfirst=True)

