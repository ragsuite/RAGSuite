"""add email_2fa_enabled and token purpose

Revision ID: m5n6o7p8q9r0
Revises: k4l5m6n7o8p9
Create Date: 2026-06-03

"""
from alembic import op
import sqlalchemy as sa

revision = "m5n6o7p8q9r0"
down_revision = "k4l5m6n7o8p9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "email_2fa_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="false",
            comment="Whether email-based 2FA is enabled at login",
        ),
    )
    op.add_column(
        "email_verification_tokens",
        sa.Column(
            "purpose",
            sa.String(32),
            nullable=False,
            server_default="signup",
            comment="Token purpose: signup or login_2fa",
        ),
    )
    op.create_index(
        "ix_email_verification_tokens_user_id_purpose",
        "email_verification_tokens",
        ["user_id", "purpose"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_email_verification_tokens_user_id_purpose", table_name="email_verification_tokens")
    op.drop_column("email_verification_tokens", "purpose")
    op.drop_column("users", "email_2fa_enabled")
