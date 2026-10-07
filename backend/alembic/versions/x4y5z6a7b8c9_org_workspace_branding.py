"""Add org-scoped workspace logo and primary color.

Revision ID: x4y5z6a7b8c9
Revises: w3x4y5z6a7b8
Create Date: 2026-10-07

Stores admin workspace branding on organizations so every member/admin
sees the same logo/name/color. Backfills from the richest per-user
settings row in each org (prefer org_admin).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


revision = "x4y5z6a7b8c9"
down_revision = "w3x4y5z6a7b8"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table(table):
        return False
    cols = {c["name"] for c in inspector.get_columns(table)}
    return column in cols


def upgrade() -> None:
    if not _has_column("organizations", "logo_data_url"):
        op.add_column(
            "organizations",
            sa.Column(
                "logo_data_url",
                sa.Text(),
                nullable=True,
                comment="Org-wide admin workspace logo (data URL); shared by all members",
            ),
        )
    if not _has_column("organizations", "primary_color"):
        op.add_column(
            "organizations",
            sa.Column(
                "primary_color",
                sa.String(length=7),
                nullable=True,
                comment="Org-wide brand primary color hex (e.g. #2E6A4E)",
            ),
        )

    bind = op.get_bind()
    # Portable backfill: prefer org_admin row, then any logo, then any color.
    org_ids = [row[0] for row in bind.execute(text("SELECT id FROM organizations")).fetchall()]
    for org_id in org_ids:
        rows = bind.execute(
            text(
                """
                SELECT s.logo_data_url, s.primary_color, m.role
                FROM settings s
                JOIN users u ON u.id = s.user_id
                LEFT JOIN organization_members m
                  ON m.user_id = u.id AND m.org_id = u.org_id
                WHERE u.org_id = :org_id
                ORDER BY
                  CASE WHEN m.role = 'org_admin' THEN 0 ELSE 1 END,
                  CASE
                    WHEN s.logo_data_url IS NOT NULL AND TRIM(s.logo_data_url) <> '' THEN 0
                    ELSE 1
                  END,
                  s.updated_at DESC
                """
            ),
            {"org_id": org_id},
        ).fetchall()
        logo = None
        color = None
        for logo_data_url, primary_color, _role in rows:
            if logo is None and logo_data_url and str(logo_data_url).strip():
                logo = str(logo_data_url).strip()
            if color is None and primary_color and str(primary_color).strip():
                color = str(primary_color).strip()
            if logo is not None and color is not None:
                break
        if logo is None and color is None:
            continue
        bind.execute(
            text(
                """
                UPDATE organizations
                SET
                  logo_data_url = COALESCE(logo_data_url, :logo),
                  primary_color = COALESCE(primary_color, :color)
                WHERE id = :org_id
                """
            ),
            {"logo": logo, "color": color, "org_id": org_id},
        )


def downgrade() -> None:
    if _has_column("organizations", "primary_color"):
        op.drop_column("organizations", "primary_color")
    if _has_column("organizations", "logo_data_url"):
        op.drop_column("organizations", "logo_data_url")
