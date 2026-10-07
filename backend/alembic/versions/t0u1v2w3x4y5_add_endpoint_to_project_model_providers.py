"""Add endpoint column to project_model_providers (Azure OpenAI).

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-10-06

Nullable resource endpoint URL for providers that need it (Azure OpenAI).
Existing rows stay NULL; other providers ignore the column.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "t0u1v2w3x4y5"
down_revision = "s9t0u1v2w3x4"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("project_model_providers", "endpoint"):
        op.add_column(
            "project_model_providers",
            sa.Column(
                "endpoint",
                sa.String(length=512),
                nullable=True,
                comment="Azure OpenAI resource endpoint (https://….openai.azure.com)",
            ),
        )


def downgrade() -> None:
    if _has_column("project_model_providers", "endpoint"):
        op.drop_column("project_model_providers", "endpoint")
