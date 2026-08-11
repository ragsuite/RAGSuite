"""add password reset token fields to users

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-07-13 16:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b4c5d6e7f8a9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    return (
        conn.execute(
            sa.text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_name = :table AND column_name = :column
                """
            ),
            {"table": table_name, "column": column_name},
        ).first()
        is not None
    )


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "users", "password_reset_token_hash"):
        op.add_column("users", sa.Column("password_reset_token_hash", sa.String(length=64), nullable=True))
        op.create_index("ix_users_password_reset_token_hash", "users", ["password_reset_token_hash"], unique=False)
    if not _column_exists(conn, "users", "password_reset_expires_at"):
        op.add_column("users", sa.Column("password_reset_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "users", "password_reset_expires_at"):
        op.drop_column("users", "password_reset_expires_at")
    if _column_exists(conn, "users", "password_reset_token_hash"):
        op.drop_index("ix_users_password_reset_token_hash", table_name="users")
        op.drop_column("users", "password_reset_token_hash")
