"""Add Azure ARM listing columns to project_model_providers.

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-10-06

Optional Entra / management-plane fields for listing Foundry deployments
when data-plane GET /openai/deployments is unavailable.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "v2w3x4y5z6a7"
down_revision = "u1v2w3x4y5z6"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    cols = [
        (
            "azure_subscription_id",
            sa.Column("azure_subscription_id", sa.String(length=64), nullable=True),
        ),
        (
            "azure_resource_group",
            sa.Column("azure_resource_group", sa.String(length=128), nullable=True),
        ),
        (
            "azure_account_name",
            sa.Column("azure_account_name", sa.String(length=128), nullable=True),
        ),
        (
            "azure_tenant_id",
            sa.Column("azure_tenant_id", sa.String(length=64), nullable=True),
        ),
        (
            "azure_client_id",
            sa.Column("azure_client_id", sa.String(length=64), nullable=True),
        ),
        (
            "azure_client_secret",
            sa.Column(
                "azure_client_secret",
                sa.Text(),
                nullable=True,
                comment="Entra app client secret for ARM deployment listing (encrypted at app layer)",
            ),
        ),
    ]
    for name, col in cols:
        if not _has_column("project_model_providers", name):
            op.add_column("project_model_providers", col)


def downgrade() -> None:
    for name in (
        "azure_client_secret",
        "azure_client_id",
        "azure_tenant_id",
        "azure_account_name",
        "azure_resource_group",
        "azure_subscription_id",
    ):
        if _has_column("project_model_providers", name):
            op.drop_column("project_model_providers", name)
