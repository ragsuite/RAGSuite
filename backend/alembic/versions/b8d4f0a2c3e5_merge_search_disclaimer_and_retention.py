"""Merge heads after search widget disclaimer and project retention / lexical index version.

Revision ID: b8d4f0a2c3e5
Revises: q7r8s9t0u1v2, r8s9t0u1v2w3
Create Date: 2026-10-02
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "b8d4f0a2c3e5"
down_revision = ("q7r8s9t0u1v2", "r8s9t0u1v2w3")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Merge migration — no schema changes.
    pass


def downgrade() -> None:
    # Merge migration — no schema changes.
    pass
