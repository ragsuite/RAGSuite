"""Public embed frame-ancestors policy for nginx auth_request on /embed/*."""
from __future__ import annotations

import logging
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import IntegrationEmbed, Project
from ..services.embed_frame_ancestors import SELF_ONLY, build_embed_frame_ancestors
from ..services.integration_domains import get_domains_for_project

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/widget", tags=["Widget"])

EmbedSurface = Literal["chat", "search"]


def _policy_response(policy: str) -> JSONResponse:
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


@router.get("/embed-frame-policy")
def embed_frame_policy(
    request: Request,
    project_id: Optional[str] = Query(default=None),
    surface: Optional[str] = Query(default=None),
    path: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Always 200. Header ``X-Embed-CSP`` is copied onto /embed/* by nginx."""
    header_project = request.headers.get("x-embed-project-id")
    header_path = request.headers.get("x-original-uri")
    resolved_project = project_id or header_project
    resolved_path = path or header_path
    resolved_surface = infer_embed_surface(surface, resolved_path)

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
        return _policy_response(build_embed_frame_ancestors(domains))
    except Exception:
        logger.exception("embed-frame-policy lookup failed; defaulting to self")
        return _policy_response(SELF_ONLY)
