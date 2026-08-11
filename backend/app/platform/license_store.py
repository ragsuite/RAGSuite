"""On-disk offline license path contract (Phase 10)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from app.platform.module_bootstrap import repo_root


def license_dir(root: Optional[Path] = None) -> Path:
    return (root or repo_root()) / ".ragsuite" / "license"


def default_license_key_path(root: Optional[Path] = None) -> Path:
    return license_dir(root) / "offline.key"


def resolve_license_key_path(root: Optional[Path] = None) -> Path:
    override = (os.environ.get("RAGSUITE_LICENSE_FILE") or "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return default_license_key_path(root)


def read_license_blob(root: Optional[Path] = None) -> Optional[str]:
    path = resolve_license_key_path(root)
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8").strip()
    return text or None


def write_license_blob(blob: str, root: Optional[Path] = None) -> Path:
    text = (blob or "").strip()
    if not text:
        raise ValueError("License key blob is empty")
    path = resolve_license_key_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")
    return path


def clear_license_blob(root: Optional[Path] = None) -> bool:
    path = resolve_license_key_path(root)
    if path.is_file():
        path.unlink()
        return True
    return False
