"""set default embedding model to jina de

Revision ID: emb_jina_de_h1
Revises: add_rl_bandit_cfg
Create Date: 2026-05-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "emb_jina_de_h1"
down_revision = "add_rl_bandit_cfg"
branch_labels = None
depends_on = None

OLD_MODEL = "all-MiniLM-L6-v2"
NEW_MODEL = "jinaai/jina-embeddings-v2-base-de"


def upgrade():
    op.alter_column(
        "chatbot_settings",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text(f"'{NEW_MODEL}'"),
        existing_nullable=False,
    )
    op.alter_column(
        "search_settings",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text(f"'{NEW_MODEL}'"),
        existing_nullable=False,
    )
    op.alter_column(
        "llm_configs",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text(f"'{NEW_MODEL}'"),
        existing_nullable=False,
    )

    op.execute(
        f"""
        UPDATE chatbot_settings
        SET embedding_model = '{NEW_MODEL}'
        WHERE embedding_model IS NULL OR embedding_model = '{OLD_MODEL}'
        """
    )
    op.execute(
        f"""
        UPDATE search_settings
        SET embedding_model = '{NEW_MODEL}'
        WHERE embedding_model IS NULL OR embedding_model = '{OLD_MODEL}'
        """
    )
    op.execute(
        f"""
        UPDATE llm_configs
        SET embedding_model = '{NEW_MODEL}'
        WHERE embedding_model IS NULL OR embedding_model = '{OLD_MODEL}'
        """
    )


def downgrade():
    op.execute(
        f"""
        UPDATE chatbot_settings
        SET embedding_model = '{OLD_MODEL}'
        WHERE embedding_model = '{NEW_MODEL}'
        """
    )
    op.execute(
        f"""
        UPDATE search_settings
        SET embedding_model = '{OLD_MODEL}'
        WHERE embedding_model = '{NEW_MODEL}'
        """
    )
    op.execute(
        f"""
        UPDATE llm_configs
        SET embedding_model = '{OLD_MODEL}'
        WHERE embedding_model = '{NEW_MODEL}'
        """
    )

    op.alter_column(
        "chatbot_settings",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text(f"'{OLD_MODEL}'"),
        existing_nullable=False,
    )
    op.alter_column(
        "search_settings",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text(f"'{OLD_MODEL}'"),
        existing_nullable=False,
    )
    op.alter_column(
        "llm_configs",
        "embedding_model",
        existing_type=sa.String(length=100),
        server_default=sa.text(f"'{OLD_MODEL}'"),
        existing_nullable=False,
    )
