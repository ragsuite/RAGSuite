"""add_two_factor_authentication_to_user

Revision ID: a1b2c3d4e5f6
Revises: fb64ea95c7cd
Create Date: 2026-01-16 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'fb64ea95c7cd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add 2FA fields to users table
    op.add_column('users', sa.Column('totp_secret', sa.String(255), nullable=True, comment='TOTP secret key for 2FA'))
    op.add_column('users', sa.Column('is_2fa_enabled', sa.Boolean(), nullable=False, server_default='false', comment='Whether 2FA is enabled'))
    op.add_column('users', sa.Column('backup_codes', sa.Text(), nullable=True, comment='JSON array of hashed backup codes'))


def downgrade() -> None:
    # Remove 2FA columns
    op.drop_column('users', 'backup_codes')
    op.drop_column('users', 'is_2fa_enabled')
    op.drop_column('users', 'totp_secret')
