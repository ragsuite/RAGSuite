"""add connector framework tables

Revision ID: r4s5t6u7v8w9
Revises: q1r2s3t4u5v6
Create Date: 2026-06-25 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "r4s5t6u7v8w9"
down_revision = "q1r2s3t4u5v6"
branch_labels = None
depends_on = None

connector_integration_status = postgresql.ENUM(
    "ACTIVE",
    "PAUSED",
    "ERROR",
    "DISCONNECTED",
    name="connectorintegrationstatus",
    create_type=False,
)
connector_sync_job_status = postgresql.ENUM(
    "PENDING",
    "RUNNING",
    "COMPLETED",
    "FAILED",
    name="connectorsyncjobstatus",
    create_type=False,
)


def _ensure_connector_enums() -> None:
    """Create enum types idempotently (safe after partial/failed migration runs)."""
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connectorintegrationstatus') THEN
                CREATE TYPE connectorintegrationstatus AS ENUM (
                    'ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED'
                );
            END IF;
        END$$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connectorsyncjobstatus') THEN
                CREATE TYPE connectorsyncjobstatus AS ENUM (
                    'PENDING', 'RUNNING', 'COMPLETED', 'FAILED'
                );
            END IF;
        END$$;
        """
    )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    _ensure_connector_enums()

    if "connector_project_credentials" not in existing_tables:
        op.create_table(
            "connector_project_credentials",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("connector_type", sa.String(64), nullable=False),
            sa.Column("client_id", sa.String(255), nullable=False),
            sa.Column("client_secret_encrypted", sa.Text(), nullable=False),
            sa.Column("redirect_uri", sa.String(1024), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.UniqueConstraint(
                "user_id", "project_id", "connector_type", name="uq_connector_project_credentials_user_project_type"
            ),
        )
        op.create_index("ix_connector_project_credentials_id", "connector_project_credentials", ["id"])
        op.create_index("ix_connector_project_credentials_user_id", "connector_project_credentials", ["user_id"])
        op.create_index("ix_connector_project_credentials_project_id", "connector_project_credentials", ["project_id"])
        op.create_index("ix_connector_project_credentials_connector_type", "connector_project_credentials", ["connector_type"])

    if "connector_integrations" not in existing_tables:
        op.create_table(
            "connector_integrations",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("connector_type", sa.String(64), nullable=False),
            sa.Column("account_label", sa.String(255), nullable=False, server_default=""),
            sa.Column("access_token", sa.Text(), nullable=False),
            sa.Column("refresh_token", sa.Text(), nullable=False),
            sa.Column("token_expiry", sa.DateTime(timezone=True), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("status", connector_integration_status, nullable=False, server_default="ACTIVE"),
            sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("drive_page_token", sa.String(512), nullable=True),
            sa.Column("documents_indexed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.UniqueConstraint(
                "user_id", "project_id", "connector_type", name="uq_connector_integrations_user_project_type"
            ),
        )
        op.create_index("ix_connector_integrations_id", "connector_integrations", ["id"])
        op.create_index("ix_connector_integrations_user_id", "connector_integrations", ["user_id"])
        op.create_index("ix_connector_integrations_project_id", "connector_integrations", ["project_id"])
        op.create_index("ix_connector_integrations_connector_type", "connector_integrations", ["connector_type"])

    if "connector_sources" not in existing_tables:
        op.create_table(
            "connector_sources",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "integration_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("connector_integrations.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("sources", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if "connector_settings" not in existing_tables:
        op.create_table(
            "connector_settings",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "integration_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("connector_integrations.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("settings", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        )

    if "connector_sync_jobs" not in existing_tables:
        op.create_table(
            "connector_sync_jobs",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "integration_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("connector_integrations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("status", connector_sync_job_status, nullable=False, server_default="PENDING"),
            sa.Column("files_fetched", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("files_indexed", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("files_skipped", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("errors", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("queued_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_connector_sync_jobs_integration_id", "connector_sync_jobs", ["integration_id"])

    if "connector_documents" not in existing_tables:
        op.create_table(
            "connector_documents",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "integration_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("connector_integrations.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("drive_file_id", sa.String(255), nullable=False),
            sa.Column("document_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("content_hash", sa.String(128), nullable=True),
            sa.Column("staging_path", sa.String(1024), nullable=True),
            sa.Column("drive_modified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("trashed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.UniqueConstraint("integration_id", "drive_file_id", name="uq_connector_documents_integration_file"),
        )
        op.create_index("ix_connector_documents_integration_id", "connector_documents", ["integration_id"])
        op.create_index("ix_connector_documents_project_id", "connector_documents", ["project_id"])
        op.create_index("ix_connector_documents_document_id", "connector_documents", ["document_id"])


def downgrade() -> None:
    op.drop_table("connector_documents")
    op.drop_table("connector_sync_jobs")
    op.drop_table("connector_settings")
    op.drop_table("connector_sources")
    op.drop_table("connector_integrations")
    op.drop_table("connector_project_credentials")
    connector_sync_job_status.drop(op.get_bind(), checkfirst=True)
    connector_integration_status.drop(op.get_bind(), checkfirst=True)
