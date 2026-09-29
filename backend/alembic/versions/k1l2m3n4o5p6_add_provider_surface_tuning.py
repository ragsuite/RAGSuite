"""Per-surface (Chatbot / Search) tuning on project_model_providers.

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-09-29

Temperature, similarity threshold and max tokens become model-specific with
separate Chatbot and Search values. Columns are nullable and backfilled from
the values widgets use today, so runtime behaviour is unchanged:

- temperatures come from the provider's shared ``temperature`` (else the widget's);
- threshold / max tokens come from the most recently updated widget row in the
  same project whose provider family matches (project owner's row first).

The legacy ``temperature`` column is kept.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "k1l2m3n4o5p6"
down_revision = "j0k1l2m3n4o5"
branch_labels = None
depends_on = None

TABLE = "project_model_providers"
_COLUMNS = (
    ("chat_temperature", sa.String(10)),
    ("search_temperature", sa.String(10)),
    ("chat_similarity_threshold", sa.Float()),
    ("search_similarity_threshold", sa.Float()),
    ("chat_max_tokens", sa.Integer()),
    ("search_max_tokens", sa.Integer()),
)
_WIDGET_TABLES = {"chat": "chatbot_settings", "search": "search_settings"}


def _family(provider):
    key = (provider or "").strip().lower()
    if "google" in key or "gemini" in key:
        return "gemini"
    if "mistral" in key:
        return "mistral"
    if "anthropic" in key or "claude" in key:
        return "anthropic"
    if "openai" in key:
        return "openai"
    if "ollama" in key or "custom" in key:
        return "ollama"
    return None


def _existing_columns(bind) -> set:
    return {c["name"] for c in inspect(bind).get_columns(TABLE)}


def _latest_widget_values(bind, surface: str) -> dict:
    """``{(project_id, family): (temperature, threshold, max_tokens)}`` from the newest widget row."""
    table = _WIDGET_TABLES[surface]
    if table not in set(inspect(bind).get_table_names()):
        return {}
    rows = bind.execute(sa.text(
        f"""
        SELECT w.project_id, w.model_provider, w.{surface}_temperature,
               w.{surface}_similarity_threshold, w.{surface}_max_tokens,
               CASE WHEN p.owner_id = w.user_id THEN 0 ELSE 1 END AS prio
        FROM {table} w JOIN projects p ON p.id = w.project_id
        WHERE w.project_id IS NOT NULL
        ORDER BY prio, w.updated_at DESC
        """
    )).fetchall()
    out: dict = {}
    for project_id, provider, temperature, threshold, max_tokens, _prio in rows:
        key = (str(project_id), _family(provider))
        if key[1] and key not in out:
            out[key] = (temperature, threshold, max_tokens)
    return out


def _backfill(bind) -> None:
    widget_values = {surface: _latest_widget_values(bind, surface) for surface in _WIDGET_TABLES}
    providers = bind.execute(sa.text(f"SELECT id, project_id, provider, temperature FROM {TABLE}")).fetchall()
    for row_id, project_id, provider, temperature in providers:
        values = {}
        for surface in _WIDGET_TABLES:
            widget = widget_values[surface].get((str(project_id), provider))
            w_temp, w_threshold, w_max_tokens = widget or (None, None, None)
            values[f"{surface}_temperature"] = temperature if temperature not in (None, "") else w_temp
            values[f"{surface}_similarity_threshold"] = w_threshold
            values[f"{surface}_max_tokens"] = w_max_tokens
        if all(v is None for v in values.values()):
            continue
        assignments = ", ".join(f"{name} = :{name}" for name in values)
        bind.execute(sa.text(f"UPDATE {TABLE} SET {assignments} WHERE id = :row_id"), {**values, "row_id": row_id})


def upgrade() -> None:
    bind = op.get_bind()
    if TABLE not in set(inspect(bind).get_table_names()):
        return
    existing = _existing_columns(bind)
    added = False
    for name, column_type in _COLUMNS:
        if name not in existing:
            op.add_column(TABLE, sa.Column(name, column_type, nullable=True))
            added = True
    if added:
        _backfill(bind)


def downgrade() -> None:
    bind = op.get_bind()
    if TABLE not in set(inspect(bind).get_table_names()):
        return
    existing = _existing_columns(bind)
    for name, _column_type in reversed(_COLUMNS):
        if name in existing:
            op.drop_column(TABLE, name)
