"""Compatibility shim — Platform spine lives in ``app.platform`` (Phase 2)."""
from app.platform.paths import *  # noqa: F403
from app.platform.paths import backend_root, data_tmp_dir  # noqa: F401
