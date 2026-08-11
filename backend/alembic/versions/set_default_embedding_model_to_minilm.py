"""Set default embedding model to all-MiniLM-L6-v2.

Revision ID: 9f3d2b1c7a8e
Revises: d1e2f3a4b5c6
Create Date: 2026-05-06
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9f3d2b1c7a8e"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "chatbot_settings",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text("'all-MiniLM-L6-v2'"),
        existing_nullable=False,
    )
    op.alter_column(
        "search_settings",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text("'all-MiniLM-L6-v2'"),
        existing_nullable=False,
    )
    op.alter_column(
        "llm_configs",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text("'all-MiniLM-L6-v2'"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "chatbot_settings",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text("'text-embedding-3-small'"),
        existing_nullable=False,
    )
    op.alter_column(
        "search_settings",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text("'text-embedding-3-small'"),
        existing_nullable=False,
    )
    op.alter_column(
        "llm_configs",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text("'text-embedding-3-small'"),
        existing_nullable=False,
    )
