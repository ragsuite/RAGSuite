"""Revoke legacy project-scoped REST API keys.

Revision ID: s9t0u1v2w3x4
Revises: b8d4f0a2c3e5
Create Date: 2026-10-02

Deactivates key_scope=project rows after Integrations UI removal.
Leaves mcp_user and mobile keys active.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "s9t0u1v2w3x4"
down_revision = "b8d4f0a2c3e5"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("api_keys", "key_scope"):
        return
    op.execute(
        sa.text(
            """
            UPDATE api_keys
            SET is_active = false,
                updated_at = NOW()
            WHERE COALESCE(key_scope, 'project') = 'project'
              AND is_active = true
            """
        )
    )


def downgrade() -> None:
    # Intentionally no-op: do not reactivate revoked project keys.
    pass
