"""Add name/country/phone identity fields; drop users.location.

Revision ID: i4j5k6l7m8n9
Revises: h8i9j0k1l2m3, d5e6f7a8b9c0
Create Date: 2026-10-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "i4j5k6l7m8n9"
down_revision = ("h8i9j0k1l2m3", "d5e6f7a8b9c0")
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    cols = {c["name"] for c in inspect(bind).get_columns(table)}
    return column in cols


def upgrade() -> None:
    bind = op.get_bind()
    if "users" not in inspect(bind).get_table_names():
        return
    if not _has_column("users", "first_name"):
        op.add_column("users", sa.Column("first_name", sa.String(length=100), nullable=True))
    if not _has_column("users", "last_name"):
        op.add_column("users", sa.Column("last_name", sa.String(length=100), nullable=True))
    if not _has_column("users", "country"):
        op.add_column("users", sa.Column("country", sa.String(length=2), nullable=True))
    if not _has_column("users", "phone_country_code"):
        op.add_column("users", sa.Column("phone_country_code", sa.String(length=2), nullable=True))
    if _has_column("users", "location"):
        op.drop_column("users", "location")


def downgrade() -> None:
    bind = op.get_bind()
    if "users" not in inspect(bind).get_table_names():
        return
    if not _has_column("users", "location"):
        op.add_column("users", sa.Column("location", sa.String(length=255), nullable=True))
    if _has_column("users", "phone_country_code"):
        op.drop_column("users", "phone_country_code")
    if _has_column("users", "country"):
        op.drop_column("users", "country")
    if _has_column("users", "last_name"):
        op.drop_column("users", "last_name")
    if _has_column("users", "first_name"):
        op.drop_column("users", "first_name")
