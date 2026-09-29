"""Add project_model_providers (Model Configuration module) and seed saved keys.

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-09-29

Seeds one row per (project, hosted provider family) from existing chatbot /
search settings and model_config_profiles so keys users already saved show as
configured without re-entry. api_key values are copied as stored ciphertext
(EncryptedString never double-encrypts).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision = "j0k1l2m3n4o5"
down_revision = "i9j0k1l2m3n4"
branch_labels = None
depends_on = None

TABLE = "project_model_providers"
_HOSTED_FAMILIES = ("openai", "anthropic", "mistral", "gemini")


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
    return None


def _has_table(name: str) -> bool:
    return name in inspect(op.get_bind()).get_table_names()


def _uuid_type():
    if op.get_bind().dialect.name == "postgresql":
        return postgresql.UUID(as_uuid=True)
    return sa.String(36)


def _seed_candidates(bind):
    """Yield candidate rows in priority order: owner chatbot, chatbot, search, profiles."""
    tables = set(inspect(bind).get_table_names())
    if "chatbot_settings" in tables:
        rows = bind.execute(sa.text(
            """
            SELECT c.project_id, c.model_provider, c.chat_model, c.embedding_model, c.api_key,
                   c.chat_temperature, c.chat_top_p, c.chat_best_of,
                   c.chat_frequency_penalty, c.chat_presence_penalty,
                   CASE WHEN p.owner_id = c.user_id THEN 0 ELSE 1 END AS prio
            FROM chatbot_settings c JOIN projects p ON p.id = c.project_id
            WHERE c.api_key IS NOT NULL AND c.api_key <> ''
            ORDER BY prio, c.updated_at DESC
            """
        )).fetchall()
        for r in rows:
            yield r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9]
    if "search_settings" in tables:
        rows = bind.execute(sa.text(
            """
            SELECT project_id, model_provider, search_model, embedding_model, api_key,
                   search_temperature, search_top_p, search_best_of,
                   search_frequency_penalty, search_presence_penalty
            FROM search_settings
            WHERE api_key IS NOT NULL AND api_key <> ''
            ORDER BY updated_at DESC
            """
        )).fetchall()
        for r in rows:
            yield tuple(r)
    if "model_config_profiles" in tables:
        rows = bind.execute(sa.text(
            """
            SELECT project_id, provider, model_name, embedding_model, api_key
            FROM model_config_profiles
            WHERE project_id IS NOT NULL AND api_key IS NOT NULL AND api_key <> ''
            ORDER BY updated_at DESC
            """
        )).fetchall()
        for r in rows:
            yield r[0], r[1], r[2], r[3], r[4], None, None, None, None, None


def _seed(bind) -> None:
    import uuid

    seen = set()
    table = sa.table(
        TABLE,
        sa.column("id", _uuid_type()),
        sa.column("project_id", _uuid_type()),
        sa.column("provider", sa.String),
        sa.column("chat_model", sa.String),
        sa.column("embedding_model", sa.String),
        sa.column("api_key", sa.Text),
        sa.column("temperature", sa.String),
        sa.column("top_p", sa.String),
        sa.column("best_of", sa.Integer),
        sa.column("frequency_penalty", sa.String),
        sa.column("presence_penalty", sa.String),
    )
    inserts = []
    for (project_id, provider, chat_model, embedding_model, api_key,
         temperature, top_p, best_of, freq, presence) in _seed_candidates(bind):
        family = _family(provider)
        if family not in _HOSTED_FAMILIES:
            continue
        key = (str(project_id), family)
        if key in seen:
            continue
        seen.add(key)
        inserts.append({
            "id": uuid.uuid4() if bind.dialect.name == "postgresql" else str(uuid.uuid4()),
            "project_id": project_id,
            "provider": family,
            "chat_model": chat_model or None,
            "embedding_model": None if family == "anthropic" else (embedding_model or None),
            "api_key": api_key,
            "temperature": temperature,
            "top_p": top_p,
            "best_of": best_of,
            "frequency_penalty": freq,
            "presence_penalty": presence,
        })
    if inserts:
        op.bulk_insert(table, inserts)


def upgrade() -> None:
    if _has_table(TABLE):
        return
    uuid_type = _uuid_type()
    op.create_table(
        TABLE,
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column("project_id", uuid_type, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("chat_model", sa.String(100), nullable=True),
        sa.Column("embedding_model", sa.String(100), nullable=True),
        sa.Column("api_key", sa.Text(), nullable=True),
        sa.Column("temperature", sa.String(10), nullable=True),
        sa.Column("top_p", sa.String(10), nullable=True),
        sa.Column("best_of", sa.Integer(), nullable=True),
        sa.Column("frequency_penalty", sa.String(10), nullable=True),
        sa.Column("presence_penalty", sa.String(10), nullable=True),
        sa.Column("last_test_status", sa.String(20), nullable=True),
        sa.Column("last_test_message", sa.Text(), nullable=True),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "provider", name="uq_project_model_provider_project_provider"),
    )
    op.create_index("ix_project_model_providers_id", TABLE, ["id"])
    op.create_index("ix_project_model_providers_project_id", TABLE, ["project_id"])
    _seed(op.get_bind())


def downgrade() -> None:
    if not _has_table(TABLE):
        return
    op.drop_index("ix_project_model_providers_project_id", table_name=TABLE)
    op.drop_index("ix_project_model_providers_id", table_name=TABLE)
    op.drop_table(TABLE)
