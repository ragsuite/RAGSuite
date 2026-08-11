"""add_search_rag_parameters_to_search_settings

Revision ID: c56a6776a4b8
Revises: move_llm_config_to_settings
Create Date: 2025-12-31 17:25:48.348353

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c56a6776a4b8'
down_revision = 'move_llm_config_to_settings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add search-specific RAG parameters to search_settings table
    op.add_column('search_settings', sa.Column('search_top_k', sa.Integer(), nullable=True, server_default='5', comment='Number of documents to retrieve for search'))
    op.add_column('search_settings', sa.Column('search_similarity_threshold', sa.Float(), nullable=True, server_default='0.2', comment='Minimum similarity score for document inclusion in search (0.0-1.0)'))
    op.add_column('search_settings', sa.Column('search_max_tokens', sa.Integer(), nullable=True, server_default='1000', comment='Maximum tokens for search responses (0-2000, 0=unlimited)'))
    op.add_column('search_settings', sa.Column('search_use_reranker', sa.Boolean(), nullable=True, server_default='false', comment='Use reranker to improve result relevance in search'))


def downgrade() -> None:
    # Remove search-specific RAG parameters from search_settings table
    op.drop_column('search_settings', 'search_use_reranker')
    op.drop_column('search_settings', 'search_max_tokens')
    op.drop_column('search_settings', 'search_similarity_threshold')
    op.drop_column('search_settings', 'search_top_k')
