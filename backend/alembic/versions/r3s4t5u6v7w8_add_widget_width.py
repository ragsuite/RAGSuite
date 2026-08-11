"""Add widget_width to chatbot_settings

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-06-08

"""
from alembic import op
import sqlalchemy as sa

revision = "r3s4t5u6v7w8"
down_revision = "q2r3s4t5u6v7"
branch_labels = None
depends_on = None

DEFAULT_WIDGET_WIDTH = 448


def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "widget_width",
            sa.Integer(),
            nullable=True,
            comment="Custom chat window width in pixels (null = default 448)",
        ),
    )


def downgrade() -> None:
    op.drop_column("chatbot_settings", "widget_width")
