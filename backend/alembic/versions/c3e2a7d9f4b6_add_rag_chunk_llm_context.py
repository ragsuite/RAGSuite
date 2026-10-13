"""Add rag_chunk_llm_context (cache of LLM-written chunk context).

Revision ID: c3e2a7d9f4b6
Revises: b2d1f6c8e3a5
Create Date: 2026-10-08

Additive only: a new cache table filled by the background CHUNK_LLM_CONTEXT job.
No existing table or row is touched. Idempotent because ``create_all`` at app
startup may already have created the table.
"""

from alembic import op
import sqlalchemy as sa

revision = "c3e2a7d9f4b6"
down_revision = "b2d1f6c8e3a5"
branch_labels = None
depends_on = None

TABLE = "rag_chunk_llm_context"


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(TABLE):
        return
    op.create_table(
        TABLE,
        sa.Column("cache_key", sa.String(length=64), primary_key=True),
        sa.Column("context", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(TABLE):
        op.drop_table(TABLE)
