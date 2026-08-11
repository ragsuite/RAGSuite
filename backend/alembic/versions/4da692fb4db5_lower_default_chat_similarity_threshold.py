"""lower_default_chat_similarity_threshold

Revision ID: 4da692fb4db5
Revises: b9f3e2d1c7a8
Create Date: 2026-05-25 12:05:07.633275

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4da692fb4db5'
down_revision = 'b9f3e2d1c7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update rows still at the old default (0.7) to the new default (0.5).
    # Rows where the user explicitly set a custom value are untouched.
    op.execute(
        "UPDATE chatbot_settings SET chat_similarity_threshold = 0.5 "
        "WHERE chat_similarity_threshold = 0.7"
    )
    op.execute(
        "UPDATE llm_configs SET chat_similarity_threshold = 0.5 "
        "WHERE chat_similarity_threshold = 0.7"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE chatbot_settings SET chat_similarity_threshold = 0.7 "
        "WHERE chat_similarity_threshold = 0.5"
    )
    op.execute(
        "UPDATE llm_configs SET chat_similarity_threshold = 0.7 "
        "WHERE chat_similarity_threshold = 0.5"
    )
