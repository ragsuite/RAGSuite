"""add gmail project credentials table

Revision ID: add_gmail_project_credentials
Revises: set_gmail_hourly_cadence
Create Date: 2026-05-05 17:45:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "add_gmail_project_credentials"
down_revision = "set_gmail_hourly_cadence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gmail_project_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("client_id", sa.String(length=255), nullable=False),
        sa.Column("client_secret_encrypted", sa.Text(), nullable=False),
        sa.Column("redirect_uri", sa.String(length=1024), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("user_id", "project_id", name="uq_gmail_project_credentials_user_project"),
    )
    op.create_index("ix_gmail_project_credentials_id", "gmail_project_credentials", ["id"])
    op.create_index("ix_gmail_project_credentials_user_id", "gmail_project_credentials", ["user_id"])
    op.create_index("ix_gmail_project_credentials_project_id", "gmail_project_credentials", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_gmail_project_credentials_project_id", table_name="gmail_project_credentials")
    op.drop_index("ix_gmail_project_credentials_user_id", table_name="gmail_project_credentials")
    op.drop_index("ix_gmail_project_credentials_id", table_name="gmail_project_credentials")
    op.drop_table("gmail_project_credentials")
