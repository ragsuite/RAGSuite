"""add_feedback_fields_to_chat_messages

Revision ID: add_feedback_fields
Revises: a1b2c3d4e5f6
Create Date: 2026-01-16 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

# revision identifiers, used by Alembic.
revision = 'add_feedback_fields'
down_revision = 'a1b2c3d4e5f6'  # Point to latest migration head
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add feedback_rating column (1-5 scale)
    op.add_column('chat_messages', 
        sa.Column('feedback_rating', sa.Integer(), nullable=True,
                  comment='Rating from 1-5 scale')
    )
    
    # Add feedback_text column (text-based feedback)
    op.add_column('chat_messages', 
        sa.Column('feedback_text', sa.Text(), nullable=True,
                  comment='Text-based feedback from user')
    )
    
    # Add context_tags column (JSON array of tags)
    op.add_column('chat_messages', 
        sa.Column('context_tags', JSON, nullable=True,
                  comment="Optional context tags for feedback (e.g., ['accuracy', 'helpfulness', 'relevance'])")
    )


def downgrade() -> None:
    # Remove feedback fields
    op.drop_column('chat_messages', 'context_tags')
    op.drop_column('chat_messages', 'feedback_text')
    op.drop_column('chat_messages', 'feedback_rating')
