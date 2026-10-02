"""Add project_retention_policies (per-project data retention, Enterprise ``compliance``).

Revision ID: a7c3e9f1b2d4
Revises: o5p6q7r8s9t0
Create Date: 2026-10-02

Additive only. Each project inherits its organization's current org-wide
retention settings so existing purge behaviour is unchanged: projects without
``org_id`` were never purged by the org job, so they keep auto-delete off and
only inherit the window from their owner's organization. The deprecated
``organizations.retention_*`` columns are kept; nothing is dropped. Idempotent
because ``create_all`` on a fresh database may already have created the table.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a7c3e9f1b2d4"
down_revision = "o5p6q7r8s9t0"
branch_labels = None
depends_on = None

TABLE = "project_retention_policies"
DEPRECATED_ORG_COLUMNS = (
    "retention_auto_delete",
    "retention_days",
    "retention_updated_at",
    "retention_last_purge_at",
)

SEED_FROM_ORG_POLICY = f"""
INSERT INTO {TABLE} (project_id, auto_delete, retention_days, updated_at, updated_by, last_purge_at)
SELECT
    p.id,
    CASE WHEN p.org_id IS NULL THEN false ELSE COALESCE(o.retention_auto_delete, false) END,
    CASE
        WHEN COALESCE(o.retention_days, 90) < 7 THEN 7
        WHEN COALESCE(o.retention_days, 90) > 365 THEN 365
        ELSE COALESCE(o.retention_days, 90)
    END,
    o.retention_updated_at,
    o.retention_updated_by,
    CASE WHEN p.org_id IS NULL THEN NULL ELSE o.retention_last_purge_at END
FROM projects p
LEFT JOIN users u ON u.id = p.owner_id
LEFT JOIN organizations o
    ON o.id = COALESCE(p.org_id, u.org_id, (SELECT MIN(id) FROM organizations))
WHERE NOT EXISTS (SELECT 1 FROM {TABLE} r WHERE r.project_id = p.id)
"""


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(TABLE):
        op.create_table(
            TABLE,
            sa.Column(
                "project_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("projects.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("auto_delete", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("retention_days", sa.Integer(), nullable=False, server_default="90"),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "updated_by",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("last_purge_at", sa.DateTime(timezone=True), nullable=True),
        )

    org_cols = {c["name"] for c in inspector.get_columns("organizations")}
    if "retention_auto_delete" in org_cols and "retention_days" in org_cols:
        op.execute(sa.text(SEED_FROM_ORG_POLICY))

    if bind.dialect.name == "postgresql":
        for column in DEPRECATED_ORG_COLUMNS:
            if column in org_cols:
                op.execute(
                    sa.text(
                        f"COMMENT ON COLUMN organizations.{column} "
                        "IS 'Deprecated: see project_retention_policies'"
                    )
                )


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(TABLE):
        op.drop_table(TABLE)
