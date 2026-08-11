"""Encrypt sensitive fields: TOTP secrets, Gmail OAuth tokens, LLM API keys

Revision ID: f9e8d7c6b5a4
Revises: e8f2a1b3c4d5, r3s4t5u6v7w8
Create Date: 2026-06-09

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.orm import Session

revision: str = "f9e8d7c6b5a4"
down_revision: Union[str, tuple, None] = ("e8f2a1b3c4d5", "r3s4t5u6v7w8")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _get_fernet():
    import base64, hashlib, os, sys
    from cryptography.fernet import Fernet
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
    from app.settings import settings
    raw_key = (
        settings.gmail_credentials_encryption_key
        or settings.oauth_state_secret
        or settings.jwt_secret_key
    )
    key_bytes = hashlib.sha256(raw_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def _encrypt_if_plaintext(fernet, value: str) -> str:
    if not value:
        return value
    try:
        fernet.decrypt(value.encode("utf-8"))
        return value  # already encrypted
    except Exception:
        return fernet.encrypt(value.encode("utf-8")).decode("utf-8")


def upgrade() -> None:
    # Widen api_key columns to TEXT before writing encrypted values (encrypted
    # strings are ~172 chars, which exceeds VARCHAR(255) only with base64
    # overhead on long keys — safer to widen first unconditionally).
    for table in ("chatbot_settings", "search_settings", "llm_configs", "model_config_profiles"):
        op.alter_column(table, "api_key",
                        existing_type=sa.String(255),
                        type_=sa.Text(),
                        existing_nullable=True)

    fernet = _get_fernet()
    bind = op.get_bind()
    session = Session(bind=bind)

    # users.totp_secret
    rows = session.execute(
        sa.text("SELECT id, totp_secret FROM users WHERE totp_secret IS NOT NULL")
    ).fetchall()
    for row in rows:
        encrypted = _encrypt_if_plaintext(fernet, row.totp_secret)
        if encrypted != row.totp_secret:
            session.execute(
                sa.text("UPDATE users SET totp_secret = :enc WHERE id = :id"),
                {"enc": encrypted, "id": row.id},
            )

    # gmail_integrations: access_token + refresh_token
    rows = session.execute(
        sa.text("SELECT id, access_token, refresh_token FROM gmail_integrations")
    ).fetchall()
    for row in rows:
        enc_access = _encrypt_if_plaintext(fernet, row.access_token) if row.access_token else row.access_token
        enc_refresh = _encrypt_if_plaintext(fernet, row.refresh_token) if row.refresh_token else row.refresh_token
        if enc_access != row.access_token or enc_refresh != row.refresh_token:
            session.execute(
                sa.text(
                    "UPDATE gmail_integrations SET access_token = :at, refresh_token = :rt WHERE id = :id"
                ),
                {"at": enc_access, "rt": enc_refresh, "id": row.id},
            )

    # chatbot_settings.api_key
    rows = session.execute(
        sa.text("SELECT id, api_key FROM chatbot_settings WHERE api_key IS NOT NULL AND api_key != ''")
    ).fetchall()
    for row in rows:
        encrypted = _encrypt_if_plaintext(fernet, row.api_key)
        if encrypted != row.api_key:
            session.execute(
                sa.text("UPDATE chatbot_settings SET api_key = :enc WHERE id = :id"),
                {"enc": encrypted, "id": row.id},
            )

    # search_settings.api_key
    rows = session.execute(
        sa.text("SELECT id, api_key FROM search_settings WHERE api_key IS NOT NULL AND api_key != ''")
    ).fetchall()
    for row in rows:
        encrypted = _encrypt_if_plaintext(fernet, row.api_key)
        if encrypted != row.api_key:
            session.execute(
                sa.text("UPDATE search_settings SET api_key = :enc WHERE id = :id"),
                {"enc": encrypted, "id": row.id},
            )

    # llm_configs.api_key
    rows = session.execute(
        sa.text("SELECT id, api_key FROM llm_configs WHERE api_key IS NOT NULL AND api_key != ''")
    ).fetchall()
    for row in rows:
        encrypted = _encrypt_if_plaintext(fernet, row.api_key)
        if encrypted != row.api_key:
            session.execute(
                sa.text("UPDATE llm_configs SET api_key = :enc WHERE id = :id"),
                {"enc": encrypted, "id": row.id},
            )

    # model_config_profiles.api_key
    rows = session.execute(
        sa.text("SELECT id, api_key FROM model_config_profiles WHERE api_key IS NOT NULL AND api_key != ''")
    ).fetchall()
    for row in rows:
        encrypted = _encrypt_if_plaintext(fernet, row.api_key)
        if encrypted != row.api_key:
            session.execute(
                sa.text("UPDATE model_config_profiles SET api_key = :enc WHERE id = :id"),
                {"enc": encrypted, "id": row.id},
            )

    session.commit()


def downgrade() -> None:
    pass
