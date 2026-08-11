"""add organization memberships and project ACL tables

Revision ID: t7u8v9w0x1y2
Revises: r4s5t6u7v8w9
Create Date: 2026-07-07 16:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "t7u8v9w0x1y2"
down_revision = "r4s5t6u7v8w9"
branch_labels = None
depends_on = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    return (
        conn.execute(
            sa.text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = :table_name AND column_name = :column_name
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        ).fetchone()
        is not None
    )


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

    if not _column_exists(conn, "organizations", "registration_enabled"):
        op.add_column(
            "organizations",
            sa.Column("registration_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
    if not _column_exists(conn, "organizations", "default_member_permissions"):
        op.add_column(
            "organizations",
            sa.Column("default_member_permissions", postgresql.JSONB(astext_type=sa.Text()), nullable=True, server_default=sa.text("'[]'::jsonb")),
        )

    if not _column_exists(conn, "users", "provisioned_by"):
        op.add_column("users", sa.Column("provisioned_by", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_users_provisioned_by_users",
            "users",
            "users",
            ["provisioned_by"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index("ix_users_provisioned_by", "users", ["provisioned_by"], unique=False)

    if not _column_exists(conn, "users", "must_change_password"):
        op.add_column(
            "users",
            sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )

    if not _column_exists(conn, "users", "auth_provider"):
        op.add_column(
            "users",
            sa.Column("auth_provider", sa.String(length=20), nullable=False, server_default="local"),
        )

    if not _column_exists(conn, "projects", "org_id"):
        op.add_column("projects", sa.Column("org_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_projects_org_id_organizations",
            "projects",
            "organizations",
            ["org_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index("ix_projects_org_id", "projects", ["org_id"], unique=False)

    if not _table_exists(conn, "organization_members"):
        op.create_table(
            "organization_members",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("org_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("role", sa.String(length=20), nullable=False, server_default="member"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("invited_by", sa.Integer(), nullable=True),
            sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["invited_by"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("org_id", "user_id", name="uq_organization_members_org_user"),
        )
        op.create_index("ix_organization_members_org_id", "organization_members", ["org_id"], unique=False)
        op.create_index("ix_organization_members_user_id", "organization_members", ["user_id"], unique=False)

    if not _table_exists(conn, "project_members"):
        op.create_table(
            "project_members",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("permissions", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("granted_by", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["granted_by"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("project_id", "user_id", name="uq_project_members_project_user"),
        )
        op.create_index("ix_project_members_project_id", "project_members", ["project_id"], unique=False)
        op.create_index("ix_project_members_user_id", "project_members", ["user_id"], unique=False)

    # Keep deployment strict one-org by default.
    conn.execute(sa.text("UPDATE organizations SET registration_enabled = false WHERE registration_enabled IS NULL OR registration_enabled = true"))

    # Ensure a default organization exists for backfill (Docker DBs may lack id=1).
    conn.execute(
        sa.text(
            """
            INSERT INTO organizations (
                id, name, slug, max_users, max_projects, max_crawls_per_user,
                max_queued_ingest_per_project, max_concurrent_ingest_per_project, registration_enabled
            )
            SELECT 1, 'Default', 'default', 0, 0, 0, 0, 0, false
            WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE id = 1)
            """
        )
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO organizations (
                name, slug, max_users, max_projects, max_crawls_per_user,
                max_queued_ingest_per_project, max_concurrent_ingest_per_project, registration_enabled
            )
            SELECT 'Default', 'default', 0, 0, 0, 0, 0, false
            WHERE NOT EXISTS (SELECT 1 FROM organizations)
            """
        )
    )
    conn.execute(
        sa.text(
            """
            UPDATE users
            SET org_id = (SELECT id FROM organizations ORDER BY id LIMIT 1)
            WHERE org_id IS NULL
            """
        )
    )

    # Backfill memberships from existing users and projects.
    conn.execute(
        sa.text(
            """
            INSERT INTO organization_members (org_id, user_id, role, is_active, invited_by, joined_at)
            SELECT
                COALESCE(
                    u.org_id,
                    (SELECT id FROM organizations ORDER BY id LIMIT 1)
                ) AS org_id,
                u.id AS user_id,
                CASE WHEN u.is_admin THEN 'org_admin' ELSE 'member' END AS role,
                u.is_active AS is_active,
                NULL AS invited_by,
                now() AS joined_at
            FROM users u
            WHERE COALESCE(
                u.org_id,
                (SELECT id FROM organizations ORDER BY id LIMIT 1)
            ) IS NOT NULL
            ON CONFLICT (org_id, user_id) DO NOTHING
            """
        )
    )

    conn.execute(
        sa.text(
            """
            UPDATE projects p
            SET org_id = COALESCE(
                owner.org_id,
                (SELECT id FROM organizations ORDER BY id LIMIT 1)
            )
            FROM users owner
            WHERE owner.id = p.owner_id
              AND p.org_id IS NULL
            """
        )
    )

    conn.execute(
        sa.text(
            """
            INSERT INTO project_members (project_id, user_id, permissions, granted_by)
            SELECT
                p.id AS project_id,
                p.owner_id AS user_id,
                '[
                    "project:read","project:write","project:admin","crawl:manage",
                    "documents:manage","connectors:manage","chat:use","search:use",
                    "analytics:read","api_keys:manage","widgets:manage","settings:manage"
                ]'::jsonb AS permissions,
                p.owner_id AS granted_by
            FROM projects p
            WHERE p.owner_id IS NOT NULL
            ON CONFLICT (project_id, user_id) DO NOTHING
            """
        )
    )
    # SQLAlchemy bind params do not support Python list -> jsonb cast reliably in text query.
    conn.execute(
        sa.text(
            """
            UPDATE project_members
            SET permissions = '[
                "project:read","project:write","project:admin","crawl:manage",
                "documents:manage","connectors:manage","chat:use","search:use",
                "analytics:read","api_keys:manage","widgets:manage","settings:manage"
            ]'::jsonb
            WHERE permissions IS NULL OR jsonb_typeof(permissions) <> 'array'
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_project_members_user_id", table_name="project_members")
    op.drop_index("ix_project_members_project_id", table_name="project_members")
    op.drop_table("project_members")

    op.drop_index("ix_organization_members_user_id", table_name="organization_members")
    op.drop_index("ix_organization_members_org_id", table_name="organization_members")
    op.drop_table("organization_members")

    op.drop_index("ix_projects_org_id", table_name="projects")
    op.drop_constraint("fk_projects_org_id_organizations", "projects", type_="foreignkey")
    op.drop_column("projects", "org_id")

    op.drop_column("users", "auth_provider")
    op.drop_column("users", "must_change_password")

    op.drop_index("ix_users_provisioned_by", table_name="users")
    op.drop_constraint("fk_users_provisioned_by_users", "users", type_="foreignkey")
    op.drop_column("users", "provisioned_by")

    op.drop_column("organizations", "default_member_permissions")
    op.drop_column("organizations", "registration_enabled")
