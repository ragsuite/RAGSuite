"""Compatibility shim — Platform spine lives in ``app.platform`` (Phase 2)."""
from app.platform.settings import *  # noqa: F403
from app.platform.settings import settings  # noqa: F401 — explicit for common importers
