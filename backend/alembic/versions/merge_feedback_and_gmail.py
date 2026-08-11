"""merge feedback and gmail heads

Revision ID: merge_feedback_and_gmail
Revises: add_feedback_fields, add_gmail_integration_tables
Create Date: 2026-04-21 00:01:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'merge_feedback_and_gmail'
down_revision = ('add_feedback_fields', 'add_gmail_integration_tables')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
