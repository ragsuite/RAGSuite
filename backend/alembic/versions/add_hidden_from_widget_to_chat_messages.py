"""add_hidden_from_widget_to_chat_messages

Revision ID: add_hidden_from_widget
Revises: add_search_response_config
Create Date: 2025-12-26 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_hidden_from_widget'
down_revision = 'add_search_response_config'  # Point to latest migration head
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add hidden_from_widget boolean column to chat_messages table
    op.add_column('chat_messages', 
        sa.Column('hidden_from_widget', sa.Boolean(), nullable=False, server_default='false',
                  comment='If True, message is hidden from chatbot widget but still visible in history page')
    )


def downgrade() -> None:
    # Remove hidden_from_widget column
    op.drop_column('chat_messages', 'hidden_from_widget')

