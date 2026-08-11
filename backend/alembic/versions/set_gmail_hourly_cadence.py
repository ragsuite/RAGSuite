"""set gmail sync cadence to hourly

Revision ID: set_gmail_hourly_cadence
Revises: merge_feedback_and_gmail
Create Date: 2026-04-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "set_gmail_hourly_cadence"
down_revision = "merge_feedback_and_gmail"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ensure existing integrations run hourly.
    op.execute("UPDATE gmail_integrations SET cadence_minutes = 60")

    # Set DB default to hourly for new records.
    op.alter_column(
        "gmail_integrations",
        "cadence_minutes",
        existing_type=sa.Integer(),
        server_default=sa.text("60"),
    )


def downgrade() -> None:
    op.alter_column(
        "gmail_integrations",
        "cadence_minutes",
        existing_type=sa.Integer(),
        server_default=sa.text("30"),
    )
