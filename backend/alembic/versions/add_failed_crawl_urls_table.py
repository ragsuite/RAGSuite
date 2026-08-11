"""add failed_crawl_urls table

Revision ID: add_failed_crawl_urls_table
Revises: 23aa1ccc4782
Create Date: 2025-01-27 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision = 'add_failed_crawl_urls_table'
down_revision = '23aa1ccc4782'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the failed_crawl_urls table
    op.create_table('failed_crawl_urls',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, nullable=False),
        sa.Column('source_id', postgresql.UUID(as_uuid=True), nullable=False, comment='Crawl source ID'),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), nullable=True, comment='Crawl job ID'),
        sa.Column('url', sa.String(length=2048), nullable=False, comment='Failed URL'),
        sa.Column('error_type', sa.String(length=100), nullable=False, comment='Type of error: HTTP_404, HTTP_500, CONNECTION_ERROR, TIMEOUT, etc.'),
        sa.Column('status_code', sa.Integer(), nullable=True, comment='HTTP status code if applicable'),
        sa.Column('error_message', sa.Text(), nullable=True, comment='Detailed error message'),
        sa.Column('attempt_count', sa.Integer(), nullable=False, default=1, comment='Number of retry attempts made'),
        sa.Column('failed_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, comment='Timestamp when the URL failed'),
        sa.ForeignKeyConstraint(['source_id'], ['crawl_sources.id'], name='fk_failed_crawl_urls_source_id'),
        sa.ForeignKeyConstraint(['job_id'], ['crawl_jobs.id'], name='fk_failed_crawl_urls_job_id')
    )
    
    # Add table comment using raw SQL (PostgreSQL specific)
    op.execute("COMMENT ON TABLE failed_crawl_urls IS 'Track URLs that failed to crawl (404s, connection errors, etc.)'")
    
    # Create indexes for better query performance
    op.create_index('ix_failed_crawl_urls_id', 'failed_crawl_urls', ['id'], unique=False)
    op.create_index('ix_failed_crawl_urls_source_id', 'failed_crawl_urls', ['source_id'], unique=False)
    op.create_index('ix_failed_crawl_urls_job_id', 'failed_crawl_urls', ['job_id'], unique=False)
    op.create_index('ix_failed_crawl_urls_url', 'failed_crawl_urls', ['url'], unique=False)
    op.create_index('ix_failed_crawl_urls_failed_at', 'failed_crawl_urls', ['failed_at'], unique=False)
    op.create_index('ix_failed_crawl_urls_error_type', 'failed_crawl_urls', ['error_type'], unique=False)


def downgrade() -> None:
    # Drop indexes first
    op.drop_index('ix_failed_crawl_urls_error_type', table_name='failed_crawl_urls')
    op.drop_index('ix_failed_crawl_urls_failed_at', table_name='failed_crawl_urls')
    op.drop_index('ix_failed_crawl_urls_url', table_name='failed_crawl_urls')
    op.drop_index('ix_failed_crawl_urls_job_id', table_name='failed_crawl_urls')
    op.drop_index('ix_failed_crawl_urls_source_id', table_name='failed_crawl_urls')
    op.drop_index('ix_failed_crawl_urls_id', table_name='failed_crawl_urls')
    
    # Drop the table
    op.drop_table('failed_crawl_urls')

