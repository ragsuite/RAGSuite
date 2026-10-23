"""Add MinIO storage_key; allow empty uploaded_documents.text_content.

Revision ID: a0b1c2d3e4f5
Revises: b9d8c7e6f5a4
Create Date: 2026-10-20

Blobs live in MinIO. Postgres keeps metadata (and crawl extracted text).
"""
from alembic import op
import sqlalchemy as sa

revision = "a0b1c2d3e4f5"
down_revision = "b9d8c7e6f5a4"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def upgrade() -> None:
    if not _has_column("uploaded_documents", "storage_key"):
        op.add_column("uploaded_documents", sa.Column("storage_key", sa.String(length=1024), nullable=True))
    if not _has_column("connector_documents", "storage_key"):
        op.add_column("connector_documents", sa.Column("storage_key", sa.String(length=1024), nullable=True))
    try:
        op.alter_column("uploaded_documents", "text_content", existing_type=sa.LargeBinary(), nullable=True)
    except Exception:
        pass


def downgrade() -> None:
    if _has_column("connector_documents", "storage_key"):
        op.drop_column("connector_documents", "storage_key")
    if _has_column("uploaded_documents", "storage_key"):
        op.drop_column("uploaded_documents", "storage_key")
