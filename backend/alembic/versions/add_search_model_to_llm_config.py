"""Add search_model column to LLMConfig

Revision ID: add_search_model
Revises: add_search_gen_params
Create Date: 2025-01-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_search_model'
down_revision = 'add_search_gen_params'
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    
    if 'llm_configs' not in inspector.get_table_names():
        return
    
    columns = [col['name'] for col in inspector.get_columns('llm_configs')]
    
    # Add search_model column
    if 'search_model' not in columns:
        op.add_column('llm_configs', 
            sa.Column('search_model', sa.String(length=100), nullable=True, comment='Model name for search functionality')
        )
        
        # For existing records, set search_model to the same value as chat_model
        op.execute("""
            UPDATE llm_configs 
            SET search_model = chat_model 
            WHERE search_model IS NULL
        """)


def downgrade() -> None:
    op.drop_column('llm_configs', 'search_model')

