"""
Edition policy for the audit trail.

Community keeps only the most recent ``COMMUNITY_AUDIT_WINDOW_DAYS`` of audit
events (list, detail, and storage). Enterprise ``audit_full`` keeps full history.
This is independent of the organization data-retention policy.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from ..models import AuditEvent

logger = logging.getLogger(__name__)

COMMUNITY_AUDIT_WINDOW_DAYS = 15
AUDIT_FULL_MODULE_ID = "audit_full"
AUDIT_FULL_ENTITLEMENT = "audit:read_full"
PURGE_BATCH_SIZE = 1000


def _audit_full_installed() -> bool:
    try:
        from app.platform.ee_feature_gate import enterprise_module_loaded

        return enterprise_module_loaded(AUDIT_FULL_MODULE_ID)
    except Exception:
        logger.debug("audit retention: module presence check failed", exc_info=True)
        return False


def full_audit_history_enabled() -> bool:
    """True when the license grants full audit history and ``audit_full`` is present."""
    try:
        from app.platform.entitlement_deps import has_feature_entitlement

        if not has_feature_entitlement(AUDIT_FULL_ENTITLEMENT):
            return False
    except Exception:
        logger.debug("audit retention: entitlement check failed", exc_info=True)
        return False
    return _audit_full_installed()


def audit_list_window_days() -> Optional[int]:
    """Visible audit window in days; ``None`` means unlimited (Enterprise)."""
    return None if full_audit_history_enabled() else COMMUNITY_AUDIT_WINDOW_DAYS


def audit_window_cutoff(window_days: Optional[int], now: Optional[datetime] = None) -> Optional[datetime]:
    if window_days is None:
        return None
    return (now or datetime.now(timezone.utc)) - timedelta(days=window_days)


def audit_purge_allowed() -> bool:
    """Never purge while ``audit_full`` is installed, even if its license lapses."""
    return not _audit_full_installed()


def purge_community_audit_events(
    db: Session,
    *,
    dry_run: bool = False,
    now: Optional[datetime] = None,
) -> int:
    """Hard-delete audit events older than the Community window. Returns rows affected."""
    if not audit_purge_allowed():
        return 0

    cutoff = audit_window_cutoff(COMMUNITY_AUDIT_WINDOW_DAYS, now)
    expired = db.query(AuditEvent.id).filter(AuditEvent.timestamp < cutoff)
    if dry_run:
        return expired.count()

    deleted = 0
    while True:
        ids = [row[0] for row in expired.limit(PURGE_BATCH_SIZE).all()]
        if not ids:
            break
        db.query(AuditEvent).filter(AuditEvent.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        deleted += len(ids)
    return deleted


def run_community_audit_purge() -> int:
    """Scheduler entry point: own session, honours ``RETENTION_PURGE_DRY_RUN``."""
    if not audit_purge_allowed():
        logger.debug("community audit purge skipped: audit_full is installed")
        return 0

    from ..db import SessionLocal
    from .retention_purge_service import retention_purge_dry_run

    dry_run = retention_purge_dry_run()
    session = SessionLocal()
    try:
        count = purge_community_audit_events(session, dry_run=dry_run)
        logger.info(
            "community audit purge %s: events=%s window_days=%s",
            "dry-run" if dry_run else "completed",
            count,
            COMMUNITY_AUDIT_WINDOW_DAYS,
        )
        return count
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
