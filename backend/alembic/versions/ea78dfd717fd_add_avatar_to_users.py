"""add_avatar_to_users

Revision ID: ea78dfd717fd
Revises: 85653b6200ca
Create Date: 2026-01-13 15:21:09.595932

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ea78dfd717fd'
down_revision = '85653b6200ca'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar', sa.Text(), nullable=True, comment='Avatar URL or base64 data URL'))


def downgrade() -> None:
    op.drop_column('users', 'avatar')
