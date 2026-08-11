"""Soft shim — SSO auth routes live in EE Extension ``sso``."""
from __future__ import annotations

try:
    from ragsuite_modules.sso.backend.auth_routes import *  # noqa: F403
    from ragsuite_modules.sso.backend.auth_routes import router
except ImportError:
    from fastapi import APIRouter

    router = APIRouter(prefix="/api/v1/auth/sso", tags=["SSO"])
