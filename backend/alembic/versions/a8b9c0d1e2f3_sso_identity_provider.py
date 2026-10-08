"""Add provider column on user_idp_identities.

Revision ID: a8b9c0d1e2f3
Revises: z6a7b8c9d0e1
Create Date: 2026-10-08

Lets the same org user link Google and Microsoft OIDC subjects.
Existing rows backfill provider='google'.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


revision = "a8b9c0d1e2f3"
down_revision = "z6a7b8c9d0e1"
branch_labels = None
depends_on = None


def _has_table(table: str) -> bool:
    return inspect(op.get_bind()).has_table(table)


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table(table):
        return False
    return any(c["name"] == column for c in inspector.get_columns(table))


def upgrade() -> None:
    if not _has_table("user_idp_identities"):
        return
    if not _has_column("user_idp_identities", "provider"):
        op.add_column(
            "user_idp_identities",
            sa.Column("provider", sa.String(length=32), nullable=True),
        )
    op.execute(
        text(
            """
            UPDATE user_idp_identities
            SET provider = 'google'
            WHERE provider IS NULL OR TRIM(provider) = ''
            """
        )
    )


def downgrade() -> None:
    if not _has_table("user_idp_identities"):
        return
    if _has_column("user_idp_identities", "provider"):
        op.drop_column("user_idp_identities", "provider")
