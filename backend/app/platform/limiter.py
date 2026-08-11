import logging
import re

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

try:
    from jose import jwt as _jose_jwt
    from jose.exceptions import JWTError as _JWTError
    _JOSE_AVAILABLE = True
except ImportError:
    _JOSE_AVAILABLE = False

logger = logging.getLogger(__name__)


def _user_aware_key(request: Request) -> str:
    """
    Rate limit key priority:
    1. Valid JWT Bearer token  → "user:{sub}"           (per-user bucket)
    2. API key Bearer token    → "apikey:{token[:24]}"  (per-key bucket)
    3. X-Project-ID header     → "widget:{pid}:{ip}"   (per-project+IP — one IP can't block all visitors)
    4. Fallback                → remote IP address      (same as before)

    JWT is verified with the actual secret so an attacker cannot forge a fake
    user identity to bypass throttling by rotating sub claims.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]

        # API keys are prefixed — don't try JWT decode on them.
        if token.startswith("rgs_live_") or token.startswith("rgs_test_"):
            return f"apikey:{token[:24]}"

        # JWT path — verify signature so fake tokens fall back to IP.
        if _JOSE_AVAILABLE:
            try:
                from .settings import settings
                payload = _jose_jwt.decode(
                    token,
                    settings.jwt_secret_key,
                    algorithms=[settings.jwt_algorithm],
                )
                sub = payload.get("sub")
                if sub:
                    return f"user:{sub}"
            except (_JWTError, Exception):
                pass  # Invalid / expired token → fall through to IP

    # Widget — composite key: project + IP so one bot can't block all visitors on a site.
    project_id = request.headers.get("X-Project-ID", "")
    if project_id:
        ip = get_remote_address(request)
        return f"widget:{project_id}:{ip}"

    return get_remote_address(request)


def _build_redis_storage_uri() -> str | None:
    """
    Build a Redis URI for slowapi distributed rate limiting (DB 2).
    Uses DB 2 to stay separate from session store (DB 1) and default (DB 0).
    Returns None if Redis is not configured.
    """
    try:
        from ..services.infra_env import redis_url_or_none

        redis_url = redis_url_or_none(db=2)
    except Exception:
        redis_url = None

    if not redis_url:
        return None

    # Strip any existing DB suffix and use DB 2 for rate limit counters.
    base = re.sub(r"/\d+$", "", redis_url)
    return f"{base}/2"


def _redis_storage_reachable(storage_uri: str) -> bool:
    """Probe Redis before wiring slowapi to it (Limiter defers connect until first hit)."""
    try:
        import redis

        client = redis.from_url(
            storage_uri,
            decode_responses=True,
            socket_timeout=2,
            socket_connect_timeout=2,
        )
        client.ping()
        return True
    except Exception as exc:
        logger.warning(
            "Rate limiter: Redis backend unreachable (%s) — falling back to in-memory. "
            "Rate limits will NOT be shared across workers.",
            exc,
        )
        return False


def _build_limiter() -> Limiter:
    storage_uri = _build_redis_storage_uri()
    if storage_uri and _redis_storage_reachable(storage_uri):
        try:
            lim = Limiter(key_func=_user_aware_key, storage_uri=storage_uri)
            logger.info(
                "Rate limiter: Redis backend configured (%s)",
                re.sub(r":[^@/]+@", ":***@", storage_uri),
            )
            return lim
        except Exception as exc:
            logger.warning(
                "Rate limiter: Redis backend failed (%s) — falling back to in-memory. "
                "Rate limits will NOT be shared across workers.",
                exc,
            )
    elif not storage_uri:
        logger.info("Rate limiter: no Redis configured — using in-memory (single-process only)")

    return Limiter(key_func=_user_aware_key)


limiter = _build_limiter()
