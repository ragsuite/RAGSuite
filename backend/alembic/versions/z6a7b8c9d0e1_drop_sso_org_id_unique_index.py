"""Drop legacy unique index on organization_sso_configs.org_id.

Revision ID: z6a7b8c9d0e1
Revises: y5z6a7b8c9d0
Create Date: 2026-10-08

Repair for environments that already ran y5z6a7b8c9d0 (or created the
table via SQLAlchemy create_all with unique=True on org_id). The unique
index ``ix_organization_sso_configs_org_id`` blocks a second provider
row (Microsoft) when Google already exists.
"""

from alembic import op
from sqlalchemy import inspect


revision = "z6a7b8c9d0e1"
down_revision = "y5z6a7b8c9d0"
branch_labels = None
depends_on = None


def _has_table(table: str) -> bool:
    return inspect(op.get_bind()).has_table(table)


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


def upgrade() -> None:
    table = "organization_sso_configs"
    if not _has_table(table):
        return

    if _has_unique(table, "uq_organization_sso_configs_org_id"):
        op.drop_constraint(
            "uq_organization_sso_configs_org_id",
            table,
            type_="unique",
        )

    idx = _index_info(table, "ix_organization_sso_configs_org_id")
    if idx is not None and idx.get("unique"):
        op.drop_index("ix_organization_sso_configs_org_id", table_name=table)
        op.create_index(
            "ix_organization_sso_configs_org_id",
            table,
            ["org_id"],
            unique=False,
        )

    if not _has_unique(table, "uq_organization_sso_configs_org_provider"):
        op.create_unique_constraint(
            "uq_organization_sso_configs_org_provider",
            table,
            ["org_id", "provider"],
        )


def downgrade() -> None:
    # Do not re-impose one-row-per-org uniqueness; multi-provider rows may exist.
    pass
