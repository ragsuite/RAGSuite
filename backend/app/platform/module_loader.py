"""Shared Module/Extension registration helpers (Phase 3–4).

``register_extension_from_dir`` is the single pipeline used by the Extension
loader. ``load_modules`` remains a thin CE-only helper for tests.
"""
from __future__ import annotations

import importlib
import logging
from pathlib import Path
from typing import Dict, List, Optional, Set, TYPE_CHECKING

from app.platform.module_bootstrap import ensure_ragsuite_modules_path, repo_root
from app.platform.module_context import ModuleContext
from app.platform.module_sdk import find_manifest, load_manifest
from app.platform.module_types import ModuleManifest

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

_LOADED: List[str] = []
_MANIFESTS: Dict[str, ModuleManifest] = {}
_SKIPPED: Dict[str, str] = {}


def modules_root() -> Path:
    return repo_root() / "modules"


def loaded_module_ids() -> List[str]:
    return list(_LOADED)


def loaded_manifests() -> Dict[str, ModuleManifest]:
    return dict(_MANIFESTS)


def skipped_extensions() -> Dict[str, str]:
    return dict(_SKIPPED)


def reset_registry() -> None:
    global _LOADED, _MANIFESTS, _SKIPPED
    _LOADED = []
    _MANIFESTS = {}
    _SKIPPED = {}


def entitlements_allow(
    manifest: ModuleManifest,
    *,
    module_dir: Optional[Path] = None,
) -> bool:
    """Entitlement gate (Phase 10). CE ok; EE / reserved ids / EE paths need claims."""
    from app.platform.license_state import entitlements_allow_manifest

    return entitlements_allow_manifest(manifest, module_dir=module_dir)


def _import_register(module_id: str):
    ensure_ragsuite_modules_path()
    return importlib.import_module(f"ragsuite_modules.{module_id}.backend.register")


def register_extension_from_dir(
    app: "FastAPI",
    module_dir: Path,
    *,
    already_loaded: Optional[Set[str]] = None,
) -> Optional[str]:
    """Load one Extension/Module package directory.

    Returns the extension id if newly registered, else None (skipped / failed).
    First-wins: if ``already_loaded`` already contains the id, skip with reason.
    """
    already = already_loaded if already_loaded is not None else set(_LOADED)
    manifest_path = find_manifest(module_dir)
    if not manifest_path:
        return None

    try:
        manifest = load_manifest(manifest_path)
    except Exception as exc:
        logger.warning("extension: bad manifest %s: %s", manifest_path, exc)
        _SKIPPED[str(module_dir)] = f"bad_manifest: {exc}"
        return None

    if manifest.id in _MANIFESTS and manifest.id not in already:
        # inventory from earlier root may already have recorded partial/legacy
        pass
    _MANIFESTS[manifest.id] = manifest

    if manifest.id in already:
        _SKIPPED[manifest.id] = "duplicate_id_first_wins"
        logger.info(
            "extension: skip duplicate id %s from %s (first-wins)",
            manifest.id,
            module_dir,
        )
        return None

    if manifest.status != "migrated":
        _SKIPPED[manifest.id] = f"status_{manifest.status}"
        logger.debug(
            "extension: inventory-only %s (status=%s)",
            manifest.id,
            manifest.status,
        )
        return None

    if not entitlements_allow(manifest, module_dir=module_dir):
        _SKIPPED[manifest.id] = "entitlement_denied"
        logger.info("extension: entitlement denied for %s", manifest.id)
        return None

    register_py = module_dir / "backend" / "register.py"
    register_pyc = module_dir / "backend" / "register.pyc"
    register_cache = (
        list((module_dir / "backend" / "__pycache__").glob("register.*.pyc"))
        if (module_dir / "backend" / "__pycache__").is_dir()
        else []
    )
    if not register_py.is_file() and not register_pyc.is_file() and not register_cache:
        _SKIPPED[manifest.id] = "missing_register"
        logger.warning(
            "extension: migrated %s missing backend/register(.py|.pyc) at %s",
            manifest.id,
            module_dir,
        )
        return None

    try:
        # Ensure this package root is on the namespace before import
        ensure_ragsuite_modules_path(module_dir.parent)
        reg_mod = _import_register(manifest.id)
        register_fn = getattr(reg_mod, "register", None)
        if register_fn is None:
            raise AttributeError("register(ctx) not found")
        ctx = ModuleContext(app=app, manifest=manifest)
        if manifest.permissions:
            ctx.declare_permissions(manifest.permissions)
        if manifest.navigation:
            ctx.declare_navigation(manifest.navigation)
        if manifest.migrations:
            ctx.declare_migrations(manifest.migrations)
        register_fn(ctx)
        _LOADED.append(manifest.id)
        already.add(manifest.id)
        logger.info(
            "✅ Extension registered: %s v%s (from %s)",
            manifest.id,
            manifest.version,
            module_dir,
        )
        return manifest.id
    except Exception as exc:
        _SKIPPED[manifest.id] = f"register_failed: {exc}"
        logger.exception(
            "extension: failed to register %s from %s: %s",
            manifest.id,
            module_dir,
            exc,
        )
        return None


def load_modules(app: "FastAPI") -> None:
    """CE helper: scan only ``<repo>/modules`` (prefer ``load_extensions`` at boot)."""
    reset_registry()
    root = modules_root()
    ensure_ragsuite_modules_path(root)
    if not root.is_dir():
        logger.info("module_loader: no modules/ directory at %s", root)
        return
    loaded: Set[str] = set()
    for child in sorted(root.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        register_extension_from_dir(app, child, already_loaded=loaded)
