"""Change api_key columns from VARCHAR(255) to TEXT for encrypted storage

Revision ID: b2c3d4e5f6a7
Revises: f9e8d7c6b5a4
Create Date: 2026-06-09

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "f9e8d7c6b5a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("chatbot_settings", "api_key",
                    existing_type=sa.String(255),
                    type_=sa.Text(),
                    existing_nullable=True)
    op.alter_column("search_settings", "api_key",
                    existing_type=sa.String(255),
                    type_=sa.Text(),
                    existing_nullable=True)
    op.alter_column("llm_configs", "api_key",
                    existing_type=sa.String(255),
                    type_=sa.Text(),
                    existing_nullable=True)
    op.alter_column("model_config_profiles", "api_key",
                    existing_type=sa.String(255),
                    type_=sa.Text(),
                    existing_nullable=True)


def downgrade() -> None:
    op.alter_column("model_config_profiles", "api_key",
                    existing_type=sa.Text(),
                    type_=sa.String(255),
                    existing_nullable=True)
    op.alter_column("llm_configs", "api_key",
                    existing_type=sa.Text(),
                    type_=sa.String(255),
                    existing_nullable=True)
    op.alter_column("search_settings", "api_key",
                    existing_type=sa.Text(),
                    type_=sa.String(255),
                    existing_nullable=True)
    op.alter_column("chatbot_settings", "api_key",
                    existing_type=sa.Text(),
                    type_=sa.String(255),
                    existing_nullable=True)
