"""Add widget background and text colors to chatbot_settings

Revision ID: q2r3s4t5u6v7
Revises: 3eb16079f68f
Create Date: 2026-06-08

"""
from alembic import op
import sqlalchemy as sa

revision = "q2r3s4t5u6v7"
down_revision = "3eb16079f68f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "widget_background_color",
            sa.Text(),
            nullable=True,
            comment="Widget chat area background color (hex)",
        ),
    )
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "widget_text_color",
            sa.Text(),
            nullable=True,
            comment="Widget chat area text color (hex)",
        ),
    )


def downgrade() -> None:
    op.drop_column("chatbot_settings", "widget_text_color")
    op.drop_column("chatbot_settings", "widget_background_color")
