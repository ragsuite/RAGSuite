"""add token usage columns to query logs

Revision ID: add_querylog_token_usage
Revises: emb_ollama_jina
Create Date: 2026-05-08 14:05:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "add_querylog_token_usage"
down_revision = "emb_ollama_jina"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("query_logs", sa.Column("prompt_tokens", sa.Integer(), nullable=True))
    op.add_column("query_logs", sa.Column("completion_tokens", sa.Integer(), nullable=True))
    op.add_column("query_logs", sa.Column("total_tokens", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("query_logs", "total_tokens")
    op.drop_column("query_logs", "completion_tokens")
    op.drop_column("query_logs", "prompt_tokens")
