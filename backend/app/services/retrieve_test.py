"""Admin retrieve-test: same Retriever.retrieve() as production, no LLM."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..models import Project, User
from .rag.embedding_resolver import read_project_chatbot_settings, read_project_search_settings, resolve_for_project
from .rag.retrieve_knobs import apply_chat_query_threshold
from .rag.singleton import get_pipeline

Surface = Literal["chat", "search"]
PREVIEW_CHARS = 280


def _preview(text: str) -> str:
    raw = (text or "").strip().replace("\n", " ")
    if len(raw) <= PREVIEW_CHARS:
        return raw
    return raw[: PREVIEW_CHARS - 1].rstrip() + "…"


def _meta_str(meta: Any, *keys: str) -> str:
    if not isinstance(meta, dict):
        return ""
    for key in keys:
        value = meta.get(key)
        if value:
            return str(value).strip()
    return ""


def run_retrieve_test(
    db: Session,
    *,
    user: User,
    project: Project,
    query: str,
    surface: Surface,
) -> Dict[str, Any]:
    q = (query or "").strip()
    if not q:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="query is required")
    if surface not in ("chat", "search"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="surface must be chat or search")

    pipeline = get_pipeline()
    if pipeline is None:
        raise HTTPException(status_code=503, detail="RAG pipeline not initialized")

    project_id = str(project.id)
    source = "search" if surface == "search" else "chat"
    emb_provider, emb_model, emb_api_key = resolve_for_project(db, project_id, source=source)

    if surface == "search":
        row = read_project_search_settings(db, project.id)
        top_k = int(getattr(row, "search_top_k", None) or 8)
        threshold = float(getattr(row, "search_similarity_threshold", None) or 0.45)
        use_reranker = bool(getattr(row, "search_use_reranker", False))
        rerank_candidates = getattr(row, "search_rerank_candidates", None)
        keyword_blend = getattr(row, "search_keyword_blend", None)
    else:
        row = read_project_chatbot_settings(db, project_id)
        top_k = int(getattr(row, "chat_top_k", None) or 5)
        threshold = apply_chat_query_threshold(
            getattr(row, "chat_similarity_threshold", None),
            getattr(row, "chat_threshold_preset", None),
        )
        use_reranker = bool(getattr(row, "chat_use_reranker", False))
        rerank_candidates = getattr(row, "chat_rerank_candidates", None)
        keyword_blend = getattr(row, "chat_keyword_blend", None)

    payload = pipeline.retrieve_only(
        query=q,
        project_id=project_id,
        top_k=top_k,
        similarity_threshold=threshold,
        use_reranker=use_reranker,
        rerank_candidates=rerank_candidates,
        keyword_blend=keyword_blend,
        embedding_provider=emb_provider,
        embedding_model=emb_model,
        embedding_api_key=emb_api_key,
    )
    hits: List[Dict[str, Any]] = []
    for item in (payload.get("results") or [])[:top_k]:
        meta = item.get("metadata") or {}
        chunk_id = _meta_str(meta, "id", "chunk_id") or str(item.get("rank") or "")
        hits.append(
            {
                "preview": _preview(str(item.get("text") or "")),
                "score": item.get("score") or 0,
                "title": _meta_str(meta, "title"),
                "url": _meta_str(meta, "url"),
                "chunk_id": chunk_id,
            }
        )
    return {
        "surface": surface,
        "query": q,
        "top_k": top_k,
        "hits": hits,
    }
