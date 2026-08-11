"""remove RL tables and columns; add feedback_enabled toggles

Revision ID: remove_rl_feedback_enabled
Revises: 9ef1003b8dc1
Create Date: 2026-05-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "remove_rl_feedback_enabled"
down_revision: Union[str, Sequence[str], None] = "9ef1003b8dc1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Crawl waiting status (from parallel branch a1b2c3d4e5f6_add_crawl_job_waiting_status)
    op.execute("ALTER TYPE crawljobstatus ADD VALUE IF NOT EXISTS 'WAITING'")

    op.add_column(
        "chatbot_settings",
        sa.Column("feedback_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "search_settings",
        sa.Column("feedback_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    op.execute(
        "ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_rl_experience_id_fkey"
    )
    op.execute("ALTER TABLE chat_messages DROP COLUMN IF EXISTS rl_experience_id")
    op.execute("ALTER TABLE chat_messages DROP COLUMN IF EXISTS rl_arm")

    op.execute("DROP TABLE IF EXISTS rl_experiences")
    op.execute("DROP TABLE IF EXISTS rl_param_configs")


def downgrade() -> None:
    op.create_table(
        "rl_param_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("arm_name", sa.String(length=50), nullable=False),
        sa.Column("pull_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reward_sum", sa.Float(), nullable=False, server_default="0"),
        sa.Column("last_updated", sa.DateTime(timezone=True), nullable=False),
        sa.Column("params", sa.JSON(), nullable=True),
        sa.Column("n_pulls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_reward", sa.Float(), nullable=False, server_default="0"),
        sa.Column("mean_reward", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "mode", "arm_name", name="uq_rl_param_configs_project_mode_arm"),
    )
    op.create_index("ix_rl_param_configs_project_id", "rl_param_configs", ["project_id"])

    op.create_table(
        "rl_experiences",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("chat_message_id", sa.UUID(), nullable=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("param_config_id", sa.Integer(), nullable=False),
        sa.Column("retrieval_meta", sa.JSON(), nullable=True),
        sa.Column("reward", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("feedback_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["chat_message_id"], ["chat_messages.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["param_config_id"], ["rl_param_configs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rl_experiences_project_id", "rl_experiences", ["project_id"])

    op.add_column("chat_messages", sa.Column("rl_arm", sa.String(length=50), nullable=True))
    op.add_column("chat_messages", sa.Column("rl_experience_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "chat_messages_rl_experience_id_fkey",
        "chat_messages",
        "rl_experiences",
        ["rl_experience_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.drop_column("search_settings", "feedback_enabled")
    op.drop_column("chatbot_settings", "feedback_enabled")
