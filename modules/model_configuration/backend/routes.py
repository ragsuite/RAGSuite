"""Model Configuration API — project-wide AI provider configs."""
from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import ensure_project_access, get_current_user_required
from app.db import get_db
from app.models import Project, User
from app.platform.auth import project_permissions_for_user
from app.services.audit_service import emit_audit
from app.services.project_model_provider_save import save_verified_provider_config
from app.services.project_model_provider_sync import propagate_provider_to_settings
from app.services.project_model_providers import (
    ProviderConfigError,
    build_providers_payload,
    delete_provider_config,
    normalize_provider,
    serialize_provider_config,
    test_provider_config,
)
from app.services.project_permissions import has_effective_permission

router = APIRouter(prefix="/api/v1/model-configuration", tags=["Model Configuration"])

REQUIRED_PERMISSIONS = ("chatbot:settings", "search:settings")


class ProviderConfigIn(BaseModel):
    chat_model: str = Field(..., min_length=1, max_length=100)
    embedding_model: Optional[str] = Field(None, max_length=100)
    api_key: Optional[str] = Field(None, max_length=500)
    temperature: Optional[float] = Field(None, ge=0, le=2, description="Legacy: applies to both surfaces")
    chat_temperature: Optional[float] = Field(None, ge=0, le=2)
    search_temperature: Optional[float] = Field(None, ge=0, le=2)
    chat_similarity_threshold: Optional[float] = Field(None, ge=0, le=1)
    search_similarity_threshold: Optional[float] = Field(None, ge=0, le=1)
    chat_max_tokens: Optional[int] = Field(None, ge=0, le=3000)
    search_max_tokens: Optional[int] = Field(None, ge=0, le=3000)


class ProviderTestIn(BaseModel):
    chat_model: Optional[str] = Field(None, max_length=100)
    embedding_model: Optional[str] = Field(None, max_length=100)
    api_key: Optional[str] = Field(None, max_length=500)


def _ok(data: Any, message: str = "") -> Dict[str, Any]:
    return {"success": True, "data": data, "message": message}


def _project_for_settings(db: Session, user: User, project_id: str) -> Project:
    try:
        project_uuid = uuid.UUID(str(project_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project_id")
    project = ensure_project_access(db, user, project_uuid)
    permissions = project_permissions_for_user(db, user, project)
    if not any(has_effective_permission(permissions, p) for p in REQUIRED_PERMISSIONS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing permission: chatbot:settings or search:settings",
        )
    return project


def _provider_or_400(provider: str) -> str:
    try:
        return normalize_provider(provider)
    except ProviderConfigError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/providers")
def list_providers(
    project_id: str = Query(...),
    live: bool = Query(True, description="Probe providers for live model lists (slower)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    project = _project_for_settings(db, current_user, project_id)
    return _ok(build_providers_payload(db, project.id, include_live=live))


@router.put("/providers/{provider}")
async def save_provider(
    provider: str,
    payload: ProviderConfigIn,
    request: Request,
    project_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    project = _project_for_settings(db, current_user, project_id)
    provider_key = _provider_or_400(provider)
    data: Dict[str, Any] = payload.model_dump(exclude_unset=True)
    try:
        row = await save_verified_provider_config(
            db, project_id=project.id, provider=provider_key, user_id=current_user.id, data=data
        )
    except ProviderConfigError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    propagate_provider_to_settings(db, project.id, provider_key)
    emit_audit(
        event_type="config.model_provider.updated",
        request=request,
        user_id=current_user.id,
        project_id=project.id,
        resource_type="project_model_provider",
        resource_id=str(row.id),
        summary=f"Model provider {provider_key} configuration saved",
    )
    return _ok(serialize_provider_config(row, provider_key), "Provider configuration saved")


@router.post("/providers/{provider}/test")
async def test_provider(
    provider: str,
    payload: ProviderTestIn,
    project_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    project = _project_for_settings(db, current_user, project_id)
    provider_key = _provider_or_400(provider)
    results = await test_provider_config(
        db,
        project_id=project.id,
        provider=provider_key,
        chat_model=payload.chat_model,
        embedding_model=payload.embedding_model,
        api_key=payload.api_key,
    )
    return _ok(results, "Configuration test completed")


@router.delete("/providers/{provider}")
def delete_provider(
    provider: str,
    request: Request,
    project_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    project = _project_for_settings(db, current_user, project_id)
    provider_key = _provider_or_400(provider)
    deleted = delete_provider_config(db, project.id, provider_key)
    if deleted:
        emit_audit(
            event_type="config.model_provider.deleted",
            request=request,
            user_id=current_user.id,
            project_id=project.id,
            resource_type="project_model_provider",
            resource_id=provider_key,
            summary=f"Model provider {provider_key} configuration removed",
        )
    return _ok({"deleted": deleted, "provider": provider_key})
