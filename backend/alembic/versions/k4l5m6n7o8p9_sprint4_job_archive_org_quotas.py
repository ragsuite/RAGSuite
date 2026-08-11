"""Sprint 4: job_archive table + organizations table + org quota columns

Revision ID: k4l5m6n7o8p9
Revises: j3k4l5m6n7o8
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = "k4l5m6n7o8p9"
down_revision = "j3k4l5m6n7o8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Tables may already exist if create_tables() ran before migrations — use IF NOT EXISTS.
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS job_archive (
            id UUID PRIMARY KEY,
            job_type VARCHAR(64) NOT NULL,
            status VARCHAR(32) NOT NULL,
            user_id INTEGER,
            project_id UUID,
            payload JSON,
            result JSON,
            error TEXT,
            attempts INTEGER,
            queued_at TIMESTAMPTZ,
            started_at TIMESTAMPTZ,
            finished_at TIMESTAMPTZ,
            archived_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_job_archive_finished_at ON job_archive (finished_at)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_job_archive_archived_at ON job_archive (archived_at)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_job_archive_job_type ON job_archive (job_type)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_job_archive_user_id ON job_archive (user_id)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS organizations (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(100) NOT NULL UNIQUE,
            max_users INTEGER DEFAULT 0,
            max_projects INTEGER DEFAULT 0,
            max_crawls_per_user INTEGER DEFAULT 0,
            max_queued_ingest_per_project INTEGER DEFAULT 0,
            max_concurrent_ingest_per_project INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """))

    conn.execute(sa.text(
        "INSERT INTO organizations (id, name, slug, max_users, max_projects, max_crawls_per_user, "
        "max_queued_ingest_per_project, max_concurrent_ingest_per_project) "
        "VALUES (1, 'Default', 'default', 0, 0, 0, 0, 0) "
        "ON CONFLICT DO NOTHING"
    ))

    # Add org_id to users only if it doesn't exist yet.
    has_org_id = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='users' AND column_name='org_id'"
    )).fetchone()
    if not has_org_id:
        op.add_column("users", sa.Column("org_id", sa.Integer(), nullable=True))
        conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_users_org_id ON users (org_id)"))
        op.create_foreign_key(
            "fk_users_org_id",
            "users",
            "organizations",
            ["org_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    op.drop_constraint("fk_users_org_id", "users", type_="foreignkey")
    op.drop_index("ix_users_org_id", table_name="users")
    op.drop_column("users", "org_id")
    op.drop_table("organizations")
    op.drop_table("job_archive")
