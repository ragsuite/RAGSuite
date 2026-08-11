"""Backfill embedding model values to all-MiniLM-L6-v2.

Revision ID: ab12cd34ef56
Revises: 9f3d2b1c7a8e
Create Date: 2026-05-06
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "ab12cd34ef56"
down_revision = "9f3d2b1c7a8e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE chatbot_settings
        SET embedding_model = 'all-MiniLM-L6-v2'
        WHERE embedding_model = 'text-embedding-3-small'
        """
    )
    op.execute(
        """
        UPDATE search_settings
        SET embedding_model = 'all-MiniLM-L6-v2'
        WHERE embedding_model = 'text-embedding-3-small'
        """
    )
    op.execute(
        """
        UPDATE llm_configs
        SET embedding_model = 'all-MiniLM-L6-v2'
        WHERE embedding_model = 'text-embedding-3-small'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE chatbot_settings
        SET embedding_model = 'text-embedding-3-small'
        WHERE embedding_model = 'all-MiniLM-L6-v2'
        """
    )
    op.execute(
        """
        UPDATE search_settings
        SET embedding_model = 'text-embedding-3-small'
        WHERE embedding_model = 'all-MiniLM-L6-v2'
        """
    )
    op.execute(
        """
        UPDATE llm_configs
        SET embedding_model = 'text-embedding-3-small'
        WHERE embedding_model = 'all-MiniLM-L6-v2'
        """
    )
