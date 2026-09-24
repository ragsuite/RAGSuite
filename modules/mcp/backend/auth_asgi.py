"""Request-scoped auth for the outbound MCP Streamable HTTP mount."""
from __future__ import annotations

import contextvars
import hashlib
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)

_mcp_auth_ctx: contextvars.ContextVar[Optional["McpAuthContext"]] = contextvars.ContextVar(
    "ragsuite_mcp_auth", default=None
)


MCP_KEY_SCOPE = "mcp_user"
PROJECT_KEY_REJECTED = (
    "Use the MCP key from Management → MCP. Project API keys are not accepted here."
)


@dataclass(frozen=True)
class McpAuthContext:
    """project_id is the active project for a personal MCP key (empty until set)."""

    project_id: str
    api_key_id: Any
    user_id: Optional[int] = None
    rate_limit: Optional[int] = None
    workspace: bool = False


def get_mcp_auth() -> McpAuthContext:
    ctx = _mcp_auth_ctx.get()
    if ctx is None:
        raise PermissionError("MCP request is not authenticated with a project API key")
    return ctx


def _extract_bearer(scope: Scope) -> Optional[str]:
    headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
    auth = headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def _assert_mcp_rate_limit(api_key_id: Any, rate_limit: Optional[int]) -> Optional[str]:
    """Return error detail when over limit; None when allowed."""
    if not rate_limit or int(rate_limit) <= 0:
        return None
    limit = int(rate_limit)
    key = f"mcp:{api_key_id}"
    try:
        from app.services.redis_client import get_redis

        redis = get_redis()
        if redis:
            count = int(redis.incr(key))
            if count == 1:
                redis.expire(key, 3600)
            if count > limit:
                return f"MCP rate limit exceeded ({limit} requests/hour for this API key)"
            return None
    except Exception as exc:
        logger.debug("MCP rate limit redis fallback: %s", exc)

    import time

    now = time.time()
    bucket = getattr(_assert_mcp_rate_limit, "_memory", None)
    if bucket is None:
        bucket = {}
        _assert_mcp_rate_limit._memory = bucket  # type: ignore[attr-defined]
    hits = [t for t in bucket.get(key, []) if now - t < 3600]
    if len(hits) >= limit:
        return f"MCP rate limit exceeded ({limit} requests/hour for this API key)"
    hits.append(now)
    bucket[key] = hits
    return None


def _resolve_api_key(token: str) -> tuple[Optional[McpAuthContext], Optional[str]]:
    """Return (context, error_detail). Project API keys are rejected."""
    from app.db import SessionLocal
    from app.models import APIKey

    if not (token.startswith("rgs_live_") or token.startswith("rgs_test_")):
        return None, "Invalid or inactive MCP key"
    db = SessionLocal()
    try:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        api_key = (
            db.query(APIKey).filter(APIKey.key_hash == token_hash).first()
            or db.query(APIKey).filter(APIKey.key == token).first()
        )
        if not api_key or not api_key.is_active:
            return None, "Invalid or inactive MCP key"
        if api_key.expires_at and api_key.expires_at < datetime.utcnow():
            return None, "Invalid or inactive MCP key"
        scope = getattr(api_key, "key_scope", None) or "project"
        if scope != MCP_KEY_SCOPE:
            return None, PROJECT_KEY_REJECTED

        try:
            api_key.request_count = int(getattr(api_key, "request_count", 0) or 0) + 1
            api_key.last_used_at = datetime.utcnow()
            db.add(api_key)
            db.commit()
        except Exception:
            logger.debug("MCP API key usage bump failed", exc_info=True)
            try:
                db.rollback()
            except Exception:
                pass

        active = getattr(api_key, "mcp_active_project_id", None)
        return (
            McpAuthContext(
                project_id=str(active) if active else "",
                api_key_id=api_key.id,
                user_id=getattr(api_key, "created_by_id", None),
                rate_limit=getattr(api_key, "rate_limit", None),
                workspace=True,
            ),
            None,
        )
    finally:
        db.close()


class McpApiKeyAuthMiddleware:
    """Require Bearer project API key on MCP Streamable HTTP traffic."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        # Allow CORS preflight through without a key.
        if scope.get("type") == "http" and scope.get("method") == "OPTIONS":
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers") or []}
        from .access import mcp_client_name, mcp_request_id

        client = headers.get("user-agent") or headers.get("x-mcp-client")
        mcp_client_name.set((client or "")[:200] or None)
        mcp_request_id.set(uuid.uuid4().hex[:12])
        token = _extract_bearer(scope)
        if not token:
            response = JSONResponse(
                {"detail": "Authorization Bearer MCP key required"},
                status_code=401,
            )
            await response(scope, receive, send)
            return

        reject_detail = "Invalid or inactive MCP key"
        try:
            ctx, reject_detail = _resolve_api_key(token)
        except Exception:
            logger.exception("MCP API key resolution failed")
            ctx = None

        if ctx is None:
            response = JSONResponse(
                {"detail": reject_detail or "Invalid or inactive MCP key"},
                status_code=401,
            )
            await response(scope, receive, send)
            return

        rate_err = _assert_mcp_rate_limit(ctx.api_key_id, ctx.rate_limit)
        if rate_err:
            response = JSONResponse({"detail": rate_err}, status_code=429)
            await response(scope, receive, send)
            return

        token_reset = _mcp_auth_ctx.set(ctx)
        try:
            await self.app(scope, receive, send)
        finally:
            _mcp_auth_ctx.reset(token_reset)
