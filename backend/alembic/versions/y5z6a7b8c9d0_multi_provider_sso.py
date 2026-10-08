"""Multi-provider SSO: tenant_id + unique(org_id, provider).

Revision ID: y5z6a7b8c9d0
Revises: x4y5z6a7b8c9
Create Date: 2026-10-08

Allows Google and Microsoft Entra configs per org. Existing rows keep
provider='google'. Adds optional tenant_id for Entra.

Also drops legacy unique-on-org_id indexes/constraints (SQLAlchemy used to
create unique index ``ix_organization_sso_configs_org_id`` when the column
had unique=True).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


revision = "y5z6a7b8c9d0"
down_revision = "x4y5z6a7b8c9"
branch_labels = None
depends_on = None


def _has_table(table: str) -> bool:
    return inspect(op.get_bind()).has_table(table)


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table(table):
        return False
    return any(c["name"] == column for c in inspector.get_columns(table))


def _has_unique(table: str, name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table(table):
        return False
    return any(u.get("name") == name for u in inspector.get_unique_constraints(table))


def _index_info(table: str, name: str) -> dict | None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table(table):
        return None
    for idx in inspector.get_indexes(table):
        if idx.get("name") == name:
            return idx
    return None


def _drop_org_id_uniqueness() -> None:
    """Remove one-row-per-org uniqueness (constraint and/or unique index)."""
    table = "organization_sso_configs"

    if _has_unique(table, "uq_organization_sso_configs_org_id"):
        op.drop_constraint(
            "uq_organization_sso_configs_org_id",
            table,
            type_="unique",
        )

    # create_all / older models used unique=True → unique INDEX with this name.
    idx = _index_info(table, "ix_organization_sso_configs_org_id")
    if idx is not None and idx.get("unique"):
        op.drop_index("ix_organization_sso_configs_org_id", table_name=table)
        op.create_index(
            "ix_organization_sso_configs_org_id",
            table,
            ["org_id"],
            unique=False,
        )


def upgrade() -> None:
    if not _has_table("organization_sso_configs"):
        return

    if not _has_column("organization_sso_configs", "tenant_id"):
        op.add_column(
            "organization_sso_configs",
            sa.Column("tenant_id", sa.String(length=64), nullable=True),
        )

    # Ensure provider is set on legacy rows.
    op.execute(
        text(
            """
            UPDATE organization_sso_configs
            SET provider = 'google'
            WHERE provider IS NULL OR TRIM(provider) = ''
            """
        )
    )

    _drop_org_id_uniqueness()

    if not _has_unique("organization_sso_configs", "uq_organization_sso_configs_org_provider"):
        op.create_unique_constraint(
            "uq_organization_sso_configs_org_provider",
            "organization_sso_configs",
            ["org_id", "provider"],
        )


def downgrade() -> None:
    if not _has_table("organization_sso_configs"):
        return

    if _has_unique("organization_sso_configs", "uq_organization_sso_configs_org_provider"):
        op.drop_constraint(
            "uq_organization_sso_configs_org_provider",
            "organization_sso_configs",
            type_="unique",
        )

    # Keep one row per org (prefer google) before restoring org_id unique.
    op.execute(
        text(
            """
            DELETE FROM organization_sso_configs a
            USING organization_sso_configs b
            WHERE a.org_id = b.org_id
              AND a.id < b.id
            """
        )
    )

    if not _has_unique("organization_sso_configs", "uq_organization_sso_configs_org_id"):
        op.create_unique_constraint(
            "uq_organization_sso_configs_org_id",
            "organization_sso_configs",
            ["org_id"],
        )

    if _has_column("organization_sso_configs", "tenant_id"):
        op.drop_column("organization_sso_configs", "tenant_id")
