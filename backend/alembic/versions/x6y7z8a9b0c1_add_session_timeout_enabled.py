"""Add organizations.session_timeout_enabled.

Revision ID: x6y7z8a9b0c1
Revises: w5x6y7z8a9b0
Create Date: 2026-09-11

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "x6y7z8a9b0c1"
down_revision = "w5x6y7z8a9b0"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table(table):
        return False
    cols = {c["name"] for c in inspector.get_columns(table)}
    return column in cols


def upgrade() -> None:
    if not _has_column("organizations", "session_timeout_enabled"):
        op.add_column(
            "organizations",
            sa.Column(
                "session_timeout_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
                comment="When false, absolute login session TTL is not enforced",
            ),
        )


def downgrade() -> None:
    if _has_column("organizations", "session_timeout_enabled"):
        op.drop_column("organizations", "session_timeout_enabled")
