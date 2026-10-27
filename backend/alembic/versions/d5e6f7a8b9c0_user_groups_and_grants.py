"""User groups as the Member ACL principal.

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9, c0d9e8f7a6b5
Create Date: 2026-10-26

Adds user_groups, user_group_members, and user_group_project_grants.
Backfills groups from existing Member project_members rows (identical
grant fingerprints share a group) then deletes those Member rows.
Does not drop project_members.
"""
from __future__ import annotations

import json
from collections import defaultdict

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d5e6f7a8b9c0"
down_revision = ("c4d5e6f7a8b9", "c0d9e8f7a6b5")
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


def _fingerprint(assignments: list[tuple[str, tuple[str, ...]]]) -> tuple:
    return tuple(sorted(assignments, key=lambda item: item[0]))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "user_groups" not in tables:
        op.create_table(
            "user_groups",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "org_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("name_key", sa.String(length=100), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("image", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("org_id", "name_key", name="uq_user_groups_org_name_key"),
        )
        op.create_index("ix_user_groups_org_id", "user_groups", ["org_id"])

    if "user_group_members" not in tables:
        op.create_table(
            "user_group_members",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "group_id",
                sa.Integer(),
                sa.ForeignKey("user_groups.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("group_id", "user_id", name="uq_user_group_members_group_user"),
        )
        op.create_index("ix_user_group_members_group_id", "user_group_members", ["group_id"])
        op.create_index("ix_user_group_members_user_id", "user_group_members", ["user_id"])

    if "user_group_project_grants" not in tables:
        op.create_table(
            "user_group_project_grants",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "group_id",
                sa.Integer(),
                sa.ForeignKey("user_groups.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "project_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("projects.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "permissions",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint(
                "group_id", "project_id", name="uq_user_group_project_grants_group_project"
            ),
        )
        op.create_index(
            "ix_user_group_project_grants_group_id", "user_group_project_grants", ["group_id"]
        )
        op.create_index(
            "ix_user_group_project_grants_project_id", "user_group_project_grants", ["project_id"]
        )

    _backfill_member_grants(bind)


def _backfill_member_grants(bind) -> None:
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    needed = {"project_members", "projects", "organization_members", "user_groups"}
    if not needed.issubset(tables):
        return

    from app.services.project_permissions import migrate_member_permissions

    projects = sa.table(
        "projects",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("org_id", sa.Integer),
    )
    members = sa.table(
        "organization_members",
        sa.column("org_id", sa.Integer),
        sa.column("user_id", sa.Integer),
        sa.column("role", sa.String),
    )
    grants = sa.table(
        "project_members",
        sa.column("id", sa.Integer),
        sa.column("project_id", postgresql.UUID(as_uuid=True)),
        sa.column("user_id", sa.Integer),
        sa.column("permissions", sa.JSON),
    )
    groups = sa.table(
        "user_groups",
        sa.column("id", sa.Integer),
        sa.column("org_id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("name_key", sa.String),
        sa.column("description", sa.Text),
    )
    group_members = sa.table(
        "user_group_members",
        sa.column("group_id", sa.Integer),
        sa.column("user_id", sa.Integer),
    )
    group_grants = sa.table(
        "user_group_project_grants",
        sa.column("group_id", sa.Integer),
        sa.column("project_id", postgresql.UUID(as_uuid=True)),
        sa.column("permissions", sa.JSON),
    )

    member_rows = bind.execute(
        sa.select(members.c.org_id, members.c.user_id).where(members.c.role == "member")
    ).fetchall()
    member_orgs = {(int(org_id), int(user_id)) for org_id, user_id in member_rows}

    grant_rows = bind.execute(
        sa.select(
            grants.c.id,
            grants.c.project_id,
            grants.c.user_id,
            grants.c.permissions,
            projects.c.org_id,
        ).select_from(grants.join(projects, projects.c.id == grants.c.project_id))
    ).fetchall()

    by_org_user: dict[tuple[int, int], list[tuple[int, object, tuple[str, ...]]]] = defaultdict(list)
    for row_id, project_id, user_id, raw_perms, org_id in grant_rows:
        if org_id is None or (int(org_id), int(user_id)) not in member_orgs:
            continue
        canonical = tuple(migrate_member_permissions(_load_list(raw_perms)))
        by_org_user[(int(org_id), int(user_id))].append((int(row_id), project_id, canonical))

    clusters: dict[int, dict[tuple, list[int]]] = defaultdict(lambda: defaultdict(list))
    fingerprints: dict[tuple, list[tuple[object, tuple[str, ...]]]] = {}
    delete_ids: list[int] = []
    for (org_id, user_id), rows in by_org_user.items():
        delete_ids.extend(row_id for row_id, _project_id, _perms in rows)
        assignment = [(str(project_id), perms) for _row_id, project_id, perms in rows]
        fp = _fingerprint(assignment)
        clusters[org_id][fp].append(user_id)
        fingerprints[fp] = [(project_id, perms) for _row_id, project_id, perms in rows]

    existing_keys = {
        (int(org_id), str(name_key))
        for org_id, name_key in bind.execute(sa.select(groups.c.org_id, groups.c.name_key)).fetchall()
    }

    for org_id, by_fp in clusters.items():
        index = 0
        for fp, user_ids in by_fp.items():
            index += 1
            name = "Migrated access" if index == 1 else f"Migrated access {index}"
            key = name.strip().lower()
            suffix = 2
            while (org_id, key) in existing_keys:
                name = f"Migrated access {suffix}"
                key = name.strip().lower()
                suffix += 1
            existing_keys.add((org_id, key))
            result = bind.execute(
                groups.insert().values(
                    org_id=org_id,
                    name=name,
                    name_key=key,
                    description="Migrated from per-user project access",
                )
            )
            pk = result.inserted_primary_key
            group_id = pk[0] if pk else result.lastrowid
            for user_id in sorted(set(user_ids)):
                bind.execute(group_members.insert().values(group_id=group_id, user_id=user_id))
            seen_projects = set()
            for project_id, perms in fingerprints.get(fp, []):
                if project_id in seen_projects:
                    continue
                seen_projects.add(project_id)
                bind.execute(
                    group_grants.insert().values(
                        group_id=group_id,
                        project_id=project_id,
                        permissions=list(perms),
                    )
                )

    if delete_ids:
        bind.execute(grants.delete().where(grants.c.id.in_(delete_ids)))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "user_group_project_grants" in tables:
        op.drop_table("user_group_project_grants")
    if "user_group_members" in tables:
        op.drop_table("user_group_members")
    if "user_groups" in tables:
        op.drop_table("user_groups")
