"""Soft shim — analytics routes live in EE Extension ``analytics``."""
from __future__ import annotations

try:
    from ragsuite_modules.analytics.backend.routes import *  # noqa: F403
    from ragsuite_modules.analytics.backend.routes import init_app_start_time, router
except ImportError:  # CE-alone
    from fastapi import APIRouter

    router = APIRouter(prefix="/api/v1/analytics", tags=["Analytics & Monitoring"])

    def init_app_start_time() -> None:
        return None
