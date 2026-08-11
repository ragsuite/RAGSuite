"""Add embed_secret to integration_embeds (orphaned branch fix)

Revision ID: o9p0q1r2s3t4
Revises: n8p9q0r1s2t3
Create Date: 2026-06-15

"""
from alembic import op
import sqlalchemy as sa

revision = "o9p0q1r2s3t4"
down_revision = "n8p9q0r1s2t3"
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
