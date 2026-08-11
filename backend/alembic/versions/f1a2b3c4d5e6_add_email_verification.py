"""add email verification

Revision ID: f1a2b3c4d5e6
Revises: e8f2a1b3c4d5
Create Date: 2026-05-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f1a2b3c4d5e6"
down_revision = "e8f2a1b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_email_verified_at", "users", ["email_verified_at"], unique=False)

    op.create_table(
        "email_verification_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resend_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("request_ip", sa.String(length=64), nullable=True),
        sa.Column("request_user_agent", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_email_verification_tokens_user_id",
        "email_verification_tokens",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_email_verification_tokens_token_hash",
        "email_verification_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_email_verification_tokens_expires_at",
        "email_verification_tokens",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_email_verification_tokens_user_expires",
        "email_verification_tokens",
        ["user_id", "expires_at"],
        unique=False,
    )

    # Existing accounts: treat as already verified (backward compatibility)
    op.execute(
        """
        UPDATE users
        SET email_verified_at = COALESCE(created_at, NOW() AT TIME ZONE 'UTC')
        WHERE email_verified_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_email_verification_tokens_user_expires", table_name="email_verification_tokens")
    op.drop_index("ix_email_verification_tokens_expires_at", table_name="email_verification_tokens")
    op.drop_index("ix_email_verification_tokens_token_hash", table_name="email_verification_tokens")
    op.drop_index("ix_email_verification_tokens_user_id", table_name="email_verification_tokens")
    op.drop_table("email_verification_tokens")
    op.drop_index("ix_users_email_verified_at", table_name="users")
    op.drop_column("users", "email_verified_at")
