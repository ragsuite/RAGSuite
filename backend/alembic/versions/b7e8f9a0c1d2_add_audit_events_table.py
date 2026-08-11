"""add_audit_events_table

Revision ID: b7e8f9a0c1d2
Revises: f7e8d9c0b1a2
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b7e8f9a0c1d2"
down_revision = "f7e8d9c0b1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("api_key_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("action", sa.String(length=255), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=True),
        sa.Column("resource_id", sa.String(length=255), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("details", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["api_key_id"], ["api_keys.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_timestamp", "audit_events", ["timestamp"], unique=False)
    op.create_index("ix_audit_events_project_id", "audit_events", ["project_id"], unique=False)
    op.create_index("ix_audit_events_user_id", "audit_events", ["user_id"], unique=False)
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"], unique=False)
    op.create_index("ix_audit_events_category", "audit_events", ["category"], unique=False)
    op.create_index(
        "ix_audit_events_project_timestamp",
        "audit_events",
        ["project_id", "timestamp"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_audit_events_project_timestamp", table_name="audit_events")
    op.drop_index("ix_audit_events_category", table_name="audit_events")
    op.drop_index("ix_audit_events_event_type", table_name="audit_events")
    op.drop_index("ix_audit_events_user_id", table_name="audit_events")
    op.drop_index("ix_audit_events_project_id", table_name="audit_events")
    op.drop_index("ix_audit_events_timestamp", table_name="audit_events")
    op.drop_table("audit_events")
