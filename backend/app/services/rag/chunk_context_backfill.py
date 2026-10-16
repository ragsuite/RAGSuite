"""Upgrade existing chunks to the current chunk-context version in place.

Pages through a collection (no metadata filter), embeds ``header + stored chunk text``
for chunks below ``CHUNK_CONTEXT_VERSION`` and updates them by id. Stored text, ids and
the lexical index stay as they are, so retrieval keeps working during the run. Long
documents found on the way get the background LLM-context job. Spends embedding
credits, so it only runs when started explicitly.

Manual run (inside the backend container / venv):
    python -m app.services.rag.chunk_context_backfill <project_id> [chat|search]
"""
from __future__ import annotations

import logging
import sys
import time
from typing import Any, Dict, List, Optional

from . import chunk_context, llm_chunk_context

logger = logging.getLogger(__name__)

PAGE_SIZE = 200
_PAGE_PAUSE_SECONDS = 0.2
_PROGRESS_EVERY_PAGES = 10


def _outdated(meta: Any) -> bool:
    try:
        return int((meta or {}).get("chunk_ctx_v") or 0) < chunk_context.CHUNK_CONTEXT_VERSION
    except (TypeError, ValueError, AttributeError):
        return True


def _document_name(meta: Dict[str, Any]) -> str:
    return str(meta.get("url") or meta.get("source_file") or "")


def backfill_collection(
    collection_obj: Any,
    collection_name: str,
    embedder: Any,
    *,
    page_size: int = PAGE_SIZE,
    pause_seconds: float = _PAGE_PAUSE_SECONDS,
) -> Dict[str, Any]:
    """Re-embed outdated chunks; returns counts and per-document chunk totals."""
    from .vector_write_lock import vector_write_lock

    stats: Dict[str, Any] = {"scanned": 0, "updated": 0, "documents": {}}
    offset = 0
    while True:
        page = collection_obj.get(limit=page_size, offset=offset, include=["documents", "metadatas"])
        ids: List[str] = page.get("ids") or []
        if not ids:
            break
        docs = page.get("documents") or []
        metas = page.get("metadatas") or []
        offset += len(ids)
        stats["scanned"] += len(ids)
        for meta in metas:
            meta = meta or {}
            doc_id = str(meta.get("document_id") or "")
            if doc_id:
                entry = stats["documents"].setdefault(doc_id, {"chunks": 0, "name": _document_name(meta)})
                entry["chunks"] += 1
        todo = [i for i, meta in enumerate(metas) if _outdated(meta) and (docs[i] or "").strip()]
        if todo:
            new_metas = chunk_context.annotate([dict(metas[i] or {}) for i in todo], len(todo))
            texts = [docs[i] for i in todo]
            embeddings = embedder.embed(chunk_context.embedding_texts(texts, new_metas))
            update_ids = [ids[i] for i in todo]
            with vector_write_lock(collection_name):
                collection_obj.update(ids=update_ids, embeddings=embeddings, metadatas=new_metas)
            stats["updated"] += len(todo)
        if (offset // page_size) % _PROGRESS_EVERY_PAGES == 0:
            logger.info("chunk context backfill %s: scanned=%d updated=%d", collection_name, stats["scanned"], stats["updated"])
        if pause_seconds:
            time.sleep(pause_seconds)
    return stats


def backfill_project(project_id: str, source: str = "chat", *, enqueue_llm_context: bool = True) -> Dict[str, Any]:
    from ...db import SessionLocal
    from .chunk_context_coverage import invalidate
    from .embedder_factory import collection_name_for, get_embedding_meta
    from .embedding_resolver import resolve_reindex_for_project
    from .singleton import get_pipeline

    db = SessionLocal()
    try:
        provider, model, api_key = resolve_reindex_for_project(db, project_id, source=source)
    finally:
        db.close()
    pipeline = get_pipeline()
    collection_name = collection_name_for(project_id, provider, model)
    collection_obj = pipeline.vdb.get_collection(collection_name, metric=get_embedding_meta(provider, model).metric)
    embedder = pipeline._embedder_for(provider, model, api_key)
    stats = backfill_collection(collection_obj, collection_name, embedder)
    invalidate(collection_name)

    queued = 0
    if enqueue_llm_context:
        owner = _project_owner(project_id)
        for doc_id, entry in stats["documents"].items():
            queued += int(
                llm_chunk_context.maybe_enqueue(
                    project_id=project_id,
                    user_id=owner,
                    document_id=doc_id,
                    collection=collection_name,
                    name=entry["name"],
                    chunk_count=entry["chunks"],
                )
            )
    summary = {
        "collection": collection_name,
        "scanned": stats["scanned"],
        "updated": stats["updated"],
        "documents": len(stats["documents"]),
        "llm_context_jobs": queued,
    }
    logger.info("chunk context backfill: %s", summary)
    return summary


def _project_owner(project_id: str) -> Optional[int]:
    from ...db import SessionLocal
    from .embedding_resolver import _project_owner_id

    db = SessionLocal()
    try:
        return _project_owner_id(db, project_id)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(backfill_project(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "chat"))
