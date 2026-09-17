"""Add chatbot widget logo shape and border radius fields.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-09-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "d3e4f5a6b7c8"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    if not _has_column("chatbot_settings", "widget_logo_shape"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_logo_shape",
                sa.String(length=20),
                nullable=True,
                server_default="circle",
                comment="Widget logo chrome: circle or flexible",
            ),
        )
    if not _has_column("chatbot_settings", "widget_logo_border_radius"):
        op.add_column(
            "chatbot_settings",
            sa.Column(
                "widget_logo_border_radius",
                sa.Integer(),
                nullable=True,
                server_default="8",
                comment="Soft corner radius for flexible logo chrome (0-20)",
            ),
        )


def downgrade() -> None:
    for column in ("widget_logo_border_radius", "widget_logo_shape"):
        if _has_column("chatbot_settings", column):
            op.drop_column("chatbot_settings", column)
