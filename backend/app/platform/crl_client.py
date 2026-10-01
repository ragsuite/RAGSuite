"""Soft-fail Certificate Revocation List client (P3).

Fetches ``GET {license_server}/api/v1/public/crl``, verifies its Ed25519 signature
with the same public key used for offline-key verification, and caches the result to
``~/.ragsuite/crl.json`` (or ``RAGSUITE_DATA_DIR/crl.json``).

Supported response formats:
- ``ragsuite.crl.v1``: ``signature`` is ``base64url(canonical payload).base64url(sig)``;
  revoked ids are read from the *signed* payload only (``revoked``).
- Legacy: ``{"payload": {...revoked_ids...}, "signature": "<base64url(sig)>"}``.

Soft-fail contract:
- If the fetch fails, the existing cache is used.
- If the cache is older than ``CRL_MAX_AGE_DAYS`` (default 30, env override) AND the
  fetch also fails, this becomes a hard-fail: RuntimeError is raised and the caller
  must deny EE access.
- If there is no cache at all and the fetch fails (first run, air-gap), the function
  returns False (allow) rather than blocking a fresh install.

``is_revoked`` runs on request paths, so after a failed fetch further network
attempts are suppressed for ``_FAILURE_BACKOFF_SECONDS`` (per cache path), and only
one refresh runs at a time per process.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_CRL_CACHE_FILENAME = "crl.json"
_DEFAULT_CRL_MAX_AGE_DAYS = 30
_ENV_CACHE_PATH = "RAGSUITE_CRL_CACHE_PATH"
_ENV_MAX_AGE = "CRL_MAX_AGE_DAYS"
_CRL_V1_SCHEMA = "ragsuite.crl.v1"
_FETCH_TIMEOUT_SECONDS = 5
_FAILURE_BACKOFF_SECONDS = 300

_refresh_lock = threading.Lock()
_state_lock = threading.Lock()
# cache path -> ((st_mtime_ns, st_size), parsed cache)
_cache_memo: dict[str, tuple[tuple[int, int], dict]] = {}
# cache path -> time.monotonic() of the last failed refresh
_last_refresh_failure: dict[str, float] = {}


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _crl_cache_path() -> Path:
    env_path = os.environ.get(_ENV_CACHE_PATH, "").strip()
    if env_path:
        return Path(env_path).expanduser().resolve()
    base_env = os.environ.get("RAGSUITE_DATA_DIR", "").strip()
    base = Path(base_env).expanduser().resolve() if base_env else Path.home() / ".ragsuite"
    p = base / _CRL_CACHE_FILENAME
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return p


def _crl_max_age_days() -> int:
    try:
        return int(os.environ.get(_ENV_MAX_AGE, str(_DEFAULT_CRL_MAX_AGE_DAYS)))
    except (ValueError, TypeError):
        return _DEFAULT_CRL_MAX_AGE_DAYS


def _license_server_base_url() -> str:
    return os.environ.get("RAGSUITE_LICENSE_URL", "https://license.ragsuite.de").rstrip("/")


def _reset_state_for_tests() -> None:
    with _state_lock:
        _cache_memo.clear()
        _last_refresh_failure.clear()


# ---------------------------------------------------------------------------
# Network + signature
# ---------------------------------------------------------------------------

def _fetch_crl_raw() -> Optional[dict]:
    """Fetch CRL JSON from license server. Returns parsed dict or None on error."""
    url = f"{_license_server_base_url()}/api/v1/public/crl"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=_FETCH_TIMEOUT_SECONDS) as resp:  # noqa: S310
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        logger.warning("crl_client: fetch failed (%s): %s", url, exc)
        return None


def _b64url_decode(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad)


def _vendor_public_key() -> Any:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    from app.platform.license_state import ensure_vendor_on_path

    ensure_vendor_on_path()
    from ragsuite_license_verify.verify import default_public_key_pem  # type: ignore

    pub = serialization.load_pem_public_key(default_public_key_pem())
    if not isinstance(pub, Ed25519PublicKey):
        raise ValueError("CRL public key must be Ed25519")
    return pub


def _verify_crl_signature(crl_data: dict) -> bool:
    """Verify Ed25519 signature on a legacy ``payload``/``signature`` CRL."""
    try:
        payload = crl_data.get("payload")
        sig_b64 = crl_data.get("signature", "")
        if not payload or not sig_b64:
            return False
        payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        _vendor_public_key().verify(_b64url_decode(sig_b64), payload_bytes)
        return True
    except Exception as exc:
        logger.warning("crl_client: CRL signature verification failed: %s", exc)
        return False


def _verify_v1_signed_payload(crl_data: dict) -> Optional[dict]:
    """Return the verified payload of a ``ragsuite.crl.v1`` CRL, or None."""
    blob = crl_data.get("signature")
    if not isinstance(blob, str) or "." not in blob:
        return None
    try:
        payload_b64, sig_b64 = blob.split(".", 1)
        payload_bytes = _b64url_decode(payload_b64)
        _vendor_public_key().verify(_b64url_decode(sig_b64), payload_bytes)
        claims = json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:
        logger.warning("crl_client: CRL v1 signature verification failed: %s", exc)
        return None
    if not isinstance(claims, dict) or claims.get("schema") != _CRL_V1_SCHEMA:
        logger.warning("crl_client: CRL v1 signed payload has unexpected schema")
        return None
    if not isinstance(claims.get("revoked"), list):
        logger.warning("crl_client: CRL v1 signed payload missing revoked list")
        return None
    return claims


def _verified_cache_entry(raw: dict) -> Optional[dict]:
    """Build the cache entry from a fetched CRL, or None when it cannot be trusted."""
    if raw.get("schema") == _CRL_V1_SCHEMA or "payload" not in raw:
        claims = _verify_v1_signed_payload(raw)
        if claims is None:
            return None
        revoked = [str(x) for x in claims["revoked"]]
        version = claims.get("issued_at")
    else:
        if not _verify_crl_signature(raw):
            return None
        payload = raw.get("payload") or {}
        revoked = list(payload.get("revoked_ids", []))
        version = payload.get("crl_version")
    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "revoked_ids": revoked,
        "crl_version": version,
    }


# ---------------------------------------------------------------------------
# Cache I/O
# ---------------------------------------------------------------------------

def _load_cache() -> Optional[dict]:
    p = _crl_cache_path()
    key = str(p)
    try:
        st = p.stat()
    except OSError:
        with _state_lock:
            _cache_memo.pop(key, None)
        return None
    stamp = (st.st_mtime_ns, st.st_size)
    with _state_lock:
        memo = _cache_memo.get(key)
    if memo is not None and memo[0] == stamp:
        return memo[1]
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    with _state_lock:
        _cache_memo[key] = (stamp, data)
    return data


def _save_cache(data: dict) -> None:
    p = _crl_cache_path()
    try:
        p.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
    except OSError as exc:
        logger.warning("crl_client: could not write cache %s: %s", p, exc)
    with _state_lock:
        _cache_memo.pop(str(p), None)


def _cache_age(cache: dict) -> Optional[timedelta]:
    try:
        return datetime.now(timezone.utc) - datetime.fromisoformat(cache["fetched_at"])
    except (ValueError, TypeError, KeyError):
        return None


def _in_failure_backoff(key: str) -> bool:
    with _state_lock:
        failed_at = _last_refresh_failure.get(key)
    return failed_at is not None and (time.monotonic() - failed_at) < _FAILURE_BACKOFF_SECONDS


def _record_refresh_result(key: str, ok: bool) -> None:
    with _state_lock:
        if ok:
            _last_refresh_failure.pop(key, None)
        else:
            _last_refresh_failure[key] = time.monotonic()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def refresh_crl(*, force: bool = False) -> bool:
    """Fetch and cache a fresh CRL. Returns True on success, False on failure."""
    if not force:
        cache = _load_cache()
        age = _cache_age(cache) if cache else None
        if age is not None and age < timedelta(days=_crl_max_age_days()) / 2:
            return True  # fresh enough

    key = str(_crl_cache_path())
    raw = _fetch_crl_raw()
    entry = _verified_cache_entry(raw) if isinstance(raw, dict) else None
    if entry is None:
        if raw is not None:
            logger.warning("crl_client: CRL signature invalid — discarding fetched data")
        _record_refresh_result(key, ok=False)
        return False

    _save_cache(entry)
    _record_refresh_result(key, ok=True)
    logger.info(
        "crl_client: cached CRL with %d revoked id(s) (version=%s)",
        len(entry["revoked_ids"]),
        entry.get("crl_version"),
    )
    return True


def _cache_needs_refresh(cache: Optional[dict]) -> tuple[bool, bool]:
    """Return ``(missing, stale)`` for the given cache."""
    if cache is None:
        return True, False
    age = _cache_age(cache)
    return False, age is None or age > timedelta(days=_crl_max_age_days())


def is_revoked(license_id: str) -> bool:
    """Return True if *license_id* appears on the CRL.

    Soft-fail: if the network is unreachable, the cached list is used.
    Hard-fail: if the cache is older than ``CRL_MAX_AGE_DAYS`` and a refresh
    also fails, raises ``RuntimeError`` (caller must deny EE access).
    First-run with no cache and no network: returns False (allow; soft-fail).
    """
    cache = _load_cache()
    cache_missing, cache_stale = _cache_needs_refresh(cache)

    if cache_missing or cache_stale:
        key = str(_crl_cache_path())
        success = False
        if not _in_failure_backoff(key):
            with _refresh_lock:
                cache = _load_cache()
                cache_missing, cache_stale = _cache_needs_refresh(cache)
                if not (cache_missing or cache_stale):
                    success = True
                elif not _in_failure_backoff(key):
                    success = refresh_crl(force=True)
        if not success:
            if cache_stale:
                logger.warning(
                    "crl_client: CRL cache stale (>%d days) and refresh failed — hard-fail",
                    _crl_max_age_days(),
                )
                raise RuntimeError(
                    f"CRL cache is stale (>{_crl_max_age_days()} days) and could not be "
                    "refreshed. EE entitlements are denied for safety. "
                    "Restore network access to the license server or contact your vendor."
                )
            # First run, no cache, no network → allow (soft-fail)
            logger.debug("crl_client: no CRL cache and fetch failed — soft-fail (allow)")
            return False
        cache = _load_cache()

    if cache is None:
        return False

    return license_id in cache.get("revoked_ids", [])
