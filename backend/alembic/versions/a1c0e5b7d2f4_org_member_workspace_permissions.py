"""Add workspace_permissions to organization_members.

Revision ID: a1c0e5b7d2f4
Revises: s9t0u1v2w3x4
Create Date: 2026-10-05

Stores org-scoped flags (e.g. project:create) that are not tied to a project assignment.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision = "a1c0e5b7d2f4"
down_revision = "s9t0u1v2w3x4"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("organization_members", "workspace_permissions"):
        op.add_column(
            "organization_members",
            sa.Column(
                "workspace_permissions",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
        )


def downgrade() -> None:
    if _has_column("organization_members", "workspace_permissions"):
        op.drop_column("organization_members", "workspace_permissions")
