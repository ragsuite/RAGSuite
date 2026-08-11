"""Pytest configuration for RAGSuite backend tests."""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Add the backend root so `app` package is importable during tests
sys.path.insert(0, os.path.dirname(__file__))

_EE_MARK_HINTS = (
    "pytestmark = pytest.mark.ee",
    "pytestmark=pytest.mark.ee",
    "@pytest.mark.ee",
)


def _ee_root_configured() -> bool:
    raw = (os.environ.get("RAGSUITE_EE_ROOT") or "").strip()
    if not raw:
        return False
    return Path(raw).expanduser().is_dir()


def pytest_ignore_collect(collection_path, config):  # noqa: ARG001
    """Skip EE-marked test modules when Enterprise tree is not attached (CE-alone CI).

    Pytest still imports marked modules during collection; soft EE shims lack
    symbols and blow up ImportError. Ignoring collection keeps CE CI green.
    Set RAGSUITE_EE_ROOT to a real EE checkout to collect and run ``-m ee``.
    """
    path = Path(str(collection_path))
    if path.suffix != ".py" or not path.name.startswith("test_"):
        return None
    if _ee_root_configured():
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    # Module-level ee mark only (first ~40 lines is enough for our suite)
    head = "\n".join(text.splitlines()[:80])
    if any(h in head for h in _EE_MARK_HINTS):
        return True
    return None
