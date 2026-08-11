"""add RL bandit tables and rl_experience_id on chat_messages

Revision ID: add_rl_tables
Revises: set_gmail_hourly_cadence
Create Date: 2026-05-07 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "add_rl_tables"
down_revision = "7f0f1b4c9a12"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rl_param_configs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("n_pulls", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_reward", sa.Float(), nullable=False, server_default="0"),
        sa.Column("mean_reward", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_rl_param_configs_project_id", "rl_param_configs", ["project_id"])

    op.create_table(
        "rl_experiences",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "chat_message_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("chat_messages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("param_config_id", sa.Integer(), sa.ForeignKey("rl_param_configs.id"), nullable=False),
        sa.Column("retrieval_meta", sa.JSON(), nullable=True),
        sa.Column("reward", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("feedback_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_rl_experiences_project_id", "rl_experiences", ["project_id"])

    op.add_column(
        "chat_messages",
        sa.Column(
            "rl_experience_id",
            sa.Integer(),
            sa.ForeignKey("rl_experiences.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("chat_messages", "rl_experience_id")
    op.drop_table("rl_experiences")
    op.drop_table("rl_param_configs")
