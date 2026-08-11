"""Compatibility shim — Platform spine lives in ``app.platform`` (Phase 2)."""
from app.platform.limiter import *  # noqa: F403
from app.platform.limiter import limiter  # noqa: F401
