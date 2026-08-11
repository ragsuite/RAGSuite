"""add_last_activity_to_users

Revision ID: 778d9ced9f4d
Revises: 32b98d66e863
Create Date: 2026-01-02 12:04:48.742100

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '778d9ced9f4d'
down_revision = '32b98d66e863'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add last_activity column to users table
    op.add_column('users', 
        sa.Column('last_activity', 
                  sa.DateTime(timezone=True), 
                  nullable=True,
                  comment="Last activity timestamp for inactivity-based logout")
    )
    
    # Create index for better query performance
    op.create_index('ix_users_last_activity', 'users', ['last_activity'], unique=False)
    
    # Optionally: Set last_activity = last_login for existing users who have last_login set
    op.execute("UPDATE users SET last_activity = last_login WHERE last_login IS NOT NULL AND last_activity IS NULL")


def downgrade() -> None:
    # Drop index
    op.drop_index('ix_users_last_activity', table_name='users')
    
    # Drop column
    op.drop_column('users', 'last_activity')
