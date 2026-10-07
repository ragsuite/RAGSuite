"""Add api_version column to project_model_providers (Azure OpenAI).

Revision ID: u1v2w3x4y5z6
Revises: t0u1v2w3x4y5
Create Date: 2026-10-06

Nullable Azure OpenAI API version override. NULL → env AZURE_OPENAI_API_VERSION
or default 2024-10-21. Other providers ignore the column.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "u1v2w3x4y5z6"
down_revision = "t0u1v2w3x4y5"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("project_model_providers", "api_version"):
        op.add_column(
            "project_model_providers",
            sa.Column(
                "api_version",
                sa.String(length=64),
                nullable=True,
                comment="Azure OpenAI API version override (e.g. 2024-10-21)",
            ),
        )


def downgrade() -> None:
    if _has_column("project_model_providers", "api_version"):
        op.drop_column("project_model_providers", "api_version")
