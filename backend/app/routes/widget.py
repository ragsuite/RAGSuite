"""Public embed frame-ancestors policy for nginx auth_request on /embed/*."""
from __future__ import annotations

import logging
import uuid
from typing import Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import IntegrationEmbed, Project
from ..services.embed_frame_ancestors import (
    SELF_ONLY,
    build_embed_frame_ancestors,
    build_embed_frame_ancestors_for_parent,
    parse_parent_origin,
    parent_origin_from_embed_path,
)
from ..services.integration_domains import get_domains_for_project

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/widget", tags=["Widget"])

EmbedSurface = Literal["chat", "search"]


def _policy_response(policy: str) -> JSONResponse:
    """Known deny/allow — always 200 so nginx copies X-Embed-CSP onto /embed/*."""
    return JSONResponse(
        content={},
        status_code=200,
        headers={"X-Embed-CSP": policy, "Cache-Control": "no-store"},
    )


def infer_embed_surface(surface: str | None, path: str | None) -> EmbedSurface:
    token = (surface or "").strip().lower()
    if token in ("search",):
        return "search"
    if token in ("chat", "chatbot"):
        return "chat"
    raw_path = (path or "").lower()
    if "/embed/search" in raw_path:
        return "search"
    return "chat"


def _parse_project_id(raw: str | None) -> uuid.UUID | None:
    value = str(raw or "").strip()
    if not value:
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def resolve_embed_parent_origin(
    *,
    query_parent: str | None,
    path_or_uri: str | None,
    referer: str | None,
) -> str | None:
    """Prefer explicit parentOrigin, then embed URI query, then Referer origin."""
    for candidate in (query_parent,):
        origin = parse_parent_origin(candidate)
        if origin:
            return origin
    from_path = parent_origin_from_embed_path(path_or_uri)
    if from_path:
        return from_path
    if referer:
        try:
            parsed = urlparse(referer.strip())
            if parsed.scheme in ("http", "https") and parsed.hostname:
                return parse_parent_origin(f"{parsed.scheme}://{parsed.netloc}")
        except Exception:
            return None
    return None


@router.get("/embed-frame-policy")
def embed_frame_policy(
    request: Request,
    project_id: Optional[str] = Query(default=None),
    surface: Optional[str] = Query(default=None),
    path: Optional[str] = Query(default=None),
    parent_origin: Optional[str] = Query(default=None),
    parentOrigin: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Return ``X-Embed-CSP`` for nginx ``auth_request`` on /embed/*.

    When the embedding parent origin is known and on Allowed Domains, CSP lists
    only that parent (no full allowlist leak). Missing parent falls back to the
    full allowlist (legacy loaders). Present-but-unauthorized → SELF_ONLY.

    Known denies (missing/invalid project, unknown project, empty allowlist) are
    HTTP 200 + ``frame-ancestors 'self'``. Lookup/infra failures are HTTP 503 so
    nginx ``@embed_without_policy`` can fail-open with ``frame-ancestors *``.
    """
    header_project = request.headers.get("x-embed-project-id")
    header_path = request.headers.get("x-original-uri")
    resolved_project = project_id or header_project
    resolved_path = path or header_path
    resolved_surface = infer_embed_surface(surface, resolved_path)
    query_parent = parentOrigin or parent_origin

    project_uuid = _parse_project_id(resolved_project)
    if project_uuid is None:
        return _policy_response(SELF_ONLY)

    try:
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            return _policy_response(SELF_ONLY)

        embed_config = (
            db.query(IntegrationEmbed)
            .filter(IntegrationEmbed.user_id == project.owner_id)
            .first()
        )
        keys_data = (embed_config.keys or {}) if embed_config else {}
        kind = "search" if resolved_surface == "search" else "chatbot"
        domains = get_domains_for_project(keys_data, project_uuid, kind)

        parent = resolve_embed_parent_origin(
            query_parent=query_parent,
            path_or_uri=resolved_path,
            referer=request.headers.get("referer") or request.headers.get("referrer"),
        )
        if parent:
            return _policy_response(
                build_embed_frame_ancestors_for_parent(domains, parent)
            )
        # Legacy loaders / missing Referer — full allowlist (backward compatible).
        return _policy_response(build_embed_frame_ancestors(domains))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("embed-frame-policy lookup failed; signaling outage to nginx")
        raise HTTPException(
            status_code=503,
            detail="embed_frame_policy_unavailable",
        ) from exc
