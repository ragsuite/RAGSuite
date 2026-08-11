"""onboarding_completed_at and otp attempt_count

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-05-20

"""
from alembic import op
import sqlalchemy as sa

revision = "a2b3c4d5e6f7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_users_onboarding_completed_at",
        "users",
        ["onboarding_completed_at"],
        unique=False,
    )
    op.add_column(
        "email_verification_tokens",
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.execute(
        """
        UPDATE users u
        SET onboarding_completed_at = COALESCE(u.email_verified_at, u.created_at, NOW() AT TIME ZONE 'UTC')
        WHERE onboarding_completed_at IS NULL
          AND EXISTS (
            SELECT 1 FROM projects p
            WHERE p.owner_id = u.id AND p.is_active = true
          )
        """
    )


def downgrade() -> None:
    op.drop_column("email_verification_tokens", "attempt_count")
    op.drop_index("ix_users_onboarding_completed_at", table_name="users")
    op.drop_column("users", "onboarding_completed_at")
