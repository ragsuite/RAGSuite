"""Stable filesystem paths for the backend package (cwd-independent)."""
from __future__ import annotations

from pathlib import Path

# platform/ → app/ → backend/
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def backend_root() -> Path:
    return _BACKEND_ROOT


def data_tmp_dir() -> Path:
    """Absolute ``backend/data/tmp`` — used for short-lived reindex/ingest files."""
    path = _BACKEND_ROOT / "data" / "tmp"
    path.mkdir(parents=True, exist_ok=True)
    return path
