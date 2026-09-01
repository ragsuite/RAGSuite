"""Enterprise / Community load & install guards (public CE hardening).

Goals (without changing Platform → Modules → Extensions architecture):
- EE product ids and EE install paths always need a valid/grace offline key.
- Self-declared ``edition: community`` cannot unlock known EE module ids.
- DEBUG alone never unlocks EE (customer safety).
- Sibling / DX EE attach (``RAGSUITE_EE_ROOT``) still requires a valid offline key.
- Customer ACTIVE installs under ``extensions/installed/ee/`` always require a valid key.
- Bundle install refuses unsigned archives unless explicitly allowed.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import FrozenSet, Mapping, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Production build marker (C6/H4)
# ---------------------------------------------------------------------------
# Set to True at CLI / package publish time (e.g. via prepublish script).
# When True, bypass env-vars that loosen security are permanently disabled.
PRODUCTION_BUILD_BAKED: bool = False


def is_production_build(*, env: Optional[Mapping[str, str]] = None) -> bool:
    """True when running in a production / published build.

    Production is declared by either:
    1. The baked constant ``PRODUCTION_BUILD_BAKED`` (set True at publish), or
    2. The environment variable ``RAGSUITE_PRODUCTION_BUILD=1`` (operator override).
    """
    if PRODUCTION_BUILD_BAKED:
        return True
    source = env if env is not None else os.environ
    return _truthy(source.get("RAGSUITE_PRODUCTION_BUILD"))


# Locked product catalog (ADR-002). IDs are reserved — cannot be opened as "community".
KNOWN_ENTERPRISE_MODULE_IDS: FrozenSet[str] = frozenset(
    {
        "sso",
        "organization",
        "audit_full",
        "compliance",
        "compare_models",
        "query_tracing",
        "analytics",
        "mobile_beta",
        "voice",
    }
)

# Community catalog (ADR-002) shipped under CE ``modules/``.
KNOWN_COMMUNITY_MODULE_IDS: FrozenSet[str] = frozenset(
    {
        "crawl",
        "documents",
        "chat",
        "search",
        "widgets",
        "connectors",
        "llm_providers",
        "citations",
        "feedback",
        "auth_password",
        "auth_2fa_sessions",
        "system_health",
        "audit_basic",
        "notifications",
        "projects",
        "trust_center",
        "data_compliance",
    }
)


def _truthy(raw: Optional[str]) -> bool:
    return (raw or "").strip().lower() in {"1", "true", "yes", "on"}


def is_dx_ee_attach(*, env: Optional[Mapping[str, str]] = None, repo: Optional[Path] = None) -> bool:
    """True when ``RAGSUITE_EE_ROOT`` is a source/sibling tree (not customer ACTIVE)."""
    source = env if env is not None else os.environ
    raw = (source.get("RAGSUITE_EE_ROOT") or "").strip()
    if not raw:
        return False
    try:
        ee_root = Path(raw).expanduser().resolve()
    except OSError:
        return False
    if not ee_root.is_dir():
        return False
    if is_under_installed_ee(ee_root, repo=repo):
        return False
    return (ee_root / "modules").is_dir()


def allow_unsigned_bundle(*, env: Optional[Mapping[str, str]] = None) -> bool:
    """Lab only — production builds always return False; env var ignored."""
    if is_production_build(env=env):
        return False
    source = env if env is not None else os.environ
    return _truthy(source.get("RAGSUITE_ALLOW_UNSIGNED_BUNDLE"))


def is_under_installed_ee(module_dir: Path, *, repo: Optional[Path] = None) -> bool:
    """True when path is inside ``extensions/installed/ee/``."""
    try:
        resolved = module_dir.resolve()
    except OSError:
        return False
    parts = set(resolved.parts)
    # Match even if repo_root monkeypatched in tests (tmp install base).
    if "installed" in parts and "ee" in parts:
        try:
            idx = resolved.parts.index("ee")
            if idx > 0 and resolved.parts[idx - 1] == "installed":
                return True
        except ValueError:
            pass
    if repo is not None:
        base = (repo / "extensions" / "installed" / "ee").resolve()
        try:
            resolved.relative_to(base)
            return True
        except ValueError:
            return False
    return False


def is_under_ee_attach_root(module_dir: Path, *, env: Optional[Mapping[str, str]] = None) -> bool:
    """True when path is under ``RAGSUITE_EE_ROOT`` (sibling DX tree)."""
    source = env if env is not None else os.environ
    raw = (source.get("RAGSUITE_EE_ROOT") or "").strip()
    if not raw:
        return False
    try:
        ee_root = Path(raw).expanduser().resolve()
        module_dir.resolve().relative_to(ee_root)
        return True
    except (OSError, ValueError):
        return False


def is_enterprise_load_path(module_dir: Optional[Path], *, repo: Optional[Path] = None) -> bool:
    if module_dir is None:
        return False
    return is_under_installed_ee(module_dir, repo=repo) or is_under_ee_attach_root(module_dir)


def is_under_ce_modules(module_dir: Path, *, repo: Path) -> bool:
    try:
        module_dir.resolve().relative_to((repo / "modules").resolve())
        return True
    except (OSError, ValueError):
        return False


def disk_community_module_ids(repo: Path) -> FrozenSet[str]:
    """Ids present under ``<repo>/modules/`` (authoritative for this install)."""
    root = repo / "modules"
    if not root.is_dir():
        return frozenset()
    ids = set()
    try:
        for child in root.iterdir():
            if child.is_dir() and not child.name.startswith("."):
                if (child / "manifest.yaml").is_file() or (child / "manifest.yml").is_file() or (
                    child / "manifest.json"
                ).is_file():
                    ids.add(child.name)
    except OSError:
        return frozenset()
    return frozenset(ids)


def community_module_ids(*, repo: Optional[Path] = None) -> FrozenSet[str]:
    ids = set(KNOWN_COMMUNITY_MODULE_IDS)
    if repo is not None:
        ids |= set(disk_community_module_ids(repo))
    return frozenset(ids)


def require_license_claims_for_install() -> None:
    """Raise RuntimeError unless offline license is valid or grace."""
    from app.platform.license_state import license_status, reset_license_cache

    reset_license_cache()
    status = license_status(force=True)
    if status.state in ("valid", "grace"):
        return

    if status.state == "expired":
        raise RuntimeError(
            "Enterprise license key has expired — EE bundle was NOT installed.\n"
            "Community app, database, and .env are unchanged.\n"
            "Renew offline.key with your vendor, then retry."
        )
    if status.state == "absent":
        raise RuntimeError(
            "No offline.key installed — EE bundle install refused.\n"
            "First time: ragsuite activate --key ./offline.key --bundle ./ragsuite-ee-<ver>.tar.gz"
        )
    raise RuntimeError(
        f"Offline key not usable for EE install (state={status.state}"
        + (f": {status.detail}" if status.detail else "")
        + ").\nEnterprise bundle was NOT installed."
    )
