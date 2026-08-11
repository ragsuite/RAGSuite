"""Compatibility shim — router owned by modules/notifications (Phase 3)."""
from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()

from ragsuite_modules.notifications.backend.routes import router  # noqa: E402,F401

__all__ = ["router"]
