"""
Read-only retention preview for org admins (cutoff, eligible counts, expiry estimates).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import AnalyticsDay, ChatMessage, Organization, Project, QueryLog
from .data_lifecycle_service import (
    clamp_retention_days,
    count_org_audit_events_eligible,
    RETENTION_DEFAULT_DAYS,
)

PURGE_INTERVAL_HOURS = 24


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _project_ids_for_org(db: Session, org_id: int) -> List[uuid.UUID]:
    rows = db.query(Project.id).filter(Project.org_id == org_id).all()
    return [r[0] for r in rows]


def build_retention_preview(
    db: Session,
    org: Organization,
    *,
    retention_days_override: Optional[int] = None,
) -> Dict[str, Any]:
    """Compute org-wide retention preview (dates always; purge counts when auto-delete is on)."""
    auto_delete = bool(org.retention_auto_delete)
    days = clamp_retention_days(
        retention_days_override if retention_days_override is not None else (org.retention_days or RETENTION_DEFAULT_DAYS)
    )

    now = _utcnow()
    cutoff = now - timedelta(days=days)
    project_ids = _project_ids_for_org(db, org.id)

    oldest_interaction_at: Optional[datetime] = None
    days_until_oldest_expires: Optional[int] = None
    eligible_counts = {
        "chat_messages": 0,
        "query_logs": 0,
        "analytics_days": 0,
        "audit_events": 0,
    }

    if project_ids:
        oldest_row = (
            db.query(func.min(ChatMessage.created_at))
            .filter(ChatMessage.project_id.in_(project_ids))
            .scalar()
        )
        if oldest_row is not None:
            oldest_interaction_at = oldest_row
            if oldest_interaction_at.tzinfo is None:
                oldest_interaction_at = oldest_interaction_at.replace(tzinfo=timezone.utc)
            age_days = max(0, (now - oldest_interaction_at).days)
            days_until_oldest_expires = max(0, days - age_days)

        if auto_delete:
            chat_count = (
                db.query(func.count(ChatMessage.id))
                .filter(
                    ChatMessage.project_id.in_(project_ids),
                    ChatMessage.created_at < cutoff,
                )
                .scalar()
                or 0
            )

            query_log_count = (
                db.query(func.count(QueryLog.id))
                .filter(
                    QueryLog.project_id.in_(project_ids),
                    QueryLog.timestamp < cutoff,
                )
                .scalar()
                or 0
            )

            cutoff_date = cutoff.replace(tzinfo=None) if cutoff.tzinfo else cutoff
            analytics_count = (
                db.query(func.count(AnalyticsDay.id))
                .filter(
                    AnalyticsDay.project_id.in_(project_ids),
                    AnalyticsDay.date < cutoff_date,
                )
                .scalar()
                or 0
            )
            eligible_counts = {
                "chat_messages": int(chat_count),
                "query_logs": int(query_log_count),
                "analytics_days": int(analytics_count),
                "audit_events": count_org_audit_events_eligible(
                    db,
                    org_id=org.id,
                    project_ids=project_ids,
                    cutoff=cutoff,
                ),
            }

    next_purge_estimate_at: Optional[datetime] = None
    if auto_delete and org.retention_last_purge_at:
        last = org.retention_last_purge_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        next_purge_estimate_at = last + timedelta(hours=PURGE_INTERVAL_HOURS)

    return {
        "cutoff_at": cutoff,
        "eligible_counts": eligible_counts,
        "new_data_expires_at": now + timedelta(days=days),
        "days_until_new_data_expires": days,
        "oldest_interaction_at": oldest_interaction_at,
        "days_until_oldest_expires": days_until_oldest_expires,
        "next_purge_estimate_at": next_purge_estimate_at,
        "auto_delete_active": auto_delete,
    }
