"""SSO state management (Redis-backed with in-memory fallback)."""

from __future__ import annotations

import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from app.security_utils import _get_redis_client, store_oauth_code_verifier, pop_oauth_code_verifier
from app.settings import settings


SSO_STATE_PREFIX = "sso:state:"
SSO_STATE_TTL_SECONDS = 600


@dataclass
class SsoStatePayload:
    org_id: int
    org_slug: str
    nonce: str
    code_verifier: str
    frontend_base_url: str | None = None
    redirect_uri: str | None = None


def _state_ttl() -> int:
    return max(60, int(settings.oauth_state_ttl_seconds or SSO_STATE_TTL_SECONDS))


def _require_redis_if_configured() -> None:
    if not settings.sso_require_redis:
        return
    if _get_redis_client() is None:
        raise HTTPException(status_code=503, detail="SSO is temporarily unavailable.")


def create_sso_state(
    org_id: int,
    org_slug: str,
    *,
    frontend_base_url: str | None = None,
    redirect_uri: str | None = None,
) -> tuple[str, str, str]:
    """Return (state, nonce, code_verifier)."""
    _require_redis_if_configured()
    state = uuid.uuid4().hex
    nonce = secrets.token_urlsafe(24)
    code_verifier = secrets.token_urlsafe(48)
    payload = SsoStatePayload(
        org_id=org_id,
        org_slug=org_slug,
        nonce=nonce,
        code_verifier=code_verifier,
        frontend_base_url=frontend_base_url,
        redirect_uri=redirect_uri,
    )
    ttl = _state_ttl()
    redis = _get_redis_client()
    if redis is not None:
        try:
            redis.setex(
                f"{SSO_STATE_PREFIX}{state}",
                ttl,
                json.dumps(
                    {
                        "org_id": payload.org_id,
                        "org_slug": payload.org_slug,
                        "nonce": payload.nonce,
                        "frontend_base_url": payload.frontend_base_url,
                        "redirect_uri": payload.redirect_uri,
                    }
                ),
            )
            store_oauth_code_verifier(state, code_verifier)
            return state, nonce, code_verifier
        except Exception:
            if settings.sso_require_redis:
                raise HTTPException(status_code=503, detail="SSO is temporarily unavailable.") from None

    # In-memory fallback for single-worker dev
    now_ts = int(datetime.now(timezone.utc).timestamp())
    exp_ts = now_ts + ttl
    store_oauth_code_verifier(state, code_verifier)
    _SSO_STATE_MEMORY[state] = (payload, exp_ts)
    return state, nonce, code_verifier


_SSO_STATE_MEMORY: dict[str, tuple[SsoStatePayload, int]] = {}


def consume_sso_state(state: str) -> SsoStatePayload:
    """Validate and delete SSO state; return stored payload."""
    if not state:
        raise HTTPException(status_code=400, detail="Invalid SSO state")
    _require_redis_if_configured()
    redis = _get_redis_client()
    if redis is not None:
        try:
            key = f"{SSO_STATE_PREFIX}{state}"
            raw = redis.get(key)
            if raw is None:
                raise HTTPException(status_code=400, detail="Invalid or expired SSO state")
            redis.delete(key)
            data = json.loads(raw.decode("utf-8") if isinstance(raw, bytes) else raw)
            code_verifier = pop_oauth_code_verifier(state)
            if not code_verifier:
                raise HTTPException(status_code=400, detail="Invalid or expired SSO state")
            return SsoStatePayload(
                org_id=int(data["org_id"]),
                org_slug=str(data["org_slug"]),
                nonce=str(data["nonce"]),
                code_verifier=code_verifier,
                frontend_base_url=str(data.get("frontend_base_url") or "") or None,
                redirect_uri=str(data.get("redirect_uri") or "") or None,
            )
        except HTTPException:
            raise
        except Exception:
            if settings.sso_require_redis:
                raise HTTPException(status_code=503, detail="SSO is temporarily unavailable.") from None

    now_ts = int(datetime.now(timezone.utc).timestamp())
    entry = _SSO_STATE_MEMORY.pop(state, None)
    if not entry:
        raise HTTPException(status_code=400, detail="Invalid or expired SSO state")
    payload, exp_ts = entry
    if now_ts > exp_ts:
        raise HTTPException(status_code=400, detail="Invalid or expired SSO state")
    code_verifier = pop_oauth_code_verifier(state)
    if not code_verifier:
        raise HTTPException(status_code=400, detail="Invalid or expired SSO state")
    return SsoStatePayload(
        org_id=payload.org_id,
        org_slug=payload.org_slug,
        nonce=payload.nonce,
        code_verifier=code_verifier or payload.code_verifier,
        frontend_base_url=payload.frontend_base_url,
        redirect_uri=payload.redirect_uri,
    )
