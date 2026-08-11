"""add invite lifecycle columns to organization_members

Revision ID: c9d8e7f6a5b4
Revises: u8v9w0x1y2z3
Create Date: 2026-07-08 13:55:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c9d8e7f6a5b4"
down_revision = "u8v9w0x1y2z3"
branch_labels = None
depends_on = None


def _column_exists(conn, table_name: str, column_name: str) -> bool:
    return (
        conn.execute(
            sa.text(
                """
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = :table_name
                  AND column_name = :column_name
                """
            ),
            {"table_name": table_name, "column_name": column_name},
        ).fetchone()
        is not None
    )


def upgrade() -> None:
    conn = op.get_bind()

    invite_status_enum = sa.Enum("pending", "accepted", "revoked", name="invitestatus")
    invite_status_enum.create(conn, checkfirst=True)

    if not _column_exists(conn, "organization_members", "invite_status"):
        op.add_column(
            "organization_members",
            sa.Column(
                "invite_status",
                invite_status_enum,
                nullable=False,
                server_default="accepted",
            ),
        )
    if not _column_exists(conn, "organization_members", "invite_token_hash"):
        op.add_column("organization_members", sa.Column("invite_token_hash", sa.String(length=64), nullable=True))
    if not _column_exists(conn, "organization_members", "invite_expires_at"):
        op.add_column("organization_members", sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True))
    if not _column_exists(conn, "organization_members", "invite_activated_at"):
        op.add_column("organization_members", sa.Column("invite_activated_at", sa.DateTime(timezone=True), nullable=True))

    inspector = sa.inspect(conn)
    existing_indexes = {idx["name"] for idx in inspector.get_indexes("organization_members")}
    if "ix_organization_members_invite_token_hash" not in existing_indexes:
        op.create_index(
            "ix_organization_members_invite_token_hash",
            "organization_members",
            ["invite_token_hash"],
            unique=False,
        )


def downgrade() -> None:
    conn = op.get_bind()

    if _column_exists(conn, "organization_members", "invite_activated_at"):
        op.drop_column("organization_members", "invite_activated_at")
    if _column_exists(conn, "organization_members", "invite_expires_at"):
        op.drop_column("organization_members", "invite_expires_at")
    if _column_exists(conn, "organization_members", "invite_token_hash"):
        op.drop_index("ix_organization_members_invite_token_hash", table_name="organization_members")
        op.drop_column("organization_members", "invite_token_hash")
    if _column_exists(conn, "organization_members", "invite_status"):
        op.drop_column("organization_members", "invite_status")

    invite_status_enum = sa.Enum("pending", "accepted", "revoked", name="invitestatus")
    invite_status_enum.drop(conn, checkfirst=True)
