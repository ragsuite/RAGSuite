"""Storage path conventions (Platform — Phase 2).

Object/file storage adapters stay thin; feature modules must not invent
ad-hoc roots — use these helpers.
"""
from __future__ import annotations

from pathlib import Path

from app.platform.paths import backend_root, data_tmp_dir

__all__ = ["backend_root", "data_tmp_dir", "storage_root"]


def storage_root() -> Path:
    """Backend-owned data root (``backend/data``)."""
    path = backend_root() / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path
