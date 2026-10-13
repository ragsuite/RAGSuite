"""Add catalog_items (items extracted automatically from crawled pages).

Revision ID: d4f3b8e0a5c7
Revises: c3e2a7d9f4b6
Create Date: 2026-10-09

Additive only: a derived table filled by the CATALOG_EXTRACT job and on ingest.
No existing table or row is touched. Idempotent because ``create_all`` at app
startup may already have created the table.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d4f3b8e0a5c7"
down_revision = "c3e2a7d9f4b6"
branch_labels = None
depends_on = None

TABLE = "catalog_items"


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(TABLE):
        return
    op.create_table(
        TABLE,
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", sa.String(length=64), nullable=False),
        sa.Column("source_id", sa.String(length=64), nullable=False),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column("name_norm", sa.String(length=512), nullable=False),
        sa.Column("brand", sa.String(length=255), nullable=True),
        sa.Column("brand_norm", sa.String(length=255), nullable=True),
        sa.Column("category", sa.String(length=255), nullable=True),
        sa.Column("category_path", sa.JSON(), nullable=True),
        sa.Column("identifiers", sa.JSON(), nullable=True),
        sa.Column("price", sa.Float(), nullable=True),
        sa.Column("list_price", sa.Float(), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=True),
        sa.Column("availability", sa.String(length=64), nullable=True),
        sa.Column("attributes", sa.JSON(), nullable=True),
        sa.Column("variant_group", sa.String(length=255), nullable=True),
        sa.Column("method", sa.String(length=16), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
        sa.Column("extractor_version", sa.SmallInteger(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("ix_catalog_items_project_id", TABLE, ["project_id"])
    op.create_index("ix_catalog_items_source_id", TABLE, ["source_id"])
    op.create_index("ix_catalog_items_project_category", TABLE, ["project_id", "category"])
    op.create_index("ix_catalog_items_project_brand", TABLE, ["project_id", "brand_norm"])
    op.create_index("ix_catalog_items_project_price", TABLE, ["project_id", "price"])


def downgrade() -> None:
    if sa.inspect(op.get_bind()).has_table(TABLE):
        op.drop_table(TABLE)
