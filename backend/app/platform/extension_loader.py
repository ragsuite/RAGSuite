"""Edition-agnostic Extension loader (Phase 4 — ADR-003).

Platform starts → scans configured roots → loads → registers via Module interface.
Does **not** branch on Community / Enterprise / Marketplace brands.

Scan order (first-wins on duplicate id):
1. ``<repo>/modules/``
2. ``<repo>/extensions/``
3. ``<repo>/extensions/installed/ee/<ACTIVE>/modules`` if ACTIVE marker present (Phase 7 bundle)
4. ``$RAGSUITE_EE_ROOT/modules/`` if env set and directory exists
5. ``$RAGSUITE_EE_ROOT/extensions/`` if env set and directory exists

Missing EE root / missing bundle ⇒ soft-skip, CE continues.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Dict, List, Set, TYPE_CHECKING

from app.platform.ee_guard import is_production_build
from app.platform.module_bootstrap import add_module_search_roots, repo_root
from app.platform.module_loader import (
    loaded_manifests,
    loaded_module_ids,
    register_extension_from_dir,
    reset_registry,
    skipped_extensions,
)

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

_SCAN_ROOTS: List[Path] = []


def scanned_roots() -> List[Path]:
    return list(_SCAN_ROOTS)


def loaded_extension_ids() -> List[str]:
    """Alias for diagnostics / future CLI ``extensions``."""
    return loaded_module_ids()


def discover_extension_roots() -> List[Path]:
    """Ordered extension package roots. Never branches on edition brand names."""
    roots: List[Path] = []
    repo = repo_root()

    for rel in ("modules", "extensions"):
        candidate = repo / rel
        if candidate.is_dir():
            roots.append(candidate.resolve())
        else:
            logger.debug("extension_loader: skip missing root %s", candidate)

    # Phase 7/13: installed Enterprise bundle (customer path — before DX EE root).
    # Skip when ACTIVE platform_compat does not satisfy PLATFORM_VERSION (ADR-004).
    try:
        from app.platform.bundle_install import active_bundle_modules_root, active_bundle_version
        from app.platform.compat import active_bundle_platform_compatible

        ok, detail, _compat = active_bundle_platform_compatible()
        if not ok:
            logger.error(
                "extension_loader: refusing installed EE modules — %s",
                detail,
            )
        else:
            installed = active_bundle_modules_root()
            if installed is not None:
                # H6: re-verify installed bundle tree before importing EE code
                try:
                    from app.platform.bundle_integrity import verify_installed_tree

                    bundle_dir = installed.parent  # installed = <ver>/modules; parent = <ver>
                    verify_installed_tree(bundle_dir)
                except RuntimeError as integrity_exc:
                    logger.critical(
                        "extension_loader: installed EE bundle integrity FAILED — "
                        "EE modules will not load: %s",
                        integrity_exc,
                    )
                    installed = None  # skip EE load

                # H7: assert system clock hasn't rolled back
                if installed is not None:
                    try:
                        from app.platform.license_monotonic import assert_clock_sane

                        assert_clock_sane()
                    except RuntimeError as clock_exc:
                        logger.critical(
                            "extension_loader: clock sane check failed — EE load refused: %s",
                            clock_exc,
                        )
                        installed = None

                if installed is not None:
                    roots.append(installed)
                    logger.info(
                        "extension_loader: installed EE bundle modules %s (ACTIVE=%s)",
                        installed,
                        active_bundle_version(),
                    )
    except Exception as exc:  # pragma: no cover — defensive
        logger.debug("extension_loader: installed bundle probe failed: %s", exc)

    ee_raw = (os.environ.get("RAGSUITE_EE_ROOT") or "").strip()
    if ee_raw:
        if is_production_build():
            # C6/H4: production builds must use the official bundle install path only.
            raise RuntimeError(
                "RAGSUITE_EE_ROOT is set but RAGSUITE_PRODUCTION_BUILD=1 — "
                "DX/sibling attach is not permitted in production. "
                "Use the official bundle install path (extensions/installed/ee/)."
            )
        ee_root = Path(ee_raw).expanduser()
        if not ee_root.is_dir():
            logger.info(
                "extension_loader: RAGSUITE_EE_ROOT=%s not a directory — soft-skip",
                ee_raw,
            )
        else:
            for rel in ("modules", "extensions"):
                candidate = (ee_root / rel).resolve()
                if candidate.is_dir():
                    roots.append(candidate)
                    logger.info("extension_loader: attached root %s", candidate)
                else:
                    logger.debug(
                        "extension_loader: EE root has no %s/ — skip", rel
                    )
    else:
        logger.debug("extension_loader: RAGSUITE_EE_ROOT unset — CE-only or bundle-only")

    # Dedupe while preserving order
    seen: Set[str] = set()
    ordered: List[Path] = []
    for r in roots:
        key = str(r)
        if key not in seen:
            seen.add(key)
            ordered.append(r)
    return ordered


def load_extensions(app: "FastAPI") -> None:
    """Discover Extensions on all scan roots and register migrated ones."""
    global _SCAN_ROOTS
    reset_registry()
    roots = discover_extension_roots()
    _SCAN_ROOTS = roots

    if not roots:
        logger.warning("extension_loader: no scan roots found")
        return

    add_module_search_roots(roots)
    already: Set[str] = set()

    for root in roots:
        logger.info("extension_loader: scanning %s", root)
        try:
            children = sorted(root.iterdir())
        except OSError as exc:
            logger.warning("extension_loader: cannot read %s: %s", root, exc)
            continue
        for child in children:
            if not child.is_dir() or child.name.startswith("."):
                continue
            register_extension_from_dir(app, child, already_loaded=already)

    logger.info(
        "extension_loader: registered=%s skipped=%s roots=%s",
        loaded_extension_ids(),
        list(skipped_extensions().keys())[:20],
        [str(r) for r in roots],
    )


# Re-export inventory helpers for callers
__all__ = [
    "discover_extension_roots",
    "load_extensions",
    "loaded_extension_ids",
    "scanned_roots",
    "loaded_manifests",
    "skipped_extensions",
]
