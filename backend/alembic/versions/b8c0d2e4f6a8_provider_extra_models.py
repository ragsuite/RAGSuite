"""ASR / rerank / TTS / OCR model columns on project_model_providers.

Revision ID: b8c0d2e4f6a8
Revises: a7c9e1b3d5f7
Create Date: 2026-10-22
"""
from alembic import op
import sqlalchemy as sa

revision = "b8c0d2e4f6a8"
down_revision = "a7c9e1b3d5f7"
branch_labels = None
depends_on = None

TABLE = "project_model_providers"


def _has_column(table: str, column: str) -> bool:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table):
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def _add(table: str, column: str, col: sa.Column) -> None:
    if not _has_column(table, column):
        op.add_column(table, col)


def _widen(table: str, column: str, length: int) -> None:
    if not _has_column(table, column):
        return
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    op.alter_column(table, column, type_=sa.String(length=length), existing_nullable=True)


def upgrade() -> None:
    _add(TABLE, "asr_model", sa.Column("asr_model", sa.String(length=255), nullable=True))
    _add(TABLE, "tts_model", sa.Column("tts_model", sa.String(length=255), nullable=True))
    _add(TABLE, "rerank_model", sa.Column("rerank_model", sa.String(length=255), nullable=True))
    _add(TABLE, "ocr_model", sa.Column("ocr_model", sa.String(length=255), nullable=True))
    _widen(TABLE, "chat_model", 255)
    _widen(TABLE, "embedding_model", 255)
    _widen(TABLE, "provider", 80)


def downgrade() -> None:
    for column in ("ocr_model", "rerank_model", "tts_model", "asr_model"):
        if _has_column(TABLE, column):
            op.drop_column(TABLE, column)
