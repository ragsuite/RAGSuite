"""Recreate analytics_days table with top_sources column

Revision ID: recreate_analytics_days
Revises: cfef2344a8c6
Create Date: 2025-01-27 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision = 'recreate_analytics_days'
down_revision = 'cfef2344a8c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the existing analytics_days table if it exists
    op.drop_table('analytics_days', if_exists=True)
    
    # Recreate the analytics_days table with proper schema including top_sources
    op.create_table('analytics_days',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column('date', sa.DateTime(timezone=False), nullable=False, comment='Date (without time)'),
        sa.Column('org_id', sa.Integer(), nullable=True, default=1, comment='Organization ID (nullable for v1 single-org)'),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=True, comment='Project ID for project-scoped analytics'),
        sa.Column('queries', sa.Integer(), nullable=False, default=0, comment='Total queries for the day'),
        sa.Column('avg_latency_ms', sa.Float(), nullable=True, comment='Average latency in milliseconds'),
        sa.Column('thumbs_up_rate', sa.Float(), nullable=True, comment='Thumbs up rate (0.0 to 1.0)'),
        sa.Column('errors', sa.Integer(), nullable=False, default=0, comment='Number of errors for the day'),
        sa.Column('top_sources', postgresql.JSON, nullable=True, comment='Top crawl sources snapshot for the day')
    )
    
    # Add table comment using raw SQL (PostgreSQL specific)
    op.execute("COMMENT ON TABLE analytics_days IS 'Daily aggregated analytics metrics'")
    
    # Create indexes
    op.create_index('ix_analytics_days_id', 'analytics_days', ['id'], unique=False)
    op.create_index('ix_analytics_days_date', 'analytics_days', ['date'], unique=False)
    op.create_index('ix_analytics_days_org_id', 'analytics_days', ['org_id'], unique=False)
    op.create_index('ix_analytics_days_project_id', 'analytics_days', ['project_id'], unique=False)


def downgrade() -> None:
    # Drop the table
    op.drop_table('analytics_days')
