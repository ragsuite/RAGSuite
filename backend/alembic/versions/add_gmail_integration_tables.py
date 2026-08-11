"""add gmail integration tables

Revision ID: add_gmail_integration_tables
Revises: 761b961b20da
Create Date: 2026-04-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'add_gmail_integration_tables'
down_revision = '761b961b20da'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'gmail_integrations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('email_address', sa.String(255), nullable=False),
        sa.Column('access_token', sa.Text(), nullable=False),
        sa.Column('refresh_token', sa.Text(), nullable=False),
        sa.Column('token_expiry', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), default=True, nullable=False),
        sa.Column('cadence_minutes', sa.Integer(), default=30, nullable=False),
        sa.Column('max_emails_per_sync', sa.Integer(), default=100, nullable=False),
        sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_history_id', sa.String(255), nullable=True),
        sa.Column('emails_indexed', sa.Integer(), default=0, nullable=False),
        sa.Column(
            'status',
            sa.Enum('ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED', name='gmailintegrationstatus'),
            nullable=False,
            default='ACTIVE',
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_gmail_integrations_id', 'gmail_integrations', ['id'])
    op.create_index('ix_gmail_integrations_user_id', 'gmail_integrations', ['user_id'])
    op.create_index('ix_gmail_integrations_project_id', 'gmail_integrations', ['project_id'])

    op.create_table(
        'gmail_sync_jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('integration_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('gmail_integrations.id'), nullable=False),
        sa.Column(
            'status',
            sa.Enum('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', name='gmailsyncjobstatus'),
            nullable=False,
            default='PENDING',
        ),
        sa.Column('emails_fetched', sa.Integer(), default=0, nullable=False),
        sa.Column('emails_indexed', sa.Integer(), default=0, nullable=False),
        sa.Column('errors', sa.JSON(), default=list, nullable=False),
        sa.Column('queued_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_gmail_sync_jobs_id', 'gmail_sync_jobs', ['id'])
    op.create_index('ix_gmail_sync_jobs_integration_id', 'gmail_sync_jobs', ['integration_id'])


def downgrade() -> None:
    op.drop_index('ix_gmail_sync_jobs_integration_id', 'gmail_sync_jobs')
    op.drop_index('ix_gmail_sync_jobs_id', 'gmail_sync_jobs')
    op.drop_table('gmail_sync_jobs')
    op.drop_index('ix_gmail_integrations_project_id', 'gmail_integrations')
    op.drop_index('ix_gmail_integrations_user_id', 'gmail_integrations')
    op.drop_index('ix_gmail_integrations_id', 'gmail_integrations')
    op.drop_table('gmail_integrations')
    op.execute('DROP TYPE IF EXISTS gmailintegrationstatus')
    op.execute('DROP TYPE IF EXISTS gmailsyncjobstatus')
