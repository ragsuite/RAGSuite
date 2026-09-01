"""
Scheduled retention purge per organization policy.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import Organization, Project
from .audit_service import record_audit_event
from .data_lifecycle_service import (
    clamp_retention_days,
    purge_org_audit_events,
    purge_project_interaction_data,
)

logger = logging.getLogger(__name__)

BATCH_ORG_LIMIT = 50


def retention_purge_dry_run() -> bool:
    return (os.environ.get("RETENTION_PURGE_DRY_RUN") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def purge_expired_org_data(db: Optional[Session] = None) -> dict:
    """Run retention purge for all orgs with auto_delete enabled."""
    own_session = db is None
    session = db or SessionLocal()
    dry_run = retention_purge_dry_run()
    summary = {
        "dry_run": dry_run,
        "orgs_processed": 0,
        "projects_purged": 0,
        "total_messages": 0,
        "total_audit_events": 0,
        "errors": [],
    }
    try:
        orgs = (
            session.query(Organization)
            .filter(Organization.retention_auto_delete.is_(True))
            .limit(BATCH_ORG_LIMIT)
            .all()
        )
        now = datetime.now(timezone.utc)

        for org in orgs:
            days = clamp_retention_days(org.retention_days or 90)
            cutoff = now - timedelta(days=days)
            summary["orgs_processed"] += 1
            try:
                projects = session.query(Project).filter(Project.org_id == org.id).all()
                project_ids = [project.id for project in projects]
                org_total = 0
                for project in projects:
                    counts = purge_project_interaction_data(
                        session,
                        org_id=org.id,
                        project_id=project.id,
                        cutoff=cutoff,
                        retention_days=days,
                        initiated_by_user_id=None,
                        dry_run=dry_run,
                    )
                    org_total += counts.get("chat_messages", 0)
                    summary["projects_purged"] += 1
                audit_deleted = purge_org_audit_events(
                    session,
                    org_id=org.id,
                    project_ids=project_ids,
                    cutoff=cutoff,
                    dry_run=dry_run,
                )
                summary["total_messages"] += org_total
                summary["total_audit_events"] += audit_deleted
                if not dry_run:
                    org.retention_last_purge_at = now
                    session.commit()
                else:
                    session.rollback()
            except Exception as exc:
                session.rollback()
                err = f"org {org.id}: {exc}"
                summary["errors"].append(err)
                logger.warning("retention purge failed for org %s: %s", org.id, exc)
                record_audit_event(
                    event_type="data.retention.purge.failed",
                    actor_type="system",
                    status="failure",
                    resource_type="organization",
                    resource_id=str(org.id),
                    summary=f"Retention purge failed for org {org.id}",
                    details={"error": str(exc), "dry_run": dry_run},
                    db=session,
                )
                session.commit()

        if dry_run:
            logger.info(
                "retention purge dry-run: orgs=%s projects=%s messages=%s audit_events=%s",
                summary["orgs_processed"],
                summary["projects_purged"],
                summary["total_messages"],
                summary["total_audit_events"],
            )
        else:
            logger.info(
                "retention purge completed: orgs=%s projects=%s messages=%s audit_events=%s",
                summary["orgs_processed"],
                summary["projects_purged"],
                summary["total_messages"],
                summary["total_audit_events"],
            )
        return summary
    finally:
        if own_session:
            session.close()
