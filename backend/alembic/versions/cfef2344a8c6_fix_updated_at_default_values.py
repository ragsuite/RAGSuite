"""fix_updated_at_default_values

Revision ID: cfef2344a8c6
Revises: eea47e3ef963
Create Date: 2025-12-01 12:28:28.483663

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cfef2344a8c6'
down_revision = 'eea47e3ef963'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update existing NULL values in users table
    op.execute("UPDATE users SET updated_at = created_at WHERE updated_at IS NULL")
    
    # Add server_default to users.updated_at
    op.alter_column('users', 'updated_at',
                    existing_type=sa.DateTime(timezone=True),
                    server_default=sa.func.now(),
                    nullable=False)
    
    # Update existing NULL values in crawl_sources table
    op.execute("UPDATE crawl_sources SET updated_at = created_at WHERE updated_at IS NULL")
    
    # Add server_default to crawl_sources.updated_at
    op.alter_column('crawl_sources', 'updated_at',
                    existing_type=sa.DateTime(timezone=True),
                    server_default=sa.func.now(),
                    nullable=False)


def downgrade() -> None:
    # Remove server_default from crawl_sources.updated_at
    op.alter_column('crawl_sources', 'updated_at',
                    existing_type=sa.DateTime(timezone=True),
                    server_default=None,
                    nullable=True)
    
    # Remove server_default from users.updated_at
    op.alter_column('users', 'updated_at',
                    existing_type=sa.DateTime(timezone=True),
                    server_default=None,
                    nullable=True)
