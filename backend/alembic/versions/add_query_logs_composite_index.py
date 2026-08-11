"""add composite index on query_logs(project_id, timestamp)

Revision ID: add_query_logs_composite_index
Revises: set_gmail_hourly_cadence
Create Date: 2026-05-26 00:00:00.000000

"""
from alembic import op

revision = "add_query_logs_composite_index"
down_revision = "fcc931cfd797"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Composite index accelerates per-project analytics range queries:
    # SELECT ... FROM query_logs WHERE project_id = ? AND timestamp > ?
    op.create_index(
        "ix_query_logs_project_timestamp",
        "query_logs",
        ["project_id", "timestamp"],
        postgresql_using="btree",
    )


def downgrade() -> None:
    op.drop_index("ix_query_logs_project_timestamp", table_name="query_logs")
