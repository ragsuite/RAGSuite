"""add_login_notifications_to_user

Revision ID: fb64ea95c7cd
Revises: 3e953203324d
Create Date: 2026-01-15 12:20:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'fb64ea95c7cd'
down_revision = '3e953203324d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add login_notifications column to users table
    op.add_column('users', sa.Column('login_notifications', sa.Boolean(), nullable=True, server_default='true', comment='Whether to receive login notifications'))


def downgrade() -> None:
    # Remove login_notifications column
    op.drop_column('users', 'login_notifications')
