"""Soft-fail Certificate Revocation List client (P3).

Fetches ``GET {license_server}/api/v1/public/crl``, verifies its Ed25519 signature
with the same public key used for offline-key verification, and caches the result to
``~/.ragsuite/crl.json`` (or ``RAGSUITE_DATA_DIR/crl.json``).

Soft-fail contract:
- If the fetch fails, the existing cache is used.
- If the cache is older than ``CRL_MAX_AGE_DAYS`` (default 30, env override) AND the
  fetch also fails, this becomes a hard-fail: RuntimeError is raised and the caller
  must deny EE access.
- If there is no cache at all and the fetch fails (first run, air-gap), the function
  returns False (allow) rather than blocking a fresh install.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_CRL_CACHE_FILENAME = "crl.json"
_DEFAULT_CRL_MAX_AGE_DAYS = 30
_ENV_CACHE_PATH = "RAGSUITE_CRL_CACHE_PATH"
_ENV_MAX_AGE = "CRL_MAX_AGE_DAYS"


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


# ---------------------------------------------------------------------------
# Network + signature
# ---------------------------------------------------------------------------

def _fetch_crl_raw() -> Optional[dict]:
    """Fetch CRL JSON from license server. Returns parsed dict or None on error."""
    url = f"{_license_server_base_url()}/api/v1/public/crl"
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        logger.warning("crl_client: fetch failed (%s): %s", url, exc)
        return None


def _verify_crl_signature(crl_data: dict) -> bool:
    """Verify Ed25519 signature on the CRL payload."""
    try:
        import base64

        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

        from app.platform.license_state import ensure_vendor_on_path

        ensure_vendor_on_path()
        from ragsuite_license_verify.verify import default_public_key_pem  # type: ignore

        payload = crl_data.get("payload")
        sig_b64 = crl_data.get("signature", "")
        if not payload or not sig_b64:
            return False

        payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        pad = "=" * (-len(sig_b64) % 4)
        sig = base64.urlsafe_b64decode(sig_b64 + pad)

        pem = default_public_key_pem()
        pub = serialization.load_pem_public_key(pem)
        if not isinstance(pub, Ed25519PublicKey):
            return False
        pub.verify(sig, payload_bytes)
        return True
    except Exception as exc:
        logger.warning("crl_client: CRL signature verification failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Cache I/O
# ---------------------------------------------------------------------------

def _load_cache() -> Optional[dict]:
    p = _crl_cache_path()
    try:
        if p.is_file():
            return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    return None


def _save_cache(data: dict) -> None:
    p = _crl_cache_path()
    try:
        p.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
    except OSError as exc:
        logger.warning("crl_client: could not write cache %s: %s", p, exc)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def refresh_crl(*, force: bool = False) -> bool:
    """Fetch and cache a fresh CRL. Returns True on success, False on failure."""
    if not force:
        cache = _load_cache()
        if cache:
            try:
                age = datetime.now(timezone.utc) - datetime.fromisoformat(cache["fetched_at"])
                if age < timedelta(days=_crl_max_age_days()) / 2:
                    return True  # fresh enough
            except (ValueError, TypeError, KeyError):
                pass

    raw = _fetch_crl_raw()
    if raw is None:
        return False

    if not _verify_crl_signature(raw):
        logger.warning("crl_client: CRL signature invalid — discarding fetched data")
        return False

    payload = raw.get("payload", {})
    entry = {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "revoked_ids": payload.get("revoked_ids", []),
        "crl_version": payload.get("crl_version"),
    }
    _save_cache(entry)
    logger.info(
        "crl_client: cached CRL with %d revoked id(s) (version=%s)",
        len(entry["revoked_ids"]),
        entry.get("crl_version"),
    )
    return True


def is_revoked(license_id: str) -> bool:
    """Return True if *license_id* appears on the CRL.

    Soft-fail: if the network is unreachable, the cached list is used.
    Hard-fail: if the cache is older than ``CRL_MAX_AGE_DAYS`` and a refresh
    also fails, raises ``RuntimeError`` (caller must deny EE access).
    First-run with no cache and no network: returns False (allow; soft-fail).
    """
    cache = _load_cache()
    cache_missing = cache is None
    cache_stale = False

    if cache:
        try:
            age = datetime.now(timezone.utc) - datetime.fromisoformat(cache["fetched_at"])
            if age > timedelta(days=_crl_max_age_days()):
                cache_stale = True
        except (ValueError, TypeError, KeyError):
            cache_stale = True

    if cache_missing or cache_stale:
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
            logger.warning("crl_client: no CRL cache and fetch failed — soft-fail (allow)")
            return False
        cache = _load_cache()

    if cache is None:
        return False

    return license_id in cache.get("revoked_ids", [])
