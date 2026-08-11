"""add_api_key_hash_column

Revision ID: 9ef1003b8dc1
Revises: a2b3c4d5e6f7
Create Date: 2026-05-21 13:51:49.013403

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9ef1003b8dc1'
down_revision = 'a2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD COLUMN ... NULL — does not lock the table on PostgreSQL; safe to run live.
    op.add_column(
        'api_keys',
        sa.Column('key_hash', sa.String(64), nullable=True, comment='SHA-256 hash of the API key for secure lookup')
    )
    op.create_index('ix_api_keys_key_hash', 'api_keys', ['key_hash'])


def downgrade() -> None:
    op.drop_index('ix_api_keys_key_hash', table_name='api_keys')
    op.drop_column('api_keys', 'key_hash')
