"""Filesystem Extension inventory for CLI (Phase 9).

This module intentionally avoids optional runtime dependencies (FastAPI, PyYAML,
cryptography) so ``ragsuite extensions`` works in minimal CI smoke envs.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.platform.module_bootstrap import repo_root


def _classify_source(module_dir: Path, scan_root: Path) -> str:
    repo = repo_root()
    try:
        rel_mod = module_dir.resolve().relative_to(repo.resolve())
        parts = rel_mod.parts
    except ValueError:
        parts = ()

    if parts[:1] == ("modules",):
        return "ce-modules"
    if len(parts) >= 3 and parts[:3] == ("extensions", "installed", "ee"):
        return "installed-ee"
    if parts[:1] == ("extensions",):
        return "extensions"

    ee_raw = (os.environ.get("RAGSUITE_EE_ROOT") or "").strip()
    if ee_raw:
        try:
            module_dir.resolve().relative_to(Path(ee_raw).expanduser().resolve())
            return "ee-root"
        except ValueError:
            pass

    # Fallback by scan root name
    if scan_root.name == "modules":
        if "RAGSUITE_EE" in str(scan_root):
            return "ee-root"
        return "ce-modules"
    return "extensions"


def discover_extension_roots_lightweight() -> List[Path]:
    """Dependency-light root discovery mirroring extension_loader order."""
    roots: List[Path] = []
    repo = repo_root()
    for rel in ("modules", "extensions"):
        candidate = repo / rel
        if candidate.is_dir():
            roots.append(candidate.resolve())

    active = active_bundle_version()
    if active:
        installed = repo / "extensions" / "installed" / "ee" / active / "modules"
        if installed.is_dir():
            roots.append(installed.resolve())

    ee_raw = (os.environ.get("RAGSUITE_EE_ROOT") or "").strip()
    if ee_raw:
        ee_root = Path(ee_raw).expanduser()
        for rel in ("modules", "extensions"):
            candidate = ee_root / rel
            if candidate.is_dir():
                roots.append(candidate.resolve())

    # Keep first occurrence order while deduplicating.
    out: List[Path] = []
    seen: set[str] = set()
    for root in roots:
        key = str(root)
        if key in seen:
            continue
        seen.add(key)
        out.append(root)
    return out


def find_manifest_path(module_dir: Path) -> Path | None:
    for name in ("manifest.yaml", "manifest.yml", "manifest.json"):
        candidate = module_dir / name
        if candidate.is_file():
            return candidate
    return None


_YAML_SCALAR_RE = re.compile(r"^([A-Za-z0-9_]+)\s*:\s*(.*?)\s*$")


def _parse_manifest_minimal(man_path: Path) -> Dict[str, Any]:
    """Parse only scalar keys needed for inventory output."""
    raw = man_path.read_text(encoding="utf-8")
    if man_path.suffix == ".json":
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("manifest json must be an object")
        return data

    # Minimal YAML reader for top-level scalar fields; enough for id/version/etc.
    out: Dict[str, Any] = {}
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if line.startswith((" ", "\t", "-")):
            continue
        m = _YAML_SCALAR_RE.match(line)
        if not m:
            continue
        key, value = m.group(1), m.group(2)
        if value.startswith(("'", '"')) and value.endswith(("'", '"')) and len(value) >= 2:
            value = value[1:-1]
        out[key] = value
    return out


def inventory_discovered_extensions() -> List[Dict[str, Any]]:
    """Walk discover_extension_roots(); load manifests only (no register)."""
    rows: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()

    for root in discover_extension_roots_lightweight():
        try:
            children = sorted(root.iterdir())
        except OSError:
            continue
        for child in children:
            if not child.is_dir() or child.name.startswith("."):
                continue
            man_path = find_manifest_path(child)
            if man_path is None:
                continue
            try:
                man = _parse_manifest_minimal(man_path)
            except Exception as exc:
                rows.append(
                    {
                        "id": child.name,
                        "version": None,
                        "edition": None,
                        "status": "invalid",
                        "source": _classify_source(child, root),
                        "path": str(child.resolve()),
                        "error": str(exc),
                    }
                )
                continue
            module_id = str(man.get("id") or child.name)
            if module_id in seen_ids:
                continue
            seen_ids.add(module_id)
            rows.append(
                {
                    "id": module_id,
                    "version": man.get("version"),
                    "edition": man.get("edition"),
                    "status": man.get("status"),
                    "source": _classify_source(child, root),
                    "path": str(child.resolve()),
                }
            )
    return rows


def active_bundle_version() -> Optional[str]:
    active = repo_root() / "extensions" / "installed" / "ee" / "ACTIVE"
    if not active.is_file():
        return None
    version = active.read_text(encoding="utf-8").strip()
    return version or None


def main(argv: Optional[list[str]] = None) -> int:
    _ = argv  # reserved for future flags
    payload = {
        "repo_root": str(repo_root()),
        "active_bundle": active_bundle_version(),
        "extensions": inventory_discovered_extensions(),
    }
    json.dump(payload, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
