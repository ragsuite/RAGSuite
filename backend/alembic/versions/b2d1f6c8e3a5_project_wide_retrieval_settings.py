"""Align Top K and the reranker toggle across a project's settings rows.

Revision ID: b2d1f6c8e3a5
Revises: a1c0e5b7d2f4
Create Date: 2026-10-08

Settings rows are per user, but Chat and the Search widget read the project owner's
row. Copying the owner's values to the other rows keeps runtime behaviour unchanged
and makes every admin's Model Settings show what actually runs. Projects without an
owner row are left as they are.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "b2d1f6c8e3a5"
down_revision = "a1c0e5b7d2f4"
branch_labels = None
depends_on = None

_TABLES = {
    "chatbot_settings": ("chat_top_k", "chat_use_reranker"),
    "search_settings": ("search_top_k", "search_use_reranker"),
}


def _has_columns(table: str, columns: tuple) -> bool:
    insp = inspect(op.get_bind())
    if not insp.has_table(table):
        return False
    existing = {c["name"] for c in insp.get_columns(table)}
    return {"project_id", "user_id", *columns} <= existing


def _owner_value(table: str, column: str) -> str:
    return (
        f"(SELECT o.{column} FROM {table} o JOIN projects p ON p.id = o.project_id "
        f"WHERE o.project_id = {table}.project_id AND o.user_id = p.owner_id ORDER BY o.id LIMIT 1)"
    )


def _align(conn, table: str, top_k: str, reranker: str) -> None:
    conn.execute(
        sa.text(
            f"UPDATE {table} SET {top_k} = {_owner_value(table, top_k)}, "
            f"{reranker} = {_owner_value(table, reranker)} "
            f"WHERE EXISTS (SELECT 1 FROM {table} o JOIN projects p ON p.id = o.project_id "
            f"WHERE o.project_id = {table}.project_id AND o.user_id = p.owner_id)"
        )
    )


def upgrade() -> None:
    bind = op.get_bind()
    for table, (top_k, reranker) in _TABLES.items():
        if _has_columns(table, (top_k, reranker)):
            _align(bind, table, top_k, reranker)


def downgrade() -> None:
    # Per-user values are not recoverable; the aligned values are valid for every row.
    pass
