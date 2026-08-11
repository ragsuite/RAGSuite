"""Move LLM config fields to chatbot_settings and search_settings

Revision ID: move_llm_config_to_settings
Revises: add_search_model
Create Date: 2025-01-XX XX:XX:XX.XXXXXX

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'move_llm_config_to_settings'
down_revision = 'add_search_model'
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    
    # Check if tables exist
    tables = inspector.get_table_names()
    if 'chatbot_settings' not in tables or 'search_settings' not in tables:
        return
    
    # Add columns to chatbot_settings
    chatbot_columns = [col['name'] for col in inspector.get_columns('chatbot_settings')]
    
    columns_to_add_chatbot = [
        ('model_provider', sa.String(50), 'openai', True),
        ('chat_model', sa.String(100), 'gpt-4', True),
        ('api_key', sa.String(255), None, True),
        ('embedding_model', sa.String(100), 'text-embedding-3-small', True),
        ('chat_temperature', sa.String(10), None, True),
        ('chat_top_p', sa.String(10), None, True),
        ('chat_best_of', sa.Integer(), None, True),
        ('chat_frequency_penalty', sa.String(10), None, True),
        ('chat_presence_penalty', sa.String(10), None, True),
        ('chat_top_k', sa.Integer(), 8, True),
        ('chat_similarity_threshold', sa.Float(), 0.7, True),
        ('chat_max_tokens', sa.Integer(), 1000, True),
        ('chat_use_reranker', sa.Boolean(), False, True),
    ]
    
    for col_name, col_type, default, nullable in columns_to_add_chatbot:
        if col_name not in chatbot_columns:
            if default is not None:
                if isinstance(default, str):
                    op.add_column('chatbot_settings', 
                        sa.Column(col_name, col_type, nullable=nullable, server_default=default))
                else:
                    op.add_column('chatbot_settings', 
                        sa.Column(col_name, col_type, nullable=nullable, server_default=str(default)))
            else:
                op.add_column('chatbot_settings', sa.Column(col_name, col_type, nullable=nullable))
    
    # Add columns to search_settings
    search_columns = [col['name'] for col in inspector.get_columns('search_settings')]
    
    columns_to_add_search = [
        ('model_provider', sa.String(50), 'openai', True),
        ('search_model', sa.String(100), None, True),
        ('api_key', sa.String(255), None, True),
        ('embedding_model', sa.String(100), 'text-embedding-3-small', True),
        ('search_temperature', sa.String(10), None, True),
        ('search_top_p', sa.String(10), None, True),
        ('search_best_of', sa.Integer(), None, True),
        ('search_frequency_penalty', sa.String(10), None, True),
        ('search_presence_penalty', sa.String(10), None, True),
    ]
    
    for col_name, col_type, default, nullable in columns_to_add_search:
        if col_name not in search_columns:
            if default is not None:
                if isinstance(default, str):
                    op.add_column('search_settings', 
                        sa.Column(col_name, col_type, nullable=nullable, server_default=default))
                else:
                    op.add_column('search_settings', 
                        sa.Column(col_name, col_type, nullable=nullable, server_default=str(default)))
            else:
                op.add_column('search_settings', sa.Column(col_name, col_type, nullable=nullable))
    
    # Migrate data from llm_configs to chatbot_settings and search_settings
    # For each user, copy their llm_config to all their projects
    if 'llm_configs' in tables:
        # Migrate to chatbot_settings
        op.execute("""
            UPDATE chatbot_settings cs
            SET 
                model_provider = COALESCE(lc.model_provider, 'openai'),
                chat_model = COALESCE(lc.chat_model, 'gpt-4'),
                api_key = lc.api_key,
                embedding_model = COALESCE(lc.embedding_model, 'text-embedding-3-small'),
                chat_temperature = lc.chat_temperature,
                chat_top_p = lc.chat_top_p,
                chat_best_of = lc.chat_best_of,
                chat_frequency_penalty = lc.chat_frequency_penalty,
                chat_presence_penalty = lc.chat_presence_penalty,
                chat_top_k = COALESCE(lc.chat_top_k, 8),
                chat_similarity_threshold = COALESCE(lc.chat_similarity_threshold, 0.7),
                chat_max_tokens = COALESCE(lc.chat_max_tokens, 1000),
                chat_use_reranker = COALESCE(lc.chat_use_reranker, false)
            FROM llm_configs lc
            WHERE cs.user_id = lc.user_id;
        """)
        
        # Migrate to search_settings
        op.execute("""
            UPDATE search_settings ss
            SET 
                model_provider = COALESCE(lc.model_provider, 'openai'),
                search_model = COALESCE(lc.search_model, lc.chat_model, 'gpt-4'),
                api_key = lc.api_key,
                embedding_model = COALESCE(lc.embedding_model, 'text-embedding-3-small'),
                search_temperature = lc.search_temperature,
                search_top_p = lc.search_top_p,
                search_best_of = lc.search_best_of,
                search_frequency_penalty = lc.search_frequency_penalty,
                search_presence_penalty = lc.search_presence_penalty
            FROM llm_configs lc
            WHERE ss.user_id = lc.user_id;
        """)
        
        # Create settings for projects that don't have them yet
        op.execute("""
            INSERT INTO chatbot_settings (id, user_id, project_id, is_active, is_search_active, model_provider, chat_model, api_key, embedding_model, 
                chat_top_k, chat_similarity_threshold, chat_max_tokens, chat_use_reranker, created_at, updated_at)
            SELECT 
                gen_random_uuid(),
                p.owner_id,
                p.id,
                true,
                true,
                COALESCE(lc.model_provider, 'openai'),
                COALESCE(lc.chat_model, 'gpt-4'),
                lc.api_key,
                COALESCE(lc.embedding_model, 'text-embedding-3-small'),
                COALESCE(lc.chat_top_k, 8),
                COALESCE(lc.chat_similarity_threshold, 0.7),
                COALESCE(lc.chat_max_tokens, 1000),
                COALESCE(lc.chat_use_reranker, false),
                NOW(),
                NOW()
            FROM projects p
            CROSS JOIN llm_configs lc
            WHERE p.owner_id = lc.user_id
            AND NOT EXISTS (
                SELECT 1 FROM chatbot_settings cs 
                WHERE cs.user_id = p.owner_id AND cs.project_id = p.id
            );
        """)
        
        op.execute("""
            INSERT INTO search_settings (id, user_id, project_id, is_search_active, model_provider, search_model, api_key, embedding_model, 
                created_at, updated_at)
            SELECT 
                gen_random_uuid(),
                p.owner_id,
                p.id,
                true,
                COALESCE(lc.model_provider, 'openai'),
                COALESCE(lc.search_model, lc.chat_model, 'gpt-4'),
                lc.api_key,
                COALESCE(lc.embedding_model, 'text-embedding-3-small'),
                NOW(),
                NOW()
            FROM projects p
            CROSS JOIN llm_configs lc
            WHERE p.owner_id = lc.user_id
            AND NOT EXISTS (
                SELECT 1 FROM search_settings ss 
                WHERE ss.user_id = p.owner_id AND ss.project_id = p.id
            );
        """)


def downgrade() -> None:
    # Remove columns from chatbot_settings
    chatbot_columns_to_remove = [
        'model_provider', 'chat_model', 'api_key', 'embedding_model',
        'chat_temperature', 'chat_top_p', 'chat_best_of', 
        'chat_frequency_penalty', 'chat_presence_penalty',
        'chat_top_k', 'chat_similarity_threshold', 'chat_max_tokens', 'chat_use_reranker'
    ]
    
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    
    if 'chatbot_settings' in inspector.get_table_names():
        chatbot_columns = [col['name'] for col in inspector.get_columns('chatbot_settings')]
        for col_name in chatbot_columns_to_remove:
            if col_name in chatbot_columns:
                op.drop_column('chatbot_settings', col_name)
    
    # Remove columns from search_settings
    search_columns_to_remove = [
        'model_provider', 'search_model', 'api_key', 'embedding_model',
        'search_temperature', 'search_top_p', 'search_best_of',
        'search_frequency_penalty', 'search_presence_penalty'
    ]
    
    if 'search_settings' in inspector.get_table_names():
        search_columns = [col['name'] for col in inspector.get_columns('search_settings')]
        for col_name in search_columns_to_remove:
            if col_name in search_columns:
                op.drop_column('search_settings', col_name)

