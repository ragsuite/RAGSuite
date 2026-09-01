"""add compliance retention policy and deletion receipts

Revision ID: g1h2i3j4k5l6
Revises: d6e7f8a9b0c1
Create Date: 2026-08-31 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "g1h2i3j4k5l6"
down_revision = "d6e7f8a9b0c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    org_cols = {c["name"] for c in inspector.get_columns("organizations")}

    if "retention_auto_delete" not in org_cols:
        op.add_column(
            "organizations",
            sa.Column(
                "retention_auto_delete",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            ),
        )
    if "retention_days" not in org_cols:
        op.add_column(
            "organizations",
            sa.Column(
                "retention_days",
                sa.Integer(),
                nullable=False,
                server_default="90",
            ),
        )
    if "retention_updated_at" not in org_cols:
        op.add_column(
            "organizations",
            sa.Column(
                "retention_updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=True,
            ),
        )
    if "retention_updated_by" not in org_cols:
        op.add_column(
            "organizations",
            sa.Column(
                "retention_updated_by",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    if "retention_last_purge_at" not in org_cols:
        op.add_column(
            "organizations",
            sa.Column(
                "retention_last_purge_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )

    if "deletion_receipts" not in inspector.get_table_names():
        op.create_table(
            "deletion_receipts",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "org_id",
                sa.Integer(),
                sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "project_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("projects.id", ondelete="SET NULL"),
                nullable=True,
                index=True,
            ),
            sa.Column("trigger_type", sa.String(32), nullable=False, index=True),
            sa.Column(
                "initiated_by_user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
                index=True,
            ),
            sa.Column(
                "initiated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
                index=True,
            ),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="pending", index=True),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column(
                "audit_event_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("audit_events.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )

    # Tighten query_logs FK: cascade delete when chat message is removed.
    fk_rows = inspector.get_foreign_keys("query_logs")
    for fk in fk_rows:
        if fk.get("referred_table") == "chat_messages" and "chat_message_id" in (fk.get("constrained_columns") or []):
            op.drop_constraint(fk["name"], "query_logs", type_="foreignkey")
            break
    op.create_foreign_key(
        "fk_query_logs_chat_message_id_cascade",
        "query_logs",
        "chat_messages",
        ["chat_message_id"],
        ["message_id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_query_logs_chat_message_id_cascade", "query_logs", type_="foreignkey")
    op.create_foreign_key(
        "query_logs_chat_message_id_fkey",
        "query_logs",
        "chat_messages",
        ["chat_message_id"],
        ["message_id"],
        ondelete="SET NULL",
    )
    op.drop_table("deletion_receipts")
    for col in (
        "retention_last_purge_at",
        "retention_updated_by",
        "retention_updated_at",
        "retention_days",
        "retention_auto_delete",
    ):
        op.drop_column("organizations", col)
