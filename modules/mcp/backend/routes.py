"""MCP setup routes for Management → MCP (personal key + host snippets)."""
from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import ensure_connector_project_access, get_current_user_required
from app.db import get_db
from app.models import APIKey, APIKeyEnvironment, QueryLog, User
from app.settings import settings

from .auth_asgi import MCP_KEY_SCOPE
from .server import MCP_PUBLIC_PATH

router = APIRouter(prefix="/api/v1/mcp-setup", tags=["mcp"])


class McpSetupTemplateOut(BaseModel):
    mcp_url: str
    public_api_base: str
    cursor_snippet: str
    claude_desktop_snippet: str
    notes: list[str] = Field(default_factory=list)


class WorkspaceKeyOut(BaseModel):
    has_key: bool
    key_id: Optional[str] = None
    masked_key: Optional[str] = None
    last_used_at: Optional[str] = None
    active_project_id: Optional[str] = None
    mcp_url: str
    secret: Optional[str] = None


class WorkspaceKeyCreateIn(BaseModel):
    name: Optional[str] = None


class WorkspaceKeyActiveIn(BaseModel):
    is_active: bool


class WorkspaceKeyListItem(BaseModel):
    id: str
    name: str
    masked_key: Optional[str] = None
    is_active: bool
    created_at: Optional[str] = None
    last_used_at: Optional[str] = None
    request_count: int = 0


class WorkspaceKeyRevealOut(BaseModel):
    key: str


def _public_api_base(request: Request) -> str:
    if settings.public_api_base_url:
        base = settings.public_api_base_url.rstrip("/")
    else:
        base = str(request.base_url).rstrip("/")
    if base.endswith("/api/v1"):
        return base
    if base.endswith("/api"):
        return f"{base}/v1"
    return f"{base}/api/v1"


def _mcp_url(request: Request) -> str:
    """Public MCP URL with trailing slash (required for Streamable HTTP clients)."""
    base = _public_api_base(request)
    if base.endswith("/api/v1"):
        origin = base[: -len("/api/v1")]
    else:
        origin = str(request.base_url).rstrip("/")
    return f"{origin}{MCP_PUBLIC_PATH}"


def _snippet_headers(api_key_placeholder: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key_placeholder}",
    }


def _cursor_snippet(mcp_url: str, api_key_placeholder: str) -> str:
    payload = {
        "mcpServers": {
            "ragsuite": {
                "url": mcp_url,
                "headers": _snippet_headers(api_key_placeholder),
            }
        }
    }
    return json.dumps(payload, indent=2)


def _claude_snippet(mcp_url: str, api_key_placeholder: str) -> str:
    payload = {
        "mcpServers": {
            "ragsuite": {
                "type": "http",
                "url": mcp_url,
                "headers": _snippet_headers(api_key_placeholder),
            }
        }
    }
    return json.dumps(payload, indent=2)


@router.get("/template", response_model=McpSetupTemplateOut)
def get_mcp_setup_template(
    request: Request,
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Copy-paste Cursor / Claude Desktop snippets for the outbound MCP Connector."""
    ensure_connector_project_access(db, current_user, project_id)
    mcp_url = _mcp_url(request)
    placeholder = "<YOUR_RAGSUITE_API_KEY>"
    return McpSetupTemplateOut(
        mcp_url=mcp_url,
        public_api_base=_public_api_base(request),
        cursor_snippet=_cursor_snippet(mcp_url, placeholder),
        claude_desktop_snippet=_claude_snippet(mcp_url, placeholder),
        notes=[
            "RAGSuite MCP is outbound (Cursor/Claude/Manus → RAGSuite). Sources connectors stay under Sources.",
            "Use the personal MCP key from Management → MCP (rgs_live_…). Project API keys are not accepted.",
            "URL must end with /api/v1/mcp/ (trailing slash).",
            "Set PUBLIC_API_BASE_URL to your public API origin so Host checks and snippets match.",
            "Restart the API after changing PUBLIC_API_BASE_URL.",
            "Knowledge tools: search_knowledge, ask_knowledge, list_sources, connector_status.",
            "Platform tools: projects, history/queries, crawl, documents, chatbot/search/widget settings, connector sync, jobs, metrics.",
            "All write tools require confirm=true. No deletes. OAuth connect stays in the RAGSuite UI.",
            "Each personal MCP key covers every project you can access. Pass project_id or call set_active_project.",
            "Index product docs as crawl sources; denylist demo domains; reindex crawls after document_id upgrades.",
        ],
    )


def _mask_secret(token: str) -> str:
    if len(token) < 16:
        return "••••"
    return f"{token[:12]}…{token[-4:]}"


def _workspace_key_query(db: Session, user_id: int):
    return (
        db.query(APIKey)
        .filter(
            APIKey.created_by_id == user_id,
            APIKey.key_scope == MCP_KEY_SCOPE,
            APIKey.is_active.is_(True),
        )
        .order_by(APIKey.created_at.desc())
    )


def _all_workspace_keys_query(db: Session, user_id: int):
    return (
        db.query(APIKey)
        .filter(
            APIKey.created_by_id == user_id,
            APIKey.key_scope == MCP_KEY_SCOPE,
        )
        .order_by(APIKey.created_at.desc())
    )


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _list_item(row: APIKey) -> WorkspaceKeyListItem:
    return WorkspaceKeyListItem(
        id=str(row.id),
        name=row.name or "MCP",
        masked_key=_mask_secret(row.key) if row.key else None,
        is_active=bool(row.is_active),
        created_at=_iso(row.created_at),
        last_used_at=_iso(row.last_used_at),
        request_count=int(row.request_count or 0),
    )


def _owned_mcp_key(db: Session, key_id: uuid.UUID, user: User) -> APIKey:
    row = (
        db.query(APIKey)
        .filter(
            APIKey.id == key_id,
            APIKey.created_by_id == user.id,
            APIKey.key_scope == MCP_KEY_SCOPE,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP key not found")
    return row


def _key_name(raw: Optional[str]) -> str:
    label = (raw or "").strip()
    if not label:
        return "MCP"
    return label[:255]


def _workspace_status(request: Request, row: Optional[APIKey], *, secret: Optional[str] = None) -> WorkspaceKeyOut:
    return WorkspaceKeyOut(
        has_key=row is not None,
        key_id=str(row.id) if row else None,
        masked_key=_mask_secret(row.key) if row and row.key else None,
        last_used_at=row.last_used_at.isoformat() if row and row.last_used_at else None,
        active_project_id=str(row.mcp_active_project_id) if row and row.mcp_active_project_id else None,
        mcp_url=_mcp_url(request),
        secret=secret,
    )


def _issue_workspace_key(db: Session, user: User, name: Optional[str] = None) -> tuple[APIKey, str]:
    token = "rgs_live_" + secrets.token_urlsafe(32)
    row = APIKey(
        name=_key_name(name),
        description="Personal MCP key",
        key=token,
        key_hash=hashlib.sha256(token.encode()).hexdigest(),
        environment=APIKeyEnvironment.PRODUCTION,
        rate_limit=100,
        is_active=True,
        request_count=0,
        created_by_id=user.id,
        project_id=None,
        key_scope=MCP_KEY_SCOPE,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, token


@router.get("/workspace-key", response_model=WorkspaceKeyOut)
def get_workspace_key(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Masked status for the current user's personal MCP key. Never returns the secret."""
    row = _workspace_key_query(db, current_user.id).first()
    return _workspace_status(request, row)


@router.get("/workspace-keys", response_model=list[WorkspaceKeyListItem])
def list_workspace_keys(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Active and inactive personal MCP keys for the current user. Never returns secrets."""
    return [_list_item(row) for row in _all_workspace_keys_query(db, current_user.id).all()]


@router.post("/workspace-key", response_model=WorkspaceKeyOut, status_code=status.HTTP_201_CREATED)
def create_workspace_key(
    request: Request,
    payload: Optional[WorkspaceKeyCreateIn] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Create another personal MCP key. The secret is returned only in this response."""
    row, token = _issue_workspace_key(db, current_user, payload.name if payload else None)
    return _workspace_status(request, row, secret=token)


@router.post("/workspace-key/rotate", response_model=WorkspaceKeyOut)
def rotate_workspace_key(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Revoke the current personal MCP key and return a new secret once."""
    current = _workspace_key_query(db, current_user.id).all()
    for row in current:
        row.is_active = False
        row.updated_at = datetime.utcnow()
        db.add(row)
    if current:
        db.commit()
    row, token = _issue_workspace_key(db, current_user)
    return _workspace_status(request, row, secret=token)


@router.get("/workspace-key/{key_id}/reveal", response_model=WorkspaceKeyRevealOut)
def reveal_workspace_key(
    key_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Return the full secret for an active personal MCP key owned by the current user."""
    row = _owned_mcp_key(db, key_id, current_user)
    if not row.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This MCP key is inactive.")
    token = (row.key or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MCP key secret is not available.")
    return WorkspaceKeyRevealOut(key=token)


@router.patch("/workspace-key/{key_id}", response_model=WorkspaceKeyListItem)
def set_workspace_key_active(
    key_id: uuid.UUID,
    payload: WorkspaceKeyActiveIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Turn one personal MCP key on or off. Other keys are left unchanged."""
    row = _owned_mcp_key(db, key_id, current_user)
    row.is_active = bool(payload.is_active)
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.commit()
    db.refresh(row)
    return _list_item(row)


@router.delete("/workspace-key/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace_key(
    key_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Delete one personal MCP key. Project API keys are not reachable here."""
    row = _owned_mcp_key(db, key_id, current_user)
    db.query(QueryLog).filter(QueryLog.apikey_id == row.id).update({QueryLog.apikey_id: None})
    db.delete(row)
    db.commit()
    return None
