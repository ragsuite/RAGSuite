"""Soft shim — integration analytics lives in EE Extension ``analytics``."""
from __future__ import annotations

try:
    from ragsuite_modules.analytics.backend.integration_routes import *  # noqa: F403
    from ragsuite_modules.analytics.backend.integration_routes import router
except ImportError:
    from fastapi import APIRouter

    router = APIRouter()
