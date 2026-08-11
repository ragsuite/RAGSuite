import uuid
import asyncio
import functools
import logging
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..auth import get_project_id_or_user
from ..limiter import limiter
from ..models import Project

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["retrieve"])

try:
    from ..services.rag.singleton import get_pipeline as _get_pipeline
    _RAG_AVAILABLE = True
except ImportError:
    _RAG_AVAILABLE = False
    _get_pipeline = None  # type: ignore


class RetrieveRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(5, ge=1, le=50)
    min_score: Optional[int] = Field(None, ge=0, le=100, description="Minimum similarity score (0-100)")
    use_reranker: bool = Field(False)


class RetrieveResultItem(BaseModel):
    text: str
    score: int
    rank: int
    metadata: Dict[str, Any]


class RetrieveResponse(BaseModel):
    results: List[RetrieveResultItem]
    retrieval_meta: Dict[str, Any]
    request_id: str


@router.post("/retrieve", response_model=RetrieveResponse)
@limiter.limit("60/minute")
async def retrieve(
    req: RetrieveRequest,
    request: Request,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user),
):
    """
    Pure retrieval endpoint for external integrations (n8n, automation workflows).
    Returns matching chunks, scores, and metadata. No LLM synthesis performed.
    """
    if not _RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")

    pipeline = _get_pipeline()
    if pipeline is None:
        raise HTTPException(status_code=503, detail="RAG pipeline not initialized")

    auth_type = auth.get("type")

    if auth_type == "api_key":
        api_key = auth["api_key"]
        if not getattr(api_key, "project_id", None):
            raise HTTPException(status_code=400, detail="API key not bound to a project")
        project = db.query(Project).filter(Project.id == api_key.project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        project_id = str(project.id)
    elif auth_type == "user":
        user = auth["user"]
        project = (
            db.query(Project)
            .filter(Project.owner_id == user.id, Project.is_active == True)
            .first()
        )
        if not project:
            raise HTTPException(status_code=404, detail="No active project found")
        project_id = str(project.id)
    else:
        raise HTTPException(status_code=403, detail="Use API key or user bearer auth for this endpoint")

    from ..services.rag.embedding_resolver import resolve_for_project
    from ..models import ChatbotSettings
    import uuid as _uuid

    emb_provider, emb_model, emb_api_key = resolve_for_project(db, project_id, source="chat")

    # Read defaults from ChatbotSettings
    chat_settings = db.query(ChatbotSettings).filter(
        ChatbotSettings.project_id == _uuid.UUID(project_id)
    ).first()

    top_k = req.top_k if req.top_k != 5 else (getattr(chat_settings, "chat_top_k", None) or req.top_k)
    use_reranker = req.use_reranker if req.use_reranker else (getattr(chat_settings, "chat_use_reranker", False) or False)
    if req.min_score is not None:
        similarity_threshold = req.min_score / 100.0
    else:
        raw = getattr(chat_settings, "chat_similarity_threshold", None)
        similarity_threshold = float(raw) if raw is not None else None

    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            functools.partial(
                pipeline.retrieve_only,
                query=req.query,
                project_id=project_id,
                top_k=top_k,
                similarity_threshold=similarity_threshold,
                use_reranker=use_reranker,
                embedding_provider=emb_provider,
                embedding_model=emb_model,
                embedding_api_key=emb_api_key,
            ),
        )
    except Exception as e:
        logger.error(f"Retrieval error for project {project_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Retrieval failed: {str(e)}")

    return RetrieveResponse(
        results=result["results"],
        retrieval_meta=result["retrieval_meta"],
        request_id=str(uuid.uuid4()),
    )
