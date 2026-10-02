import uuid
import asyncio
import functools
import logging
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..auth import get_project_id_or_user, get_accessible_project_ids
from ..limiter import limiter
from ..models import Project, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["retrieve"])

MCP_RETRIEVE_PROJECT_CAP = 50

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


def _retrieve_for_project(
    pipeline,
    db: Session,
    *,
    query: str,
    project_id: str,
    top_k: int,
    min_score: Optional[int],
    use_reranker: bool,
) -> Dict[str, Any]:
    from ..services.rag.embedding_resolver import resolve_for_project
    from ..models import ChatbotSettings
    import uuid as _uuid

    emb_provider, emb_model, emb_api_key = resolve_for_project(db, project_id, source="chat")
    chat_settings = db.query(ChatbotSettings).filter(
        ChatbotSettings.project_id == _uuid.UUID(project_id)
    ).first()

    resolved_top_k = top_k if top_k != 5 else (getattr(chat_settings, "chat_top_k", None) or top_k)
    resolved_reranker = use_reranker if use_reranker else (getattr(chat_settings, "chat_use_reranker", False) or False)
    if min_score is not None:
        similarity_threshold = min_score / 100.0
    else:
        raw = getattr(chat_settings, "chat_similarity_threshold", None)
        similarity_threshold = float(raw) if raw is not None else None

    return pipeline.retrieve_only(
        query=query,
        project_id=project_id,
        top_k=resolved_top_k,
        similarity_threshold=similarity_threshold,
        use_reranker=resolved_reranker,
        embedding_provider=emb_provider,
        embedding_model=emb_model,
        embedding_api_key=emb_api_key,
    )


def _merge_retrieve_results(
    per_project: List[tuple[str, Dict[str, Any]]],
    top_k: int,
) -> Dict[str, Any]:
    merged: List[Dict[str, Any]] = []
    for project_id, payload in per_project:
        for item in payload.get("results") or []:
            meta = dict(item.get("metadata") or {})
            meta.setdefault("project_id", project_id)
            merged.append(
                {
                    "text": item.get("text") or "",
                    "score": int(item.get("score") or 0),
                    "rank": 0,
                    "metadata": meta,
                }
            )
    merged.sort(key=lambda row: row["score"], reverse=True)
    trimmed = merged[:top_k]
    for idx, row in enumerate(trimmed):
        row["rank"] = idx + 1
    return {
        "results": trimmed,
        "retrieval_meta": {
            "scope": "accessible_projects",
            "project_count": len(per_project),
            "project_ids": [pid for pid, _ in per_project],
        },
    }


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

    - project API / mobile keys: single project bound to the key
    - mcp_user keys: fan-out across all projects the key owner can access
    """
    if not _RAG_AVAILABLE:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")

    pipeline = _get_pipeline()
    if pipeline is None:
        raise HTTPException(status_code=503, detail="RAG pipeline not initialized")

    auth_type = auth.get("type")
    loop = asyncio.get_running_loop()

    try:
        if auth_type == "api_key":
            api_key = auth["api_key"]
            if not getattr(api_key, "project_id", None):
                raise HTTPException(status_code=400, detail="API key not bound to a project")
            project = db.query(Project).filter(Project.id == api_key.project_id).first()
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            project_id = str(project.id)
            result = await loop.run_in_executor(
                None,
                functools.partial(
                    _retrieve_for_project,
                    pipeline,
                    db,
                    query=req.query,
                    project_id=project_id,
                    top_k=req.top_k,
                    min_score=req.min_score,
                    use_reranker=req.use_reranker,
                ),
            )
        elif auth_type == "mcp_user":
            user_id = auth.get("user_id")
            user = db.query(User).filter(User.id == user_id).first() if user_id else None
            if not user:
                raise HTTPException(status_code=401, detail="Invalid MCP key owner")
            accessible = list(get_accessible_project_ids(db, user) or [])[:MCP_RETRIEVE_PROJECT_CAP]
            if not accessible:
                result = {
                    "results": [],
                    "retrieval_meta": {"scope": "accessible_projects", "project_count": 0, "project_ids": []},
                }
            else:
                per_project: List[tuple[str, Dict[str, Any]]] = []
                for pid in accessible:
                    pid_str = str(pid)
                    try:
                        payload = await loop.run_in_executor(
                            None,
                            functools.partial(
                                _retrieve_for_project,
                                pipeline,
                                db,
                                query=req.query,
                                project_id=pid_str,
                                top_k=req.top_k,
                                min_score=req.min_score,
                                use_reranker=req.use_reranker,
                            ),
                        )
                        per_project.append((pid_str, payload))
                    except Exception as e:
                        logger.warning("MCP retrieve skipped project %s: %s", pid_str, e)
                result = _merge_retrieve_results(per_project, req.top_k)
        elif auth_type == "user":
            user = auth["user"]
            project = (
                db.query(Project)
                .filter(Project.owner_id == user.id, Project.is_active == True)  # noqa: E712
                .first()
            )
            if not project:
                raise HTTPException(status_code=404, detail="No active project found")
            project_id = str(project.id)
            result = await loop.run_in_executor(
                None,
                functools.partial(
                    _retrieve_for_project,
                    pipeline,
                    db,
                    query=req.query,
                    project_id=project_id,
                    top_k=req.top_k,
                    min_score=req.min_score,
                    use_reranker=req.use_reranker,
                ),
            )
        else:
            raise HTTPException(status_code=403, detail="Use API key, MCP key, or user bearer auth for this endpoint")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Retrieval error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Retrieval failed: {str(e)}")

    return RetrieveResponse(
        results=result["results"],
        retrieval_meta=result["retrieval_meta"],
        request_id=str(uuid.uuid4()),
    )
