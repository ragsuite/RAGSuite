"""
Edition policy for the audit trail.

Community shows only the most recent ``COMMUNITY_AUDIT_WINDOW_DAYS`` of audit
events (list and detail). Older rows are never deleted, so moving to Enterprise
``audit_full`` restores full history. This is independent of the organization
data-retention policy.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

COMMUNITY_AUDIT_WINDOW_DAYS = 15
AUDIT_FULL_MODULE_ID = "audit_full"
AUDIT_FULL_ENTITLEMENT = "audit:read_full"


def _audit_full_installed() -> bool:
    try:
        from app.platform.ee_feature_gate import enterprise_module_loaded

        return enterprise_module_loaded(AUDIT_FULL_MODULE_ID)
    except Exception:
        logger.debug("audit retention: module presence check failed", exc_info=True)
        return False


def full_audit_history_enabled() -> bool:
    """True when the license grants full audit history and ``audit_full`` is present.

    License entitlements are module ids, so ``audit_full`` is the primary grant;
    ``audit:read_full`` is accepted as an explicit permission alias.
    """
    try:
        from app.platform.entitlement_deps import has_feature_entitlement

        if not (
            has_feature_entitlement(AUDIT_FULL_MODULE_ID)
            or has_feature_entitlement(AUDIT_FULL_ENTITLEMENT)
        ):
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
