"""License claims cache + entitlement matching (Phase 10)."""
from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.platform.license_store import read_license_blob, resolve_license_key_path
from app.platform.module_bootstrap import repo_root
from app.platform.module_types import ModuleManifest

logger = logging.getLogger(__name__)

_CLAIMS_CACHE: Any = None
_CLAIMS_LOADED = False
_STATUS_CACHE: Optional[Dict[str, Any]] = None


def ensure_vendor_on_path() -> Path:
    """Put backend/vendor on sys.path so ``ragsuite_license_verify`` imports."""
    vendor = repo_root() / "backend" / "vendor"
    s = str(vendor.resolve())
    if s not in sys.path:
        sys.path.insert(0, s)
    return vendor


def _import_verify():
    ensure_vendor_on_path()
    from ragsuite_license_verify import (  # type: ignore
        LicenseClaims,
        LicenseExpiredError,
        LicenseVerifyError,
        verify_license,
    )

    return verify_license, LicenseClaims, LicenseExpiredError, LicenseVerifyError


def reset_license_cache() -> None:
    global _CLAIMS_CACHE, _CLAIMS_LOADED, _STATUS_CACHE
    _CLAIMS_CACHE = None
    _CLAIMS_LOADED = False
    _STATUS_CACHE = None


@dataclass
class LicenseStatus:
    state: str  # absent | valid | grace | expired | invalid
    path: str
    claims: Optional[Dict[str, Any]] = None
    detail: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "state": self.state,
            "path": self.path,
            "claims": self.claims,
            "detail": self.detail,
        }


def _claims_summary(claims: Any) -> Dict[str, Any]:
    return {
        "license_id": claims.license_id,
        "customer_id": claims.customer_id,
        "seats": claims.seats,
        "entitlements": list(claims.entitlements),
        "valid_from": claims.valid_from.isoformat(),
        "valid_to": claims.valid_to.isoformat(),
        "grace_days": claims.grace_days,
        "within_grace": claims.is_within_grace(),
    }


def get_claims(*, force: bool = False):
    """Return verified LicenseClaims or None (absent/invalid/expired)."""
    global _CLAIMS_CACHE, _CLAIMS_LOADED
    if _CLAIMS_LOADED and not force:
        return _CLAIMS_CACHE

    verify_license, _Claims, LicenseExpiredError, LicenseVerifyError = _import_verify()
    blob = read_license_blob()
    _CLAIMS_LOADED = True
    if not blob:
        _CLAIMS_CACHE = None
        return None
    try:
        claims = verify_license(blob, require_valid_window=True)
        _CLAIMS_CACHE = claims
        return claims
    except LicenseExpiredError:
        logger.warning("license: expired past grace — EE entitlements denied")
        _CLAIMS_CACHE = None
        return None
    except LicenseVerifyError as exc:
        logger.warning("license: invalid offline key — %s", exc)
        _CLAIMS_CACHE = None
        return None


def license_status(*, force: bool = False) -> LicenseStatus:
    global _STATUS_CACHE
    if _STATUS_CACHE is not None and not force:
        return LicenseStatus(**_STATUS_CACHE)  # type: ignore[arg-type]

    path = str(resolve_license_key_path())
    blob = read_license_blob()
    if not blob:
        st = LicenseStatus(state="absent", path=path, detail="Community — no key required")
        _STATUS_CACHE = st.to_dict()
        return st

    verify_license, _Claims, LicenseExpiredError, LicenseVerifyError = _import_verify()
    try:
        claims = verify_license(blob, require_valid_window=False)
    except LicenseVerifyError as exc:
        st = LicenseStatus(state="invalid", path=path, detail=str(exc))
        _STATUS_CACHE = st.to_dict()
        return st

    summary = _claims_summary(claims)
    if claims.is_valid_now():
        # Distinguish in-grace vs before valid_to
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc)
        state = "valid" if now <= claims.valid_to else "grace"
        st = LicenseStatus(state=state, path=path, claims=summary)
    else:
        st = LicenseStatus(state="expired", path=path, claims=summary, detail="Past grace window")
    _STATUS_CACHE = st.to_dict()
    return st


def claim_matches_entitlement(claim: str, permission_or_id: str) -> bool:
    """Match module id or permission: claim ``sso`` matches ``sso`` or ``sso:use``."""
    if claim == permission_or_id:
        return True
    if permission_or_id.startswith(claim + ":"):
        return True
    # Also allow exact permission in claims
    return False


def entitlements_match(manifest: ModuleManifest, entitlements: List[str]) -> bool:
    if not entitlements:
        return False
    ent = set(entitlements)
    if manifest.id in ent:
        return True
    for perm in manifest.permissions or []:
        if perm in ent:
            return True
        for claim in ent:
            if claim_matches_entitlement(claim, perm):
                return True
    return False


def entitlements_allow_manifest(
    manifest: ModuleManifest,
    *,
    module_dir: Optional[Path] = None,
) -> bool:
    """Gate EE modules via offline license.

    Community/platform modules are allowed when they are not reserved EE ids and
    are not loaded from an Enterprise install/attach path. ``DEBUG`` does **not**
    unlock EE — a valid/grace offline key is always required for Enterprise modules.
    """
    from app.platform.ee_guard import (
        KNOWN_ENTERPRISE_MODULE_IDS,
        community_module_ids,
        is_enterprise_load_path,
        is_under_ce_modules,
    )

    root = repo_root()
    edition = (manifest.edition or "community").lower()
    must_license = False

    if is_enterprise_load_path(module_dir, repo=root):
        must_license = True
    elif manifest.id in KNOWN_ENTERPRISE_MODULE_IDS:
        # Anti-spoof: reserved EE product ids always need a key, even if tagged community.
        must_license = True
    elif edition not in ("community", "platform"):
        must_license = True
    elif (
        edition == "community"
        and module_dir is not None
        and is_under_ce_modules(module_dir, repo=root)
        and manifest.id not in community_module_ids(repo=root)
    ):
        # Unknown package dropped into shipped modules/ — do not auto-trust.
        must_license = True
        logger.warning(
            "license: unknown community id '%s' under modules/ — treating as gated",
            manifest.id,
        )

    if not must_license:
        return True

    claims = get_claims()
    if claims is None:
        return False
    return entitlements_match(manifest, list(claims.entitlements))
