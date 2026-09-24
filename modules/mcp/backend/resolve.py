"""Resolve projects, sources, documents, connectors, and members by name.

One match continues. Several matches are ambiguous. None is not found.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlalchemy.orm import Session

from .access import McpActor, McpToolError


def _like(value: str) -> str:
    return f"%{value.strip()}%"


def resolve_named(
    db: Session,
    actor: McpActor,
    kind: str,
    query: str,
    *,
    project_id: Optional[uuid.UUID] = None,
    limit: int = 8,
) -> dict[str, Any]:
    text = (query or "").strip()
    if not text:
        raise McpToolError("Say the name to look up.", code="bad_request")
    kind_key = (kind or "").strip().lower().replace(" ", "_")
    if kind_key in {"project", "projects"}:
        rows = _projects(db, actor, text, limit)
        label = "project"
    elif kind_key in {"crawl_source", "source", "crawl", "sources"}:
        rows = _sources(db, actor, text, project_id, limit)
        label = "crawl source"
    elif kind_key in {"document", "documents"}:
        rows = _documents(db, actor, text, project_id, limit)
        label = "document"
    elif kind_key in {"connector", "connectors"}:
        rows = _connectors(db, actor, text, project_id, limit)
        label = "connector"
    elif kind_key in {"member", "user", "members"}:
        rows = _members(db, actor, text, limit)
        label = "member"
    else:
        raise McpToolError(
            "Look up a project, crawl source, document, connector, or member.",
            code="bad_request",
        )
    if not rows:
        return {
            "ok": False,
            "success": False,
            "code": "not_found",
            "match": "none",
            "message": f"I couldn't find a {label} named '{text}'.",
            "candidates": [],
        }
    if len(rows) == 1:
        return {
            "ok": True,
            "success": True,
            "match": "one",
            "message": f"Found {label} '{rows[0]['name']}'.",
            "resource": rows[0],
            "candidates": rows,
        }
    names = ", ".join(row["name"] for row in rows[:5])
    return {
        "ok": False,
        "success": False,
        "code": "ambiguous",
        "match": "many",
        "message": f"I found {len(rows)} {label}s matching '{text}': {names}. Which one do you mean?",
        "candidates": rows,
    }


def _projects(db: Session, actor: McpActor, text: str, limit: int) -> list[dict]:
    from app.models import Project

    ids = list(actor.accessible_project_ids or [])
    if not ids:
        return []
    rows = (
        db.query(Project)
        .filter(Project.id.in_(ids), Project.name.ilike(_like(text)))
        .limit(limit)
        .all()
    )
    return [{"id": str(row.id), "name": row.name, "type": "project"} for row in rows]


def _sources(db: Session, actor: McpActor, text: str, project_id: Optional[uuid.UUID], limit: int) -> list[dict]:
    from app.models import CrawlSource

    q = db.query(CrawlSource).filter(CrawlSource.name.ilike(_like(text)))
    if project_id:
        q = q.filter(CrawlSource.project_id == project_id)
    else:
        ids = list(actor.accessible_project_ids or [])
        if not ids:
            return []
        q = q.filter(CrawlSource.project_id.in_(ids))
    rows = q.limit(limit).all()
    return [
        {"id": str(row.id), "name": row.name, "type": "crawl_source", "project_id": str(row.project_id)}
        for row in rows
    ]


def _documents(db: Session, actor: McpActor, text: str, project_id: Optional[uuid.UUID], limit: int) -> list[dict]:
    from app.models import UploadedDocument

    q = db.query(UploadedDocument).filter(UploadedDocument.title.ilike(_like(text)))
    if project_id:
        q = q.filter(UploadedDocument.project_id == project_id)
    else:
        ids = list(actor.accessible_project_ids or [])
        if not ids:
            return []
        q = q.filter(UploadedDocument.project_id.in_(ids))
    rows = q.limit(limit).all()
    return [
        {"id": str(row.id), "name": row.title, "type": "document", "project_id": str(row.project_id)}
        for row in rows
    ]


def _connectors(db: Session, actor: McpActor, text: str, project_id: Optional[uuid.UUID], limit: int) -> list[dict]:
    from app.models import ConnectorIntegration

    q = db.query(ConnectorIntegration).filter(ConnectorIntegration.account_label.ilike(_like(text)))
    if project_id:
        q = q.filter(ConnectorIntegration.project_id == project_id)
    else:
        ids = list(actor.accessible_project_ids or [])
        if not ids:
            return []
        q = q.filter(ConnectorIntegration.project_id.in_(ids))
    rows = q.limit(limit).all()
    return [
        {
            "id": str(row.id),
            "name": row.account_label or row.connector_type,
            "type": "connector",
            "project_id": str(row.project_id),
        }
        for row in rows
    ]


def _members(db: Session, actor: McpActor, text: str, limit: int) -> list[dict]:
    from app.auth import is_org_admin_user
    from app.models import OrganizationMember, User

    if not actor.user or not getattr(actor.user, "org_id", None):
        return []
    if not is_org_admin_user(db, actor.user):
        raise McpToolError("Only an organization admin can look up members.", code="not_org_admin")
    rows = (
        db.query(User)
        .join(OrganizationMember, OrganizationMember.user_id == User.id)
        .filter(
            OrganizationMember.org_id == actor.user.org_id,
            (User.username.ilike(_like(text))) | (User.email.ilike(_like(text))),
        )
        .limit(limit)
        .all()
    )
    return [{"id": str(row.id), "name": row.username, "type": "member", "email": row.email} for row in rows]
