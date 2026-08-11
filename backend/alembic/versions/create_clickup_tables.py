"""create clickup integration tables

Revision ID: create_clickup_tables
Revises: set_gmail_hourly_cadence
Create Date: 2026-04-22 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "create_clickup_tables"
down_revision = "set_gmail_hourly_cadence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clickupintegrationstatus') THEN
                CREATE TYPE clickupintegrationstatus AS ENUM ('ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED');
            END IF;
        END$$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clickupsyncjobstatus') THEN
                CREATE TYPE clickupsyncjobstatus AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
            END IF;
        END$$;
        """
    )

    op.create_table(
        "clickup_integrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("workspace_id", sa.String(255), nullable=False),
        sa.Column("workspace_name", sa.String(255), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("cadence_minutes", sa.Integer(), server_default=sa.text("60"), nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_task_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("items_indexed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("sync_tasks", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sync_docs", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sync_chats", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "ACTIVE",
                "PAUSED",
                "ERROR",
                "DISCONNECTED",
                name="clickupintegrationstatus",
                create_type=False,
            ),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_clickup_integrations_id", "clickup_integrations", ["id"], unique=False)
    op.create_index("ix_clickup_integrations_user_id", "clickup_integrations", ["user_id"], unique=False)
    op.create_index("ix_clickup_integrations_project_id", "clickup_integrations", ["project_id"], unique=False)

    op.create_table(
        "clickup_sync_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "integration_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clickup_integrations.id"),
            nullable=False,
        ),
        sa.Column(
            "status",
            postgresql.ENUM(
                "PENDING",
                "RUNNING",
                "COMPLETED",
                "FAILED",
                name="clickupsyncjobstatus",
                create_type=False,
            ),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("tasks_fetched", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("tasks_indexed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("docs_fetched", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("docs_indexed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("chats_fetched", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("chats_indexed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("errors", postgresql.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("queued_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_clickup_sync_jobs_id", "clickup_sync_jobs", ["id"], unique=False)
    op.create_index("ix_clickup_sync_jobs_integration_id", "clickup_sync_jobs", ["integration_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_clickup_sync_jobs_integration_id", table_name="clickup_sync_jobs")
    op.drop_index("ix_clickup_sync_jobs_id", table_name="clickup_sync_jobs")
    op.drop_table("clickup_sync_jobs")

    op.drop_index("ix_clickup_integrations_project_id", table_name="clickup_integrations")
    op.drop_index("ix_clickup_integrations_user_id", table_name="clickup_integrations")
    op.drop_index("ix_clickup_integrations_id", table_name="clickup_integrations")
    op.drop_table("clickup_integrations")

    op.execute("DROP TYPE IF EXISTS clickupsyncjobstatus")
    op.execute("DROP TYPE IF EXISTS clickupintegrationstatus")
