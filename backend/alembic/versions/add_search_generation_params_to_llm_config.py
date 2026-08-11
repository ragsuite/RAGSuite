"""Add search-specific generation parameters to LLMConfig

Revision ID: add_search_gen_params
Revises: add_search_settings
Create Date: 2025-12-30 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_search_gen_params'
down_revision = 'add_search_settings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    
    if 'llm_configs' not in inspector.get_table_names():
        return
    
    columns = [col['name'] for col in inspector.get_columns('llm_configs')]
    
    # Add search-specific generation parameters
    if 'search_temperature' not in columns:
        op.add_column('llm_configs', 
            sa.Column('search_temperature', sa.String(length=10), nullable=True, comment='Temperature for search (0.0-2.0)')
        )
    if 'search_top_p' not in columns:
        op.add_column('llm_configs', 
            sa.Column('search_top_p', sa.String(length=10), nullable=True, comment='Top P for search (0.0-1.0)')
        )
    if 'search_best_of' not in columns:
        op.add_column('llm_configs', 
            sa.Column('search_best_of', sa.Integer(), nullable=True, comment='Best Of for search (positive integer)')
        )
    if 'search_frequency_penalty' not in columns:
        op.add_column('llm_configs', 
            sa.Column('search_frequency_penalty', sa.String(length=10), nullable=True, comment='Frequency penalty for search (-2.0 to 2.0)')
        )
    if 'search_presence_penalty' not in columns:
        op.add_column('llm_configs', 
            sa.Column('search_presence_penalty', sa.String(length=10), nullable=True, comment='Presence penalty for search (-2.0 to 2.0)')
        )


def downgrade() -> None:
    op.drop_column('llm_configs', 'search_presence_penalty')
    op.drop_column('llm_configs', 'search_frequency_penalty')
    op.drop_column('llm_configs', 'search_best_of')
    op.drop_column('llm_configs', 'search_top_p')
    op.drop_column('llm_configs', 'search_temperature')

