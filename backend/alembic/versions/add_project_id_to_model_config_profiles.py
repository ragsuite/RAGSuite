"""Add project_id to model_config_profiles (project-scoped compare).

Revision ID: c9c0a4b1d0f3
Revises: fb56884cd5a0
Create Date: 2026-05-06
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
# IMPORTANT: revision strings must fit in alembic_version.version_num (varchar(32)).
revision = "c9c0a4b1d0f3"
down_revision = "fb56884cd5a0"
branch_labels = None
depends_on = None


def upgrade():
    # 1) Add nullable project_id (backfill best-effort, then enforce in app logic)
    op.add_column(
        "model_config_profiles",
        sa.Column("project_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_model_config_profiles_project_id",
        "model_config_profiles",
        ["project_id"],
        unique=False,
    )

    # 2) Best-effort backfill: set to the user's current active project (non-temp).
    # If no active project exists for a user, the row stays NULL and will not appear until re-saved.
    op.execute(
        """
        UPDATE model_config_profiles m
        SET project_id = p.id
        FROM projects p
        WHERE p.owner_id = m.user_id
          AND p.is_active = true
          AND p.name NOT LIKE '__TEMP_ONBOARDING_%'
          AND m.project_id IS NULL
        """
    )

    # 3) Replace unique constraint to include project_id.
    op.drop_constraint(
        "uq_model_config_profile_user_provider_model",
        "model_config_profiles",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_model_config_profile_user_project_provider_model",
        "model_config_profiles",
        ["user_id", "project_id", "provider", "model_name"],
    )

    # 4) Add FK constraint (may already exist implicitly in some DBs; Alembic handles it).
    op.create_foreign_key(
        "fk_model_config_profiles_project_id_projects",
        "model_config_profiles",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade():
    op.drop_constraint(
        "fk_model_config_profiles_project_id_projects",
        "model_config_profiles",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_model_config_profile_user_project_provider_model",
        "model_config_profiles",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_model_config_profile_user_provider_model",
        "model_config_profiles",
        ["user_id", "provider", "model_name"],
    )
    op.drop_index("ix_model_config_profiles_project_id", table_name="model_config_profiles")
    op.drop_column("model_config_profiles", "project_id")

