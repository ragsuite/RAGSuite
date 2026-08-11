"""Add embed_secret to integration_embeds

Revision ID: p1q2r3s4t5u6
Revises: m5n6o7p8q9r0
Create Date: 2026-06-05

"""
from alembic import op
import sqlalchemy as sa

revision = "p1q2r3s4t5u6"
down_revision = "m5n6o7p8q9r0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "integration_embeds",
        sa.Column(
            "embed_secret",
            sa.String(length=64),
            nullable=True,
            comment="HMAC secret for signed embed tokens",
        ),
    )


def downgrade() -> None:
    op.drop_column("integration_embeds", "embed_secret")
