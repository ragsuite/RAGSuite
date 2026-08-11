"""add_profile_type_to_model_config_profiles

Revision ID: fcc931cfd797
Revises: 4da692fb4db5
Create Date: 2026-05-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'fcc931cfd797'
down_revision = '4da692fb4db5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'model_config_profiles',
        sa.Column('profile_type', sa.String(20), nullable=False, server_default='search')
    )
    op.drop_constraint(
        'uq_model_config_profile_user_project_provider_model',
        'model_config_profiles',
        type_='unique'
    )
    op.create_unique_constraint(
        'uq_model_config_profile_user_project_provider_model_type',
        'model_config_profiles',
        ['user_id', 'project_id', 'provider', 'model_name', 'profile_type']
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_model_config_profile_user_project_provider_model_type',
        'model_config_profiles',
        type_='unique'
    )
    op.create_unique_constraint(
        'uq_model_config_profile_user_project_provider_model',
        'model_config_profiles',
        ['user_id', 'project_id', 'provider', 'model_name']
    )
    op.drop_column('model_config_profiles', 'profile_type')
