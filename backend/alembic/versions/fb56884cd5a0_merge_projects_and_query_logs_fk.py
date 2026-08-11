"""merge_projects_and_query_logs_fk

Revision ID: fb56884cd5a0
Revises: add_projects_support, alter_query_logs_apikey_fk_on_delete_set_null
Create Date: 2025-12-23 11:47:12.999550

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fb56884cd5a0'
down_revision = ('add_projects_support', 'alter_query_logs_apikey_fk_on_delete_set_null')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
