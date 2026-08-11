"""add n8n integrations table

Revision ID: n8p9q0r1s2t3
Revises: b2c3d4e5f6a7
Create Date: 2026-06-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "n8p9q0r1s2t3"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None

# Reuse enum created by add_api_keys_table migration — do not CREATE TYPE again.
api_key_environment_enum = postgresql.ENUM(
    "Production",
    "Staging",
    "Development",
    name="apikeyenvironment",
    create_type=False,
)

n8n_status_enum = postgresql.ENUM(
    "CONNECTED",
    "DISCONNECTED",
    "ERROR",
    name="n8nintegrationstatus",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    n8n_status_enum.create(bind, checkfirst=True)

    inspector = sa.inspect(bind)
    table_exists = "n8n_integrations" in inspector.get_table_names()

    if not table_exists:
        op.create_table(
            "n8n_integrations",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("environment", api_key_environment_enum, nullable=False),
            sa.Column("base_url", sa.String(2048), nullable=False),
            sa.Column("api_key_encrypted", sa.Text(), nullable=True),
            sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column(
                "status",
                n8n_status_enum,
                nullable=False,
                server_default="DISCONNECTED",
            ),
            sa.Column("last_test_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column(
                "linked_ragsuite_api_key_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("api_keys.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.UniqueConstraint("user_id", "project_id", "environment", name="uq_n8n_integrations_user_project_env"),
        )

    existing_indexes = set()
    if table_exists:
        try:
            existing_indexes = {idx["name"] for idx in inspector.get_indexes("n8n_integrations")}
        except Exception:
            existing_indexes = set()

    for index_name, columns in (
        ("ix_n8n_integrations_id", ["id"]),
        ("ix_n8n_integrations_user_id", ["user_id"]),
        ("ix_n8n_integrations_project_id", ["project_id"]),
        ("ix_n8n_integrations_environment", ["environment"]),
    ):
        if index_name not in existing_indexes:
            try:
                op.create_index(index_name, "n8n_integrations", columns)
            except Exception:
                pass


def downgrade() -> None:
    op.drop_index("ix_n8n_integrations_environment", "n8n_integrations")
    op.drop_index("ix_n8n_integrations_project_id", "n8n_integrations")
    op.drop_index("ix_n8n_integrations_user_id", "n8n_integrations")
    op.drop_index("ix_n8n_integrations_id", "n8n_integrations")
    op.drop_table("n8n_integrations")
    n8n_status_enum.drop(op.get_bind(), checkfirst=True)
