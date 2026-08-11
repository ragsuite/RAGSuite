"""Add chat-specific settings to LLMConfig

Revision ID: add_chat_settings_llm
Revises: 23aa1ccc4782
Create Date: 2025-12-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_chat_settings_llm'
down_revision = '761b961b20da'  # Latest migration: add_is_active_to_chatbot_settings
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    
    if 'llm_configs' not in inspector.get_table_names():
        return
    
    columns = [col['name'] for col in inspector.get_columns('llm_configs')]
    
    # Add chat-specific generation parameters
    if 'chat_temperature' not in columns:
        op.add_column('llm_configs', 
            sa.Column('chat_temperature', sa.String(length=10), nullable=True, comment='Temperature for chat (0.0-2.0)')
        )
    if 'chat_top_p' not in columns:
        op.add_column('llm_configs', 
            sa.Column('chat_top_p', sa.String(length=10), nullable=True, comment='Top P for chat (0.0-1.0)')
        )
    if 'chat_best_of' not in columns:
        op.add_column('llm_configs', 
            sa.Column('chat_best_of', sa.Integer(), nullable=True, comment='Best Of for chat (positive integer)')
        )
    if 'chat_frequency_penalty' not in columns:
        op.add_column('llm_configs', 
            sa.Column('chat_frequency_penalty', sa.String(length=10), nullable=True, comment='Frequency penalty for chat (-2.0 to 2.0)')
        )
    if 'chat_presence_penalty' not in columns:
        op.add_column('llm_configs', 
            sa.Column('chat_presence_penalty', sa.String(length=10), nullable=True, comment='Presence penalty for chat (-2.0 to 2.0)')
        )
    
    # Add chat-specific RAG parameters
    if 'chat_top_k' not in columns:
        op.add_column('llm_configs', 
            sa.Column('chat_top_k', sa.Integer(), nullable=True, server_default='8', comment='Number of documents to retrieve for chat')
        )
    if 'chat_similarity_threshold' not in columns:
        op.add_column('llm_configs', 
            sa.Column('chat_similarity_threshold', sa.Float(), nullable=True, server_default='0.7', comment='Minimum similarity score for document inclusion in chat (0.0-1.0)')
        )
    if 'chat_max_tokens' not in columns:
        op.add_column('llm_configs', 
            sa.Column('chat_max_tokens', sa.Integer(), nullable=True, server_default='1000', comment='Maximum tokens for chat responses (0-1000, 0=unlimited)')
        )
    if 'chat_use_reranker' not in columns:
        op.add_column('llm_configs', 
            sa.Column('chat_use_reranker', sa.Boolean(), nullable=True, server_default='false', comment='Use reranker to improve result relevance in chat')
        )


def downgrade() -> None:
    op.drop_column('llm_configs', 'chat_use_reranker')
    op.drop_column('llm_configs', 'chat_max_tokens')
    op.drop_column('llm_configs', 'chat_similarity_threshold')
    op.drop_column('llm_configs', 'chat_top_k')
    op.drop_column('llm_configs', 'chat_presence_penalty')
    op.drop_column('llm_configs', 'chat_frequency_penalty')
    op.drop_column('llm_configs', 'chat_best_of')
    op.drop_column('llm_configs', 'chat_top_p')
    op.drop_column('llm_configs', 'chat_temperature')

