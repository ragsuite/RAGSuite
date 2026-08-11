"""Module SDK — Protocol + manifest loading (Phase 3)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Protocol, runtime_checkable

import yaml

from app.platform.module_context import ModuleContext
from app.platform.module_types import ModuleManifest


@runtime_checkable
class Module(Protocol):
    """ADR-002 Module interface."""

    manifest: ModuleManifest

    def register(self, ctx: ModuleContext) -> None:
        """Register routers, permissions, nav, migrations, settings with Platform."""


def load_manifest(path: Path) -> ModuleManifest:
    raw = path.read_text(encoding="utf-8")
    if path.suffix in (".yaml", ".yml"):
        data: Dict[str, Any] = yaml.safe_load(raw) or {}
    elif path.suffix == ".json":
        data = json.loads(raw)
    else:
        raise ValueError(f"Unsupported manifest format: {path}")
    if not isinstance(data, dict) or "id" not in data:
        raise ValueError(f"Invalid manifest at {path}")
    return ModuleManifest.from_dict(data)


def find_manifest(module_dir: Path) -> Path | None:
    for name in ("manifest.yaml", "manifest.yml", "manifest.json"):
        candidate = module_dir / name
        if candidate.is_file():
            return candidate
    return None
