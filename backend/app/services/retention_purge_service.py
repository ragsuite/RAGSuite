"""
Scheduled data retention purge.

Retention is an Enterprise ``compliance`` feature: Community keeps data without
a time limit, so the job only runs when that module is licensed and loaded.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from ..db import SessionLocal

logger = logging.getLogger(__name__)

RETENTION_MODULE_ID = "compliance"


def retention_purge_dry_run() -> bool:
    return (os.environ.get("RETENTION_PURGE_DRY_RUN") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _skipped(reason: str) -> Dict[str, Any]:
    logger.debug("retention purge skipped: %s", reason)
    return {"skipped": True, "reason": reason}


def run_retention_purge(db: Optional[Session] = None) -> Dict[str, Any]:
    """Purge expired project data per Enterprise policy; no-op in Community."""
    from app.platform.ee_feature_gate import enterprise_feature_denial

    if enterprise_feature_denial(RETENTION_MODULE_ID) is not None:
        return _skipped("enterprise_locked")
    try:
        from ragsuite_modules.compliance.backend.purge import purge_expired_project_data
    except ImportError:
        return _skipped("module_unavailable")

    own_session = db is None
    session = db or SessionLocal()
    try:
        return purge_expired_project_data(session, dry_run=retention_purge_dry_run())
    finally:
        if own_session:
            session.close()
