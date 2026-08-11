"""add organization SSO config and user IdP identity tables

Revision ID: u8v9w0x1y2z3
Revises: t7u8v9w0x1y2
Create Date: 2026-07-07 17:35:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "u8v9w0x1y2z3"
down_revision = "t7u8v9w0x1y2"
branch_labels = None
depends_on = None


def _table_exists(conn, table_name: str) -> bool:
    return (
        conn.execute(
            sa.text(
                """
                SELECT 1
                FROM information_schema.tables
                WHERE table_name = :table_name
                """
            ),
            {"table_name": table_name},
        ).fetchone()
        is not None
    )


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "organization_sso_configs"):
        op.create_table(
            "organization_sso_configs",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column("protocol", sa.String(length=10), nullable=False, server_default="oidc"),
            sa.Column("provider", sa.String(length=32), nullable=False, server_default="google"),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("idp_entity_id", sa.String(length=512), nullable=True),
            sa.Column("client_id", sa.String(length=512), nullable=True),
            sa.Column("client_secret_encrypted", sa.Text(), nullable=True),
            sa.Column("authorization_url", sa.String(length=1024), nullable=True),
            sa.Column("token_url", sa.String(length=1024), nullable=True),
            sa.Column("jwks_uri", sa.String(length=1024), nullable=True),
            sa.Column("email_domains", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
            sa.Column(
                "jit_provisioning_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
            sa.Column("default_role", sa.String(length=20), nullable=False, server_default="member"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("org_id", name="uq_organization_sso_configs_org_id"),
        )
        op.create_index("ix_organization_sso_configs_org_id", "organization_sso_configs", ["org_id"], unique=False)

    if not _table_exists(conn, "user_idp_identities"):
        op.create_table(
            "user_idp_identities",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column("idp_subject", sa.String(length=512), nullable=False),
            sa.Column("protocol", sa.String(length=10), nullable=False),
            sa.Column("email_at_link", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "org_id",
                "idp_subject",
                "protocol",
                name="uq_user_idp_identities_org_subject_protocol",
            ),
        )
        op.create_index("ix_user_idp_identities_user_id", "user_idp_identities", ["user_id"], unique=False)
        op.create_index("ix_user_idp_identities_org_id", "user_idp_identities", ["org_id"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "user_idp_identities"):
        op.drop_index("ix_user_idp_identities_org_id", table_name="user_idp_identities")
        op.drop_index("ix_user_idp_identities_user_id", table_name="user_idp_identities")
        op.drop_table("user_idp_identities")
    if _table_exists(conn, "organization_sso_configs"):
        op.drop_index("ix_organization_sso_configs_org_id", table_name="organization_sso_configs")
        op.drop_table("organization_sso_configs")
