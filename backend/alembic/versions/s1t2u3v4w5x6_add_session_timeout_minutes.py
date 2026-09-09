"""Add organizations.session_timeout_minutes for org-scoped login TTL.

Revision ID: s1t2u3v4w5x6
Revises: k0l1m2n3o4p5
Create Date: 2026-09-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "s1t2u3v4w5x6"
down_revision = "k0l1m2n3o4p5"
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
    if not _has_column("organizations", "session_timeout_minutes"):
        op.add_column(
            "organizations",
            sa.Column(
                "session_timeout_minutes",
                sa.Integer(),
                nullable=True,
                comment="Absolute login session TTL in minutes; NULL uses JWT_EXPIRE_MINUTES env",
            ),
        )


def downgrade() -> None:
    if _has_column("organizations", "session_timeout_minutes"):
        op.drop_column("organizations", "session_timeout_minutes")
