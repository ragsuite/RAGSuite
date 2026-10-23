"""Rewrite stored ProjectMember permissions to canonical read/write strings.

Revision ID: c0d9e8f7a6b5
Revises: b9d8c7e6f5a4
Create Date: 2026-10-21

Idempotent JSON rewrite. Runtime aliases still accept legacy strings until
every row is saved through normalize_member_permissions.
"""

from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa

revision = "c0d9e8f7a6b5"
down_revision = "b9d8c7e6f5a4"
branch_labels = None
depends_on = None


def _load_list(raw) -> list:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return list(raw)


def upgrade() -> None:
    from app.services.project_permissions import migrate_member_permissions

    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())
    members = sa.table(
        "project_members",
        sa.column("id", sa.Integer),
        sa.column("permissions", sa.JSON),
    )
    rows = conn.execute(sa.select(members.c.id, members.c.permissions)).fetchall()
    for row_id, raw in rows:
        next_perms = migrate_member_permissions(_load_list(raw))
        if next_perms == _load_list(raw):
            continue
        conn.execute(members.update().where(members.c.id == row_id).values(permissions=next_perms))

    if "organizations" in tables:
        org_cols = {c["name"] for c in inspector.get_columns("organizations")}
        if "default_member_permissions" in org_cols:
            orgs = sa.table(
                "organizations",
                sa.column("id", sa.Integer),
                sa.column("default_member_permissions", sa.JSON),
            )
            for org_id, raw in conn.execute(sa.select(orgs.c.id, orgs.c.default_member_permissions)).fetchall():
                next_perms = migrate_member_permissions(_load_list(raw))
                if next_perms == _load_list(raw):
                    continue
                conn.execute(
                    orgs.update().where(orgs.c.id == org_id).values(default_member_permissions=next_perms)
                )


def downgrade() -> None:
    # Canonical strings remain valid at runtime via aliases in both directions.
    pass
