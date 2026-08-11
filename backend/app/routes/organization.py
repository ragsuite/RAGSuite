"""Soft shim — organization product routes live in EE Extension ``organization``."""
from __future__ import annotations

try:
    from ragsuite_modules.organization.backend.routes import *  # noqa: F403
    from ragsuite_modules.organization.backend.routes import router
except ImportError:
    from fastapi import APIRouter

    router = APIRouter(prefix="/api/v1/organization", tags=["Organization"])
