"""add rl_arm to chat_messages

Revision ID: add_rl_arm_msg
Revises: merge_rl_h1
Create Date: 2026-05-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "add_rl_arm_msg"
down_revision = "merge_rl_h1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "chat_messages",
        sa.Column("rl_arm", sa.String(length=50), nullable=True),
    )


def downgrade():
    op.drop_column("chat_messages", "rl_arm")
