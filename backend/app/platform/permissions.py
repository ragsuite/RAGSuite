"""Permissions protocol facade (Platform — Phase 2).

Product RBAC (org → teams → users) stays in the ``organization`` module.
This module re-exports capability-check helpers used by the auth spine.
"""
from __future__ import annotations

# Re-export effective permission helpers from feature service for now;
# Phase 3 may relocate the catalog to Shared contracts.
from app.services.project_permissions import (  # noqa: F401
    CONNECTOR_PATH_PREFIXES,
    has_effective_permission,
)

__all__ = ["CONNECTOR_PATH_PREFIXES", "has_effective_permission"]
