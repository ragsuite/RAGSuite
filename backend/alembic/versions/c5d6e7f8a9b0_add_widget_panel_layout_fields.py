"""Add chatbot widget backdrop, panel radius, and height settings

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-08-21

"""
from alembic import op
import sqlalchemy as sa

revision = "c5d6e7f8a9b0"
down_revision = "b4c5d6e7f8a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "widget_show_backdrop",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("false"),
            comment="Show dimmed backdrop when chatbot panel is open",
        ),
    )
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "widget_panel_border_radius",
            sa.Integer(),
            nullable=True,
            server_default="20",
            comment="Border radius for chatbot panel chrome in pixels",
        ),
    )
    op.add_column(
        "chatbot_settings",
        sa.Column(
            "widget_height",
            sa.Integer(),
            nullable=True,
            comment="Custom chat window height in pixels (null = auto)",
        ),
    )


def downgrade() -> None:
    op.drop_column("chatbot_settings", "widget_height")
    op.drop_column("chatbot_settings", "widget_panel_border_radius")
    op.drop_column("chatbot_settings", "widget_show_backdrop")
