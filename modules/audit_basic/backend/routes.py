"""
Audit log API — project-scoped list/detail for project owners.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, desc, func, or_
from sqlalchemy.orm import Session

from app.auth import get_active_project, get_current_user_required
from app.db import get_db
from app.models import AuditEvent, Project, User
from app.schemas import AuditEventActorOut, AuditEventListOut, AuditEventOut
from app.services.audit_service import ACCOUNT_SCOPED_EVENT_TYPES

router = APIRouter(prefix="/api/v1/audit-events", tags=["Audit"])


def _resolve_target_project(
    db: Session,
    current_user: User,
    active_project: Project,
    project_id: Optional[uuid.UUID],
    all_projects: bool,
) -> tuple[Optional[uuid.UUID], bool]:
    """Returns (filter_project_id, account_only)."""
    if project_id is not None:
        project = db.query(Project).filter(
            and_(Project.id == project_id, Project.owner_id == current_user.id)
        ).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found or access denied")
        return project_id, False
    if all_projects:
        return None, False
    return active_project.id, False


def _owned_project_ids(db: Session, user_id: int) -> List[uuid.UUID]:
    rows = db.query(Project.id).filter(Project.owner_id == user_id).all()
    return [r[0] for r in rows]


def _viewer_identity_aliases(user: User) -> List[str]:
    aliases: List[str] = []
    if user.username:
        aliases.append(user.username.strip().lower())
    if user.email:
        email = user.email.strip().lower()
        if email not in aliases:
            aliases.append(email)
    return aliases


def _owned_account_events_clause(user: User):
    return and_(AuditEvent.project_id.is_(None), AuditEvent.user_id == user.id)


def _unknown_failed_login_for_viewer(user: User):
    """Failed sign-in with no matched user_id but username matches this account."""
    aliases = _viewer_identity_aliases(user)
    if not aliases:
        return and_(AuditEvent.id.is_(None))
    username_json = func.lower(AuditEvent.details["username"].as_string())
    return and_(
        AuditEvent.project_id.is_(None),
        AuditEvent.user_id.is_(None),
        AuditEvent.event_type == "auth.login.failed",
        username_json.in_(aliases),
    )


def _account_visibility_clause(user: User):
    return or_(_owned_account_events_clause(user), _unknown_failed_login_for_viewer(user))


def _can_view_audit_row(row: AuditEvent, current_user: User, db: Session) -> bool:
    if row.project_id is None:
        if row.user_id == current_user.id:
            return True
        if row.event_type == "auth.login.failed" and row.user_id is None:
            aliases = _viewer_identity_aliases(current_user)
            attempted = ((row.details or {}).get("username") or "").strip().lower()
            return bool(aliases) and attempted in aliases
        return False
    project = db.query(Project).filter(
        and_(Project.id == row.project_id, Project.owner_id == current_user.id)
    ).first()
    return project is not None


def _event_to_out(row: AuditEvent, project_names: dict) -> AuditEventOut:
    actor = None
    if row.user_id and getattr(row, "_actor_user", None):
        u = row._actor_user
        actor = AuditEventActorOut(id=u.id, username=u.username, email=u.email)
    elif row.user_id:
        actor = AuditEventActorOut(id=row.user_id)
    return AuditEventOut(
        id=row.id,
        timestamp=row.timestamp,
        project_id=row.project_id,
        project_name=project_names.get(row.project_id) if row.project_id else None,
        user_id=row.user_id,
        api_key_id=row.api_key_id,
        actor_type=row.actor_type,
        actor=actor,
        event_type=row.event_type,
        category=row.category,
        severity=row.severity,
        status=row.status,
        action=row.action,
        resource_type=row.resource_type,
        resource_id=row.resource_id,
        summary=row.summary,
        details=row.details,
        ip_address=row.ip_address,
        user_agent=row.user_agent,
    )


@router.get("", response_model=AuditEventListOut, summary="List audit events")
async def list_audit_events(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    project_id: Optional[uuid.UUID] = Query(
        None, description="Project UUID, or omit for active project"
    ),
    account_only: bool = Query(False, description="Only account-level (no project) events"),
    all_projects: bool = Query(False, description="Events across all owned projects"),
    q: Optional[str] = Query(None, description="Search summary, action, event_type"),
    category: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    filter_pid, acct_only = _resolve_target_project(
        db, current_user, active_project, project_id, all_projects
    )
    if account_only:
        acct_only = True

    owned_ids = _owned_project_ids(db, current_user.id)
    access_clauses = [_account_visibility_clause(current_user)]
    if owned_ids:
        access_clauses.append(AuditEvent.project_id.in_(owned_ids))
    query = db.query(AuditEvent).filter(or_(*access_clauses))

    if acct_only:
        query = query.filter(_account_visibility_clause(current_user))
    elif all_projects:
        pass
    elif filter_pid is not None:
        query = query.filter(
            or_(
                AuditEvent.project_id == filter_pid,
                and_(
                    AuditEvent.project_id.is_(None),
                    AuditEvent.user_id == current_user.id,
                    AuditEvent.event_type.in_(ACCOUNT_SCOPED_EVENT_TYPES),
                ),
            )
        )

    if q:
        pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                AuditEvent.summary.ilike(pattern),
                AuditEvent.action.ilike(pattern),
                AuditEvent.event_type.ilike(pattern),
            )
        )
    if category:
        query = query.filter(AuditEvent.category == category)
    if severity:
        query = query.filter(AuditEvent.severity == severity)
    if status:
        query = query.filter(AuditEvent.status == status)
    if event_type:
        query = query.filter(AuditEvent.event_type == event_type)
    # Community: retain/list at most last 30 days (Enterprise audit_full lifts this).
    from datetime import datetime, timezone, timedelta
    ceiling = datetime.now(timezone.utc) - timedelta(days=30)
    if start_date is None or start_date < ceiling:
        start_date = ceiling

    if start_date:
        query = query.filter(AuditEvent.timestamp >= start_date)
    if end_date:
        query = query.filter(AuditEvent.timestamp <= end_date)

    total = query.count()
    rows = (
        query.order_by(desc(AuditEvent.timestamp))
        .offset(offset)
        .limit(limit)
        .all()
    )

    user_ids = {r.user_id for r in rows if r.user_id}
    users_map = {}
    if user_ids:
        for u in db.query(User).filter(User.id.in_(user_ids)).all():
            users_map[u.id] = u
    for r in rows:
        if r.user_id and r.user_id in users_map:
            r._actor_user = users_map[r.user_id]

    pids = {r.project_id for r in rows if r.project_id}
    project_names = {}
    if pids:
        for p in db.query(Project).filter(Project.id.in_(pids)).all():
            project_names[p.id] = p.name

    return AuditEventListOut(
        events=[_event_to_out(r, project_names) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{event_id}", response_model=AuditEventOut, summary="Get audit event detail")
async def get_audit_event(
    event_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    row = db.query(AuditEvent).filter(AuditEvent.id == event_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Audit event not found")

    if not _can_view_audit_row(row, current_user, db):
        raise HTTPException(status_code=404, detail="Audit event not found")

    if row.user_id:
        u = db.query(User).filter(User.id == row.user_id).first()
        if u:
            row._actor_user = u

    project_names = {}
    if row.project_id:
        p = db.query(Project).filter(Project.id == row.project_id).first()
        if p:
            project_names[p.id] = p.name

    return _event_to_out(row, project_names)
