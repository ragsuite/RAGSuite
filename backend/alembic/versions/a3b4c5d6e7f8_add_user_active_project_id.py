"""add per-user active project preference

Revision ID: a3b4c5d6e7f8
Revises: c9d8e7f6a5b4
Create Date: 2026-07-09 20:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "a3b4c5d6e7f8"
down_revision = "c9d8e7f6a5b4"
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


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "users", "active_project_id"):
        op.add_column(
            "users",
            sa.Column("active_project_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            "fk_users_active_project_id_projects",
            "users",
            "projects",
            ["active_project_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index("ix_users_active_project_id", "users", ["active_project_id"], unique=False)


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "users", "active_project_id"):
        op.drop_index("ix_users_active_project_id", table_name="users")
        op.drop_constraint("fk_users_active_project_id_projects", "users", type_="foreignkey")
        op.drop_column("users", "active_project_id")
