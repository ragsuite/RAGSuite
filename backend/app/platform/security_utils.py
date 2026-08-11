"""
Security utilities.

- SSRF protection for user-supplied URLs.
- Signed OAuth state creation/verification with replay protection.
"""
import base64
import hashlib
import hmac
import ipaddress
import json
import socket
import threading
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional, Tuple
from urllib.parse import urlparse

from fastapi import HTTPException
from cryptography.fernet import Fernet, InvalidToken

from .settings import settings

_OAUTH_USED_NONCES = {}
_OAUTH_CODE_VERIFIERS: Dict[str, Tuple[str, int]] = {}
_OAUTH_NONCES_LOCK = threading.Lock()


def _get_redis_client():
    """Return a Redis client on DB 1 (nonce store) or None if Redis not configured."""
    try:
        import re
        import redis as _redis

        from ..services.infra_env import redis_url_or_none

        redis_url = redis_url_or_none(db=1)
        if not redis_url:
            return None
        base = re.sub(r"/\d+$", "", redis_url)
        client = _redis.from_url(f"{base}/1", socket_timeout=1, socket_connect_timeout=1)
        client.ping()
        return client
    except Exception:
        return None


def block_ssrf(url: str) -> None:
    """Raise HTTP 400 if the URL resolves to a private, loopback, link-local, or reserved address.
    Checks ALL resolved addresses (IPv4 + IPv6) to prevent bypass via IPv6 loopback or private ranges."""
    try:
        hostname = urlparse(str(url)).hostname
        if not hostname:
            raise ValueError("No hostname")
        # getaddrinfo returns all addresses (IPv4 + IPv6) unlike gethostbyname which is IPv4-only
        all_addrs = socket.getaddrinfo(hostname, None)
        if not all_addrs:
            raise ValueError("No addresses resolved")
        for _, _, _, _, sockaddr in all_addrs:
            ip = ipaddress.ip_address(sockaddr[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                raise HTTPException(status_code=400, detail="URL targets a restricted address.")
    except HTTPException:
        raise
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Invalid or unresolvable URL.")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or unresolvable URL.")


def _urlsafe_b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _urlsafe_b64decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode((raw + padding).encode("utf-8"))


def _get_oauth_state_secret() -> str:
    return settings.oauth_state_secret or settings.jwt_secret_key


def _mark_nonce_used(jti: str, exp_ts: int) -> bool:
    """
    Mark nonce as used once.
    Returns False if the nonce was already consumed (replay).
    Uses Redis when available (safe across workers); falls back to in-memory.
    """
    redis = _get_redis_client()
    if redis is not None:
        try:
            now_ts = int(datetime.now(timezone.utc).timestamp())
            ttl = max(1, int(exp_ts) - now_ts)
            # SET NX: only set if key does not exist. Returns True on first use, None on replay.
            result = redis.set(f"oauth_nonce:{jti}", "1", ex=ttl, nx=True)
            return result is not None
        except Exception:
            pass  # Redis error — fall through to in-memory

    now_ts = int(datetime.now(timezone.utc).timestamp())
    with _OAUTH_NONCES_LOCK:
        expired_keys = [key for key, expiry in _OAUTH_USED_NONCES.items() if expiry <= now_ts]
        for key in expired_keys:
            _OAUTH_USED_NONCES.pop(key, None)
        if jti in _OAUTH_USED_NONCES:
            return False
        _OAUTH_USED_NONCES[jti] = exp_ts
        return True


def store_oauth_code_verifier(state: str, verifier: str) -> None:
    """Store PKCE code_verifier keyed by OAuth state (shared across workers when Redis is available)."""
    if not state or not verifier:
        return
    ttl = max(60, int(settings.oauth_state_ttl_seconds))
    redis = _get_redis_client()
    if redis is not None:
        try:
            redis.setex(f"oauth_pkce:{state}", ttl, verifier)
            return
        except Exception:
            pass
    now_ts = int(datetime.now(timezone.utc).timestamp())
    exp_ts = now_ts + ttl
    with _OAUTH_NONCES_LOCK:
        expired_keys = [key for key, (_, expiry) in _OAUTH_CODE_VERIFIERS.items() if expiry <= now_ts]
        for key in expired_keys:
            _OAUTH_CODE_VERIFIERS.pop(key, None)
        _OAUTH_CODE_VERIFIERS[state] = (verifier, exp_ts)


def pop_oauth_code_verifier(state: str) -> Optional[str]:
    """Retrieve and delete stored PKCE code_verifier for OAuth state."""
    if not state:
        return None
    redis = _get_redis_client()
    if redis is not None:
        try:
            key = f"oauth_pkce:{state}"
            verifier = redis.get(key)
            if verifier is not None:
                redis.delete(key)
                return verifier.decode("utf-8") if isinstance(verifier, bytes) else str(verifier)
        except Exception:
            pass
    now_ts = int(datetime.now(timezone.utc).timestamp())
    with _OAUTH_NONCES_LOCK:
        entry = _OAUTH_CODE_VERIFIERS.pop(state, None)
        if not entry:
            return None
        verifier, exp_ts = entry
        if now_ts > exp_ts:
            return None
        return verifier


def create_oauth_state(provider: str, user_id: int, project_id: str) -> str:
    """
    Create a signed OAuth state token.
    Format: <payload_b64>.<signature_b64>
    """
    now_ts = int(datetime.now(timezone.utc).timestamp())
    ttl = max(60, int(settings.oauth_state_ttl_seconds))
    payload = {
        "provider": provider,
        "user_id": int(user_id),
        "project_id": str(project_id),
        "iat": now_ts,
        "exp": now_ts + ttl,
        "jti": uuid.uuid4().hex,
    }
    payload_b64 = _urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    secret = _get_oauth_state_secret().encode("utf-8")
    signature = hmac.new(secret, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    signature_b64 = _urlsafe_b64encode(signature)
    return f"{payload_b64}.{signature_b64}"


def verify_oauth_state(state: str, expected_provider: str) -> dict:
    """Verify signed OAuth state and enforce expiry/provider/replay checks."""
    try:
        payload_b64, signature_b64 = state.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    secret = _get_oauth_state_secret().encode("utf-8")
    expected_sig = hmac.new(secret, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    provided_sig = _urlsafe_b64decode(signature_b64)
    if not hmac.compare_digest(provided_sig, expected_sig):
        raise HTTPException(status_code=400, detail="Invalid OAuth state signature")

    try:
        payload = json.loads(_urlsafe_b64decode(payload_b64).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid OAuth state payload")

    provider = payload.get("provider")
    user_id = payload.get("user_id")
    project_id = payload.get("project_id")
    exp_ts = payload.get("exp")
    jti = payload.get("jti")

    if provider != expected_provider:
        raise HTTPException(status_code=400, detail="OAuth state provider mismatch")
    if not user_id or not project_id or not exp_ts or not jti:
        raise HTTPException(status_code=400, detail="OAuth state missing required fields")
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if now_ts > int(exp_ts):
        raise HTTPException(status_code=400, detail="OAuth state expired")
    if not _mark_nonce_used(str(jti), int(exp_ts)):
        raise HTTPException(status_code=400, detail="OAuth state already used")

    return {"user_id": int(user_id), "project_id": str(project_id)}


def _build_fernet() -> Fernet:
    """
    Build a Fernet cipher from configured key material.
    Falls back to JWT/OAuth secret-derived key when explicit key is absent.
    """
    raw_key = (
        settings.gmail_credentials_encryption_key
        or settings.oauth_state_secret
        or settings.jwt_secret_key
    )
    key_bytes = hashlib.sha256(raw_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def encrypt_secret(plaintext: str) -> str:
    if not plaintext:
        raise ValueError("Secret cannot be empty")
    return _build_fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    if not ciphertext:
        raise ValueError("Encrypted secret cannot be empty")
    try:
        return _build_fernet().decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise HTTPException(status_code=500, detail="Failed to decrypt stored Gmail credentials") from exc


def safe_decrypt_secret(value: str) -> str:
    """Decrypt if Fernet-encrypted; return as-is if plaintext (migration safety net)."""
    if not value:
        return value
    try:
        return _build_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except (InvalidToken, Exception):
        return value


# ---------------------------------------------------------------------------
# SQLAlchemy TypeDecorator — transparent encrypt/decrypt for ORM columns
# ---------------------------------------------------------------------------
from sqlalchemy import types as _sa_types


class EncryptedString(_sa_types.TypeDecorator):
    """ORM column type that encrypts on write and decrypts on read automatically."""

    impl = _sa_types.Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if not value:
            return value
        try:
            _build_fernet().decrypt(value.encode("utf-8"))
            return value  # already encrypted — don't double-encrypt
        except (InvalidToken, Exception):
            return encrypt_secret(value)

    def process_result_value(self, value, dialect):
        return safe_decrypt_secret(value) if value else value
