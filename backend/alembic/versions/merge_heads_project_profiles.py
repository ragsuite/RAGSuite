"""Merge heads after project-scoped model profiles.

Revision ID: d1e2f3a4b5c6
Revises: add_gmail_project_credentials, c9c0a4b1d0f3, create_clickup_tables
Create Date: 2026-05-06
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "d1e2f3a4b5c6"
down_revision = (
    "add_gmail_project_credentials",
    "c9c0a4b1d0f3",
    "create_clickup_tables",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Merge migration — no schema changes.
    pass


def downgrade() -> None:
    # Merge migration — no schema changes.
    pass

