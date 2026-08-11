"""
n8n integration routes — per-project configuration, connection tests, inbound templates.
"""
import asyncio
import functools
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..auth import (
    ensure_connector_project_access,
    get_current_user_required,
    try_connector_project_access,
)
from ..db import get_db
from ..models import (
    APIKey,
    APIKeyEnvironment,
    N8nIntegration,
    N8nIntegrationStatus,
    Project,
    User,
)
from ..schemas import (
    APIKeyEnvironment as SchemaAPIKeyEnvironment,
    N8nConfigUpsertRequest,
    N8nEnableRequest,
    N8nInboundTemplateOut,
    N8nIntegrationOut,
    N8nIntegrationStatus as SchemaN8nStatus,
    N8nRetrieveTestOut,
    N8nRetrieveTestRequest,
    N8nTestConnectionOut,
)
from ..security_utils import decrypt_secret, encrypt_secret
from ..services.audit_service import emit_audit
from ..services import n8n_service
from ..settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/n8n", tags=["n8n"])

_ENV_ORDER = (
    APIKeyEnvironment.DEVELOPMENT,
    APIKeyEnvironment.STAGING,
    APIKeyEnvironment.PRODUCTION,
)



def _to_schema_status(status: N8nIntegrationStatus) -> SchemaN8nStatus:
    return SchemaN8nStatus(status.value)


def _integration_to_out(db: Session, row: N8nIntegration) -> N8nIntegrationOut:
    preview = None
    if row.linked_ragsuite_api_key_id:
        linked = db.query(APIKey).filter(APIKey.id == row.linked_ragsuite_api_key_id).first()
        if linked and linked.key:
            k = linked.key
            preview = (k[:12] + "..." + k[-4:]) if len(k) > 16 else k
    return N8nIntegrationOut(
        id=row.id,
        project_id=row.project_id,
        environment=SchemaAPIKeyEnvironment(row.environment.value),
        base_url=row.base_url,
        has_api_key=bool(row.api_key_encrypted),
        is_enabled=row.is_enabled,
        status=_to_schema_status(row.status),
        last_test_at=row.last_test_at,
        last_error=row.last_error,
        linked_ragsuite_api_key_id=row.linked_ragsuite_api_key_id,
        linked_api_key_preview=preview,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


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


@router.get("/status", response_model=List[N8nIntegrationOut])
def list_n8n_status(
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """List n8n configs for all environments (creates placeholder rows are not auto-created)."""
    if not try_connector_project_access(db, current_user, project_id):
        return []
    rows = (
        db.query(N8nIntegration)
        .filter(
            N8nIntegration.user_id == current_user.id,
            N8nIntegration.project_id == project_id,
        )
        .all()
    )
    by_env = {r.environment: r for r in rows}
    result: List[N8nIntegrationOut] = []
    for env in _ENV_ORDER:
        if env in by_env:
            result.append(_integration_to_out(db, by_env[env]))
    return result


@router.put("/config", response_model=N8nIntegrationOut)
def upsert_n8n_config(
    body: N8nConfigUpsertRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    ensure_connector_project_access(db, current_user, body.project_id)

    try:
        base_url = n8n_service.normalize_base_url(body.base_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    env_model = APIKeyEnvironment(body.environment.value)

    row = (
        db.query(N8nIntegration)
        .filter(
            N8nIntegration.user_id == current_user.id,
            N8nIntegration.project_id == body.project_id,
            N8nIntegration.environment == env_model,
        )
        .first()
    )
    created = row is None
    if not row:
        row = N8nIntegration(
            user_id=current_user.id,
            project_id=body.project_id,
            environment=env_model,
            base_url=base_url,
            is_enabled=False,
            status=N8nIntegrationStatus.DISCONNECTED,
        )
        db.add(row)

    row.base_url = base_url
    if body.api_key is not None and body.api_key.strip():
        row.api_key_encrypted = encrypt_secret(body.api_key.strip())
    if body.is_enabled is not None:
        row.is_enabled = body.is_enabled
    if body.linked_ragsuite_api_key_id is not None:
        if body.linked_ragsuite_api_key_id:
            linked = (
                db.query(APIKey)
                .filter(
                    APIKey.id == body.linked_ragsuite_api_key_id,
                    APIKey.project_id == body.project_id,
                    APIKey.created_by_id == current_user.id,
                )
                .first()
            )
            if not linked:
                raise HTTPException(status_code=400, detail="Linked API key not found for this project.")
        row.linked_ragsuite_api_key_id = body.linked_ragsuite_api_key_id

    db.commit()
    db.refresh(row)

    emit_audit(
        event_type="n8n.config.created" if created else "n8n.config.updated",
        request=request,
        user_id=current_user.id,
        project_id=body.project_id,
        resource_type="n8n_integration",
        resource_id=str(row.id),
        summary=f"n8n config {'created' if created else 'updated'} ({env_model.value})",
    )

    return _integration_to_out(db, row)


@router.patch("/{integration_id}/enable", response_model=N8nIntegrationOut)
def set_n8n_enabled(
    integration_id: uuid.UUID,
    body: N8nEnableRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    row = (
        db.query(N8nIntegration)
        .filter(N8nIntegration.id == integration_id, N8nIntegration.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="n8n integration not found")

    row.is_enabled = body.is_enabled
    if not body.is_enabled:
        row.last_error = None
        if row.status == N8nIntegrationStatus.ERROR:
            row.status = N8nIntegrationStatus.DISCONNECTED
    db.commit()
    db.refresh(row)

    emit_audit(
        event_type="n8n.enabled" if body.is_enabled else "n8n.disabled",
        request=request,
        user_id=current_user.id,
        project_id=row.project_id,
        resource_type="n8n_integration",
        resource_id=str(row.id),
        summary=f"n8n integration {'enabled' if body.is_enabled else 'disabled'} ({row.environment.value})",
    )

    return _integration_to_out(db, row)


@router.post("/{integration_id}/test", response_model=N8nTestConnectionOut)
def test_n8n_connection(
    integration_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    row = (
        db.query(N8nIntegration)
        .filter(N8nIntegration.id == integration_id, N8nIntegration.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="n8n integration not found")
    if not row.api_key_encrypted:
        raise HTTPException(status_code=400, detail="n8n API key is not configured. Save an API key first.")

    try:
        api_key = decrypt_secret(row.api_key_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt stored n8n credentials.")

    ok, message = n8n_service.test_n8n_connection(row.base_url, api_key)
    row.last_test_at = datetime.now(timezone.utc)
    row.last_error = None if ok else message
    row.status = N8nIntegrationStatus.CONNECTED if ok else N8nIntegrationStatus.ERROR
    db.commit()

    emit_audit(
        event_type="n8n.test.success" if ok else "n8n.test.failure",
        request=request,
        user_id=current_user.id,
        project_id=row.project_id,
        resource_type="n8n_integration",
        resource_id=str(row.id),
        status="success" if ok else "failure",
        summary=message,
    )

    return N8nTestConnectionOut(
        success=ok,
        message=message,
        status=_to_schema_status(row.status),
    )


@router.delete("/{integration_id}")
def delete_n8n_config(
    integration_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    row = (
        db.query(N8nIntegration)
        .filter(N8nIntegration.id == integration_id, N8nIntegration.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="n8n integration not found")

    project_id = row.project_id
    env_label = row.environment.value
    db.delete(row)
    db.commit()

    emit_audit(
        event_type="n8n.config.deleted",
        request=request,
        user_id=current_user.id,
        project_id=project_id,
        resource_type="n8n_integration",
        resource_id=str(integration_id),
        summary=f"n8n config deleted ({env_label})",
    )

    return {"message": "n8n configuration removed"}


@router.get("/inbound-template", response_model=N8nInboundTemplateOut)
def get_inbound_template(
    request: Request,
    project_id: uuid.UUID = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Copy-paste values for n8n HTTP Request node (inbound: n8n → Ragsuite)."""
    ensure_connector_project_access(db, current_user, project_id)
    base = _public_api_base(request)
    retrieve_url = f"{base}/retrieve"
    search_url = f"{base}/search"
    body = {"query": "What is our refund policy?", "top_k": 5, "use_reranker": False}
    import json

    body_json = json.dumps(body)
    curl_retrieve = (
        f'curl -X POST "{retrieve_url}" \\\n'
        f'  -H "Authorization: Bearer <YOUR_RAGSUITE_API_KEY>" \\\n'
        f'  -H "Content-Type: application/json" \\\n'
        f"  -d '{body_json}'"
    )
    curl_search = (
        f'curl -X POST "{search_url}" \\\n'
        f'  -H "Authorization: Bearer <YOUR_RAGSUITE_API_KEY>" \\\n'
        f'  -H "Content-Type: application/json" \\\n'
        f'  -d \'{{"query": "example search"}}\''
    )
    return N8nInboundTemplateOut(
        retrieve_url=retrieve_url,
        search_url=search_url,
        body_example=body,
        curl_retrieve=curl_retrieve,
        curl_search=curl_search,
    )


@router.post("/retrieve/test", response_model=N8nRetrieveTestOut)
async def test_retrieve(
    body: N8nRetrieveTestRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Test Ragsuite retrieval for the active project (validates inbound path)."""
    ensure_connector_project_access(db, current_user, body.project_id)
    project_id = str(body.project_id)

    try:
        from ..services.rag.singleton import get_pipeline
    except ImportError:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")

    pipeline = get_pipeline()
    if pipeline is None:
        raise HTTPException(status_code=503, detail="RAG pipeline not initialized")

    from ..services.rag.embedding_resolver import resolve_for_project
    from ..models import ChatbotSettings

    emb_provider, emb_model, emb_api_key = resolve_for_project(db, project_id, source="chat")
    chat_settings = db.query(ChatbotSettings).filter(ChatbotSettings.project_id == body.project_id).first()
    top_k = getattr(chat_settings, "chat_top_k", None) or body.top_k
    use_reranker = getattr(chat_settings, "chat_use_reranker", False) or False
    raw = getattr(chat_settings, "chat_similarity_threshold", None)
    similarity_threshold = float(raw) if raw is not None else None

    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            functools.partial(
                pipeline.retrieve_only,
                query=body.query,
                project_id=project_id,
                top_k=top_k,
                similarity_threshold=similarity_threshold,
                use_reranker=use_reranker,
                embedding_provider=emb_provider,
                embedding_model=emb_model,
                embedding_api_key=emb_api_key,
            ),
        )
        count = len(result.get("results") or [])
        emit_audit(
            event_type="n8n.retrieve.test.success",
            request=request,
            user_id=current_user.id,
            project_id=body.project_id,
            resource_type="n8n_integration",
            summary=f"Retrieve test succeeded ({count} results)",
        )
        return N8nRetrieveTestOut(
            success=True,
            message=f"Retrieval succeeded with {count} result(s).",
            result_count=count,
        )
    except Exception as exc:
        logger.error("n8n retrieve test failed: %s", exc, exc_info=True)
        emit_audit(
            event_type="n8n.retrieve.test.failure",
            request=request,
            user_id=current_user.id,
            project_id=body.project_id,
            resource_type="n8n_integration",
            status="failure",
            summary=str(exc)[:200],
        )
        return N8nRetrieveTestOut(success=False, message=f"Retrieval failed: {exc}", result_count=0)
