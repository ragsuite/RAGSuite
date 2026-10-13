"""Worker entry for ``CHUNK_LLM_CONTEXT``: resolve models, read chunks, re-embed in place."""
from __future__ import annotations

import logging
import uuid
from typing import Any, Callable, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from . import chunk_context, llm_chunk_context

logger = logging.getLogger(__name__)

_CACHE_QUERY_BATCH = 500
_UPDATE_BATCH = 100


def _embedding_for_collection(db: Session, project_id: str, collection: str) -> Optional[Tuple[str, str, Optional[str]]]:
    from .embedder_factory import collection_name_for
    from .embedding_resolver import resolve_reindex_for_project

    for source in ("search", "chat"):
        provider, model, api_key = resolve_reindex_for_project(db, project_id, source=source)
        if collection_name_for(project_id, provider, model) == collection:
            return provider, model, api_key
    return None


def _chat_completer(db: Session, project_id: str) -> Optional[Callable[[str], str]]:
    from ...utils.api_key import resolve_runtime_llm_api_key
    from ..llmconn import LLMFactory
    from .embedding_resolver import _project_owner_id, read_project_chatbot_settings

    row = read_project_chatbot_settings(db, project_id)
    model = (getattr(row, "chat_model", None) or "").strip() if row else ""
    if not model:
        return None
    raw_provider = (row.model_provider or "").lower()
    provider = "ollama" if ("custom" in raw_provider or "ollama" in raw_provider) else raw_provider
    api_key = resolve_runtime_llm_api_key(
        db,
        user_id=_project_owner_id(db, project_id),
        project_id=uuid.UUID(project_id),
        provider=provider,
        profile_type="chat",
        settings_api_key=row.api_key,
        settings_provider=row.model_provider,
    )
    if provider != "ollama" and not api_key:
        return None
    llm = LLMFactory.get_llm(
        provider, model, api_key, request_timeout=float(llm_chunk_context.timeout_seconds())
    )
    return lambda prompt: getattr(llm.complete(prompt), "text", "")


def _cache_get(db: Session, keys: List[str]) -> Dict[str, str]:
    from ...models import RagChunkLlmContext

    found: Dict[str, str] = {}
    for start in range(0, len(keys), _CACHE_QUERY_BATCH):
        batch = keys[start : start + _CACHE_QUERY_BATCH]
        rows = db.query(RagChunkLlmContext).filter(RagChunkLlmContext.cache_key.in_(batch)).all()
        found.update({row.cache_key: row.context for row in rows})
    return found


def _cache_put(db: Session, contexts: Dict[str, str]) -> None:
    from ...models import RagChunkLlmContext

    try:
        for key, context in contexts.items():
            db.merge(RagChunkLlmContext(cache_key=key, context=context))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Chunk LLM context cache write failed: %s", exc)


def _read_chunks(collection_obj: Any, collection: str, project_id: str, document_id: str):
    from .singleton import chroma_read_lock

    with chroma_read_lock(collection):
        res = collection_obj.get(
            where={"$and": [{"document_id": document_id}, {"project_id": project_id}]},
            include=["documents", "metadatas"],
        )
    return res.get("ids") or [], res.get("documents") or [], res.get("metadatas") or []


def _write_updates(collection_obj: Any, collection: str, rows: List[Tuple[str, str, Dict[str, Any]]], embeddings) -> None:
    from .singleton import chroma_write_lock

    for start in range(0, len(rows), _UPDATE_BATCH):
        batch = rows[start : start + _UPDATE_BATCH]
        with chroma_write_lock(collection):
            collection_obj.update(
                ids=[cid for cid, _, _ in batch],
                embeddings=embeddings[start : start + _UPDATE_BATCH],
                metadatas=[meta for _, _, meta in batch],
            )


def process_payload(payload: dict) -> int:
    """Run one job; returns the number of chunks updated (0 when skipped)."""
    from ...db import SessionLocal
    from .embedder_factory import get_embedding_meta
    from .singleton import get_pipeline

    project_id = str(payload.get("project_id") or "")
    document_id = str(payload.get("document_id") or "")
    collection = str(payload.get("collection") or "")
    if not (project_id and document_id and collection):
        raise ValueError("chunk_llm_context missing project_id, document_id or collection")

    pipeline = get_pipeline()
    if pipeline is None:
        raise RuntimeError("RAG pipeline not available")
    db = SessionLocal()
    try:
        embedding = _embedding_for_collection(db, project_id, collection)
        complete = _chat_completer(db, project_id)
        if embedding is None or complete is None:
            logger.info("Chunk LLM context skipped for %s: no embedding target or chat model", document_id)
            return 0
        provider, model, api_key = embedding
        collection_obj = pipeline.vdb.get_collection(collection, metric=get_embedding_meta(provider, model).metric)
        ids, docs, metas = _read_chunks(collection_obj, collection, project_id, document_id)
        if len(ids) < llm_chunk_context.min_chunks():
            return 0
        rows = llm_chunk_context.contextualize_chunks(
            ids,
            docs,
            metas,
            complete=complete,
            cache_get=lambda keys: _cache_get(db, keys),
            cache_put=lambda contexts: _cache_put(db, contexts),
        )
        if not rows:
            return 0
        embedder = pipeline._embedder_for(provider, model, api_key)
        embeddings = embedder.embed([chunk_context.embedding_text(doc, meta) for _, doc, meta in rows])
        _write_updates(collection_obj, collection, rows, embeddings)
        logger.info("Chunk LLM context: %d/%d chunks updated for document %s", len(rows), len(ids), document_id)
        return len(rows)
    finally:
        db.close()
