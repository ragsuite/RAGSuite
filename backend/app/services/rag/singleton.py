import threading
import logging
import time
from typing import Any, Dict, List, Optional

from . import cross_encoder
from .embedder_factory import (
    collection_name_for,
    get_embedding_meta,
    get_raw_embedder,
)
from .vector_write_lock import vector_write_lock

logger = logging.getLogger(__name__)

_pipeline = None
_lock = threading.Lock()
_shutdown_event = threading.Event()

INGEST_TIMEOUT_WARN_SECONDS = 30


def request_shutdown() -> None:
    """Signal that the process is shutting down — new ingests will drain, not start."""
    _shutdown_event.set()


CROSS_ENCODER_MODEL = cross_encoder.MODEL_ID


def get_pipeline():
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    with _lock:
        if _pipeline is None:
            try:
                from .rag import RAGPipeline
                _pipeline = RAGPipeline()
                logger.info("✅ RAGPipeline singleton initialized")
            except Exception as e:
                logger.error(f"❌ RAGPipeline init failed: {e}")
                return None
    return _pipeline


def get_cross_encoder():
    """Lazy cross-encoder reranker; None when unavailable (callers skip reranking).

    Loaded on first use, so projects that never enable the reranker pay nothing.
    """
    return cross_encoder.get()


def locked_ingest(path, **kwargs):
    """Ingest one file into its per-(project, model) vector collection.

    ``kwargs`` may include ``document_id``, ``user_id``, ``project_id``, and
    ``embedding_provider`` / ``embedding_model`` / ``embedding_api_key`` to
    route the ingest into a per-(project, model) collection.

    Prepare (extract + embed) runs **outside** the write lock. The document's old
    vectors are replaced by the new ones in one transaction, and only after prepare
    succeeds — so a failed extract/embed never wipes an Indexed document and readers
    never see a gap.
    """
    p = get_pipeline()
    if p is None:
        logger.error("❌ locked_ingest: pipeline not available")
        return {"status": "Error", "chunks": 0}

    embedding_provider = kwargs.get("embedding_provider")
    embedding_model = kwargs.get("embedding_model")
    embedding_api_key = kwargs.get("embedding_api_key")
    embedding_endpoint = kwargs.get("embedding_endpoint")
    embedding_api_version = kwargs.get("embedding_api_version")
    project_id = kwargs.get("project_id")
    on_progress = kwargs.get("on_progress")

    logger.info(f"⏳ ingest starting: {path} (provider={embedding_provider}, model={embedding_model})")
    ingest_start = time.time()
    prepare_start = time.time()
    prepared = p.prepare_ingest(
        path,
        document_id=kwargs.get("document_id"),
        embedding_provider=embedding_provider,
        embedding_model=embedding_model,
        embedding_api_key=embedding_api_key,
        embedding_endpoint=embedding_endpoint,
        embedding_api_version=embedding_api_version,
        on_progress=on_progress,
    )
    prepare_elapsed = time.time() - prepare_start

    if prepared is None:
        logger.info(f"ℹ️ ingest skipped (no text) in {prepare_elapsed:.1f}s: {path}")
        # Preserve any existing vectors — callers must not have deleted them already.
        return {
            "status": "No text extracted",
            "chunks": 0,
            "vectors_preserved": True,
        }

    display_title = (kwargs.get("title") or "").strip()
    if display_title:
        for meta in prepared.get("chunk_metadata") or []:
            if isinstance(meta, dict):
                meta["title"] = display_title[:500]

    display_language = (kwargs.get("language") or "").strip().lower()[:16]
    if display_language:
        for meta in prepared.get("chunk_metadata") or []:
            if isinstance(meta, dict):
                meta["language"] = display_language

    target_collection = collection_name_for(project_id, embedding_provider, embedding_model)
    metric = get_embedding_meta(embedding_provider, embedding_model).metric
    document_id = str(prepared["document_id"])

    if on_progress is not None:
        try:
            on_progress("saving", prepared["chunks"], prepared["chunks"])
        except Exception as exc:
            logger.debug("Ingest progress callback failed: %s", exc)

    write_start = time.time()
    with vector_write_lock(target_collection):
        try:
            p.replace_prepared_ingest(
                texts=prepared["texts"],
                embeddings=prepared["embeddings"],
                filepath=path,
                document_id=document_id,
                chunk_metadata=prepared["chunk_metadata"],
                user_id=kwargs.get("user_id"),
                project_id=project_id,
                collection_name=target_collection,
                collection_metric=metric,
            )
        except Exception as e:
            write_elapsed = time.time() - write_start
            logger.error(f"❌ ingest write raised after {write_elapsed:.1f}s: {e}")
            raise
        write_elapsed = time.time() - write_start

    elapsed = time.time() - ingest_start

    if elapsed > INGEST_TIMEOUT_WARN_SECONDS:
        logger.warning(f"⚠️ ingest took {elapsed:.1f}s (>{INGEST_TIMEOUT_WARN_SECONDS}s) — check vector store performance: {path}")
    else:
        logger.info(
            f"✅ ingest completed in {elapsed:.1f}s (prepare={prepare_elapsed:.1f}s, write={write_elapsed:.1f}s) "
            f"-> {target_collection}: {path}"
        )

    if project_id:
        from ..knowledge_base_status import mark_kb_ready
        from ..reindex_service import invalidate_item_embedding_coverage_cache

        # Warm readiness True — do NOT invalidate (invalidating during crawl forced
        # every chat/search to re-probe the vector store under write contention).
        mark_kb_ready(str(project_id))
        invalidate_item_embedding_coverage_cache(str(project_id))

    from .llm_chunk_context import maybe_enqueue

    maybe_enqueue(
        project_id=project_id,
        user_id=kwargs.get("user_id"),
        document_id=document_id,
        collection=target_collection,
        name=path,
        chunk_count=prepared["chunks"],
    )
    return {"status": "Indexed", "chunks": prepared["chunks"], "collection": target_collection}


def locked_write_prepared_ingest(
    *,
    texts: List[str],
    chunk_metadata: Optional[List[Dict[str, Any]]] = None,
    source_file: str,
    document_id: str,
    user_id: Optional[int] = None,
    project_id: Optional[str] = None,
    embedding_provider: Optional[str] = None,
    embedding_model: Optional[str] = None,
    embedding_api_key: Optional[str] = None,
    embedding_endpoint: Optional[str] = None,
    embedding_api_version: Optional[str] = None,
):
    """
    Serialize prepared in-memory ingest writes.
    Useful for direct crawl->vector ingestion where no intermediary file is needed.
    """
    p = get_pipeline()
    if p is None:
        logger.error("❌ locked_write_prepared_ingest: pipeline not available")
        return {"status": "Error", "chunks": 0}

    if not texts:
        return {"status": "No text extracted", "chunks": 0}

    from . import chunk_context

    ingest_start = time.time()
    chunk_metadata = chunk_context.annotate(chunk_metadata, len(texts))
    embed_start = time.time()
    embedder = p._embedder_for(embedding_provider, embedding_model, embedding_api_key, embedding_endpoint, embedding_api_version)
    embeddings = embedder.embed(chunk_context.embedding_texts(texts, chunk_metadata))
    embed_elapsed = time.time() - embed_start

    target_collection = collection_name_for(project_id, embedding_provider, embedding_model)
    metric = get_embedding_meta(embedding_provider, embedding_model).metric

    write_start = time.time()
    with vector_write_lock(target_collection):
        p.write_prepared_ingest(
            texts=texts,
            embeddings=embeddings,
            filepath=source_file,
            document_id=document_id,
            chunk_metadata=chunk_metadata,
            user_id=user_id,
            project_id=project_id,
            collection_name=target_collection,
            collection_metric=metric,
        )
        write_elapsed = time.time() - write_start

    elapsed = time.time() - ingest_start
    if elapsed > INGEST_TIMEOUT_WARN_SECONDS:
        logger.warning(
            f"⚠️ direct ingest took {elapsed:.1f}s (>{INGEST_TIMEOUT_WARN_SECONDS}s): {source_file}"
        )
    else:
        logger.info(
            f"✅ direct ingest completed in {elapsed:.1f}s "
            f"(embed={embed_elapsed:.1f}s, write={write_elapsed:.1f}s) -> {target_collection}: {source_file}"
        )

    if project_id:
        from ..knowledge_base_status import mark_kb_ready
        from ..reindex_service import invalidate_item_embedding_coverage_cache

        mark_kb_ready(str(project_id))
        invalidate_item_embedding_coverage_cache(str(project_id))

    return {"status": "Indexed", "chunks": len(texts), "collection": target_collection}


def locked_delete_document_embeddings(
    document_id: str,
    collection_name: Optional[str] = None,
) -> bool:
    """Delete vectors by document_id under the vector write lock."""
    p = get_pipeline()
    if p is None:
        logger.error("locked_delete_document_embeddings: pipeline not available")
        return False
    with vector_write_lock(collection_name):
        return bool(p.delete_document_embeddings(document_id, collection_name=collection_name))


def locked_delete_by_source_file_pattern(
    pattern: str,
    collection_name: Optional[str] = None,
) -> bool:
    """Pattern delete (legacy CSV paths) under the vector write lock."""
    p = get_pipeline()
    if p is None:
        return False
    with vector_write_lock(collection_name):
        return bool(p.delete_by_source_file_pattern(pattern, collection_name=collection_name))


def locked_delete_by_source_file_exact(
    source_file_basename: str,
    collection_name: Optional[str] = None,
) -> bool:
    """Exact metadata source_file delete without scanning the collection."""
    p = get_pipeline()
    if p is None:
        return False
    with vector_write_lock(collection_name):
        return bool(
            p.delete_by_source_file_exact(source_file_basename, collection_name=collection_name)
        )


def locked_delete_crawl_source_embeddings(source_id: str) -> bool:
    """
    Remove all vectors for a crawl source (direct ingest + legacy export paths).
    """
    p = get_pipeline()
    if p is None:
        return False

    sid = str(source_id)
    any_ok = False
    with vector_write_lock():
        if p.delete_document_embeddings(sid):
            any_ok = True
        if p.delete_by_source_file_exact(f"crawl_source_{sid}"):
            any_ok = True
        prefix = f"crawl_export_{sid}_"
        if p.delete_by_source_file_pattern(f"{prefix}%"):
            any_ok = True
    if any_ok:
        try:
            p.clear_query_cache()
        except Exception as exc:
            logger.warning("clear_query_cache after crawl source delete failed: %s", exc)
    return any_ok


def locked_delete_project_embeddings(
    project_id: str, collection_name: Optional[str] = None
) -> bool:
    """Delete all vectors for a project under the vector write lock."""
    p = get_pipeline()
    if p is None:
        return False
    with vector_write_lock(collection_name):
        ok = bool(p.delete_project_embeddings(str(project_id), collection_name=collection_name))
    if ok:
        try:
            p.clear_query_cache()
        except Exception as exc:
            logger.warning("clear_query_cache after project delete failed: %s", exc)
    return ok


def locked_purge_document(
    document_id: str,
    source_file_pattern: Optional[str] = None,
    collection_name: Optional[str] = None,
) -> bool:
    """Uploaded document purge: document_id first, optional filename pattern fallback."""
    ok = locked_delete_document_embeddings(document_id, collection_name=collection_name)
    if ok:
        return True
    if source_file_pattern:
        return locked_delete_by_source_file_pattern(
            source_file_pattern, collection_name=collection_name
        )
    return False
