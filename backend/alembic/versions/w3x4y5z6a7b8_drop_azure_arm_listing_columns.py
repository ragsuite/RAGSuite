"""Drop unused Azure ARM listing columns from project_model_providers.

Revision ID: w3x4y5z6a7b8
Revises: v2w3x4y5z6a7
Create Date: 2026-10-06

Entra / ARM listing was removed from Model Configuration; drop the optional columns.
"""
from alembic import op
from sqlalchemy import inspect


revision = "w3x4y5z6a7b8"
down_revision = "v2w3x4y5z6a7"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
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


def downgrade() -> None:
    # Columns are not re-created; feature was removed.
    pass
