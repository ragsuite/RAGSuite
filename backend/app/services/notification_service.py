"""Compatibility shim — implementation in modules/notifications (Phase 3)."""
from __future__ import annotations

from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()


def create_notification(*args, **kwargs):
    from ragsuite_modules.notifications.backend.service import (  # noqa: WPS433
        create_notification as _impl,
    )

    return _impl(*args, **kwargs)


__all__ = ["create_notification"]
