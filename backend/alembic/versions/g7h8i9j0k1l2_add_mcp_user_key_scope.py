"""Add personal MCP key scope columns on api_keys.

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-09-23

Existing rows stay key_scope=project so REST API keys are unchanged.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision = "g7h8i9j0k1l2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns(table)}
    return column in cols


def upgrade() -> None:
    bind = op.get_bind()
    if "api_keys" not in inspect(bind).get_table_names():
        return
    if not _has_column("api_keys", "key_scope"):
        op.add_column(
            "api_keys",
            sa.Column(
                "key_scope",
                sa.String(length=32),
                nullable=False,
                server_default="project",
            ),
        )
        op.create_index("ix_api_keys_key_scope", "api_keys", ["key_scope"])
    if not _has_column("api_keys", "mcp_active_project_id"):
        op.add_column(
            "api_keys",
            sa.Column(
                "mcp_active_project_id",
                postgresql.UUID(as_uuid=True),
                nullable=True,
            ),
        )
        op.create_index("ix_api_keys_mcp_active_project_id", "api_keys", ["mcp_active_project_id"])
        op.create_foreign_key(
            "fk_api_keys_mcp_active_project_id",
            "api_keys",
            "projects",
            ["mcp_active_project_id"],
            ["id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "api_keys" not in inspect(bind).get_table_names():
        return
    if _has_column("api_keys", "mcp_active_project_id"):
        op.drop_constraint("fk_api_keys_mcp_active_project_id", "api_keys", type_="foreignkey")
        op.drop_index("ix_api_keys_mcp_active_project_id", table_name="api_keys")
        op.drop_column("api_keys", "mcp_active_project_id")
    if _has_column("api_keys", "key_scope"):
        op.drop_index("ix_api_keys_key_scope", table_name="api_keys")
        op.drop_column("api_keys", "key_scope")
