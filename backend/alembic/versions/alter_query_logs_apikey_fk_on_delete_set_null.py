"""alter query_logs.apikey_id FK to ON DELETE SET NULL

Revision ID: alter_query_logs_apikey_fk_on_delete_set_null
Revises: add_integration_embeds_table
Create Date: 2025-12-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "alter_query_logs_apikey_fk_on_delete_set_null"
down_revision: Union[str, None] = "add_integration_embeds_table"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop existing foreign key constraint if it exists
    op.drop_constraint(
        "query_logs_apikey_id_fkey",
        "query_logs",
        type_="foreignkey",
    )

    # Re-create it with ON DELETE SET NULL
    op.create_foreign_key(
        "query_logs_apikey_id_fkey",
        "query_logs",
        "api_keys",
        ["apikey_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Revert to a simple FK without ON DELETE behavior
    op.drop_constraint(
        "query_logs_apikey_id_fkey",
        "query_logs",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "query_logs_apikey_id_fkey",
        "query_logs",
        "api_keys",
        ["apikey_id"],
        ["id"],
    )


