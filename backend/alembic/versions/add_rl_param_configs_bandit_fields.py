"""add rl arm fields to rl_param_configs

Revision ID: add_rl_bandit_cfg
Revises: add_rl_arm_msg
Create Date: 2026-05-07 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "add_rl_bandit_cfg"
down_revision = "add_rl_arm_msg"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("rl_param_configs", sa.Column("mode", sa.String(length=20), nullable=True))
    op.add_column("rl_param_configs", sa.Column("arm_name", sa.String(length=50), nullable=True))
    op.add_column("rl_param_configs", sa.Column("pull_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("rl_param_configs", sa.Column("reward_sum", sa.Float(), nullable=False, server_default="0"))
    op.add_column(
        "rl_param_configs",
        sa.Column("last_updated", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.execute("UPDATE rl_param_configs SET mode = 'chat' WHERE mode IS NULL")
    op.execute("UPDATE rl_param_configs SET arm_name = 'balanced' WHERE arm_name IS NULL")
    op.execute(
        """
        WITH ranked AS (
            SELECT id, arm_name,
                   ROW_NUMBER() OVER (
                       PARTITION BY project_id, mode, arm_name
                       ORDER BY id
                   ) AS rn
            FROM rl_param_configs
        )
        UPDATE rl_param_configs cfg
        SET arm_name = ranked.arm_name || '_legacy_' || cfg.id::text
        FROM ranked
        WHERE cfg.id = ranked.id
          AND ranked.rn > 1
        """
    )

    op.alter_column("rl_param_configs", "mode", nullable=False)
    op.alter_column("rl_param_configs", "arm_name", nullable=False)

    op.create_unique_constraint(
        "uq_rl_param_configs_project_mode_arm",
        "rl_param_configs",
        ["project_id", "mode", "arm_name"],
    )


def downgrade():
    op.drop_constraint("uq_rl_param_configs_project_mode_arm", "rl_param_configs", type_="unique")
    op.drop_column("rl_param_configs", "last_updated")
    op.drop_column("rl_param_configs", "reward_sum")
    op.drop_column("rl_param_configs", "pull_count")
    op.drop_column("rl_param_configs", "arm_name")
    op.drop_column("rl_param_configs", "mode")
