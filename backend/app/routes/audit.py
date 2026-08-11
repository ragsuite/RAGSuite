"""Soft shim — list/get live in CE module ``audit_basic``."""
from __future__ import annotations

try:
    from ragsuite_modules.audit_basic.backend.routes import *  # noqa: F403
    from ragsuite_modules.audit_basic.backend.routes import router
except ImportError:
    from fastapi import APIRouter

    router = APIRouter(prefix="/api/v1/audit-events", tags=["Audit"])
