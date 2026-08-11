"""add provider and model columns to query logs

Revision ID: add_querylog_provider_model
Revises: add_querylog_token_usage
Create Date: 2026-05-08 14:20:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "add_querylog_provider_model"
down_revision = "add_querylog_token_usage"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("query_logs", sa.Column("llm_provider", sa.String(length=50), nullable=True))
    op.add_column("query_logs", sa.Column("llm_model", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_query_logs_llm_provider"), "query_logs", ["llm_provider"], unique=False)
    op.create_index(op.f("ix_query_logs_llm_model"), "query_logs", ["llm_model"], unique=False)


def downgrade():
    op.drop_index(op.f("ix_query_logs_llm_model"), table_name="query_logs")
    op.drop_index(op.f("ix_query_logs_llm_provider"), table_name="query_logs")
    op.drop_column("query_logs", "llm_model")
    op.drop_column("query_logs", "llm_provider")
