import threading
import logging
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional, Tuple

from ..observability import ChromaWriteLockTimer, record_chroma_lock_wait
from .embedder_factory import (
    collection_name_for,
    get_embedding_meta,
    get_raw_embedder,
)

logger = logging.getLogger(__name__)

_pipeline = None
_lock = threading.Lock()
_shutdown_event = threading.Event()

INGEST_TIMEOUT_WARN_SECONDS = 30


class _RWLock:
    """Readers-writer lock: many concurrent readers OR one exclusive writer.

    Classic semantics:
    - Readers share access and wait only while a writer holds the lock.
    - Writers are exclusive and wait for active readers to finish.

    Short write critical sections (batched ingest) keep reader wait times low.
    """

    def __init__(self) -> None:
        self._cond = threading.Condition(threading.Lock())
        self._readers = 0
        self._writer = False

    def acquire_read(self) -> None:
        with self._cond:
            while self._writer:
                self._cond.wait()
            self._readers += 1

    def release_read(self) -> None:
        with self._cond:
            self._readers -= 1
            if self._readers == 0:
                self._cond.notify_all()

    def acquire_write(self) -> None:
        with self._cond:
            while self._writer or self._readers > 0:
                self._cond.wait()
            self._writer = True

    def release_write(self) -> None:
        with self._cond:
            self._writer = False
            self._cond.notify_all()

    def acquire(self, blocking: bool = True, timeout: float = -1) -> bool:
        """Lock-compatible write acquire used by wait_for_ingest_drain."""
        if not blocking:
            with self._cond:
                if self._writer or self._readers > 0:
                    return False
                self._writer = True
                return True
        if timeout is None or timeout < 0:
            self.acquire_write()
            return True
        deadline = time.time() + timeout
        with self._cond:
            while self._writer or self._readers > 0:
                remaining = deadline - time.time()
                if remaining <= 0:
                    return False
                self._cond.wait(timeout=remaining)
            self._writer = True
            return True

    def release(self) -> None:
        self.release_write()


# Global RW lock for local/SQLite Chroma (must serialize across collections).
_ingest_lock = _RWLock()

# Per-collection RW locks: used when ENABLE_CHROMA_PER_COLLECTION_LOCK=true + CHROMA_MODE=http.
_collection_locks: Dict[str, _RWLock] = {}
_collection_locks_meta = threading.Lock()


def _get_collection_lock(collection_name: str) -> _RWLock:
    with _collection_locks_meta:
        if collection_name not in _collection_locks:
            _collection_locks[collection_name] = _RWLock()
        return _collection_locks[collection_name]


def _use_per_collection_lock() -> bool:
    try:
        from ...settings import settings
        from ..infra_env import chroma_http_enabled

        return (
            bool(getattr(settings, "enable_chroma_per_collection_lock", False))
            and chroma_http_enabled()
        )
    except Exception:
        return False


def _resolve_rw_lock(collection_name: Optional[str]) -> _RWLock:
    if collection_name and _use_per_collection_lock():
        return _get_collection_lock(collection_name)
    return _ingest_lock


def request_shutdown() -> None:
    """Signal that the process is shutting down — new ingests will drain, not start."""
    _shutdown_event.set()


def wait_for_ingest_drain(timeout: float = 30.0) -> bool:
    """Block until no ingest is active or timeout expires. Returns True if clean."""
    acquired = _ingest_lock.acquire(timeout=timeout)
    if acquired:
        _ingest_lock.release()
    return acquired


_cross_encoder = None
_cross_encoder_lock = threading.Lock()
CROSS_ENCODER_MODEL = "BAAI/bge-reranker-base"


@contextmanager
def chroma_write_lock(collection_name: Optional[str] = None) -> Iterator[None]:
    """Exclusive Chroma mutation lock (per-collection when HTTP mode allows).

    When ENABLE_CHROMA_PER_COLLECTION_LOCK=true and CHROMA_MODE=http, uses a
    per-collection RW lock so concurrent writes to different collections proceed in
    parallel. Falls back to the global lock for local SQLite or unknown collection.
    """
    timer = ChromaWriteLockTimer()
    wait_start = time.time()
    lock = _resolve_rw_lock(collection_name)

    lock.acquire_write()
    try:
        wait_time = time.time() - wait_start
        if wait_time > 0:
            record_chroma_lock_wait(wait_time)
        if wait_time > 1.0:
            logger.warning(
                "⚠️ chroma write lock waited %.1fs (collection=%s) — another write/read was running",
                wait_time, collection_name or "global",
            )
        timer.mark_acquired()
        yield
    finally:
        timer.mark_released()
        lock.release_write()


@contextmanager
def chroma_read_lock(collection_name: Optional[str] = None) -> Iterator[None]:
    """Shared Chroma read lock — concurrent with other readers, exclusive vs writers.

    Queries take this lock so they wait only for the current short write batch to
    finish (instead of racing SQLite / Chroma HTTP under active ingest).
    """
    wait_start = time.time()
    lock = _resolve_rw_lock(collection_name)
    lock.acquire_read()
    try:
        wait_time = time.time() - wait_start
        if wait_time > 1.0:
            logger.warning(
                "⚠️ chroma read lock waited %.1fs (collection=%s) — ingest write in progress",
                wait_time, collection_name or "global",
            )
            record_chroma_lock_wait(wait_time)
        yield
    finally:
        lock.release_read()


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
    """Lazy singleton for the cross-encoder reranker.

    Returns the loaded model on success, or None if the load failed.
    Callers must treat None as "rerank unavailable" and fall back to no-rerank.
    The model is only loaded the first time this is called, so users who never
    enable the use_reranker toggle pay zero cost.
    """
    global _cross_encoder
    if _cross_encoder is not None:
        return _cross_encoder
    with _cross_encoder_lock:
        if _cross_encoder is None:
            try:
                from sentence_transformers import CrossEncoder
                load_start = time.time()
                _cross_encoder = CrossEncoder(
                    CROSS_ENCODER_MODEL,
                    device="cpu",
                    max_length=512,
                )
                logger.info(
                    f"✅ CrossEncoder '{CROSS_ENCODER_MODEL}' loaded in {time.time()-load_start:.1f}s"
                )
            except Exception as e:
                logger.error(f"❌ CrossEncoder init failed: {e}")
                return None
    return _cross_encoder


def locked_ingest(path, **kwargs):
    """Serialize all ingest_file calls — ChromaDB SQLite is not concurrent-write-safe.

    ``kwargs`` may include ``document_id``, ``user_id``, ``project_id``, and
    ``embedding_provider`` / ``embedding_model`` / ``embedding_api_key`` to
    route the ingest into a per-(project, model) Chroma collection.

    Prepare (extract + embed) runs **outside** the write lock. Existing vectors for
    ``document_id`` are deleted only inside the same lock as the write, and only after
    prepare succeeds — so a failed extract/embed never wipes an Indexed document.
    """
    p = get_pipeline()
    if p is None:
        logger.error("❌ locked_ingest: pipeline not available")
        return {"status": "Error", "chunks": 0}

    embedding_provider = kwargs.get("embedding_provider")
    embedding_model = kwargs.get("embedding_model")
    embedding_api_key = kwargs.get("embedding_api_key")
    project_id = kwargs.get("project_id")

    logger.info(f"⏳ ingest starting: {path} (provider={embedding_provider}, model={embedding_model})")
    ingest_start = time.time()
    prepare_start = time.time()
    prepared = p.prepare_ingest(
        path,
        document_id=kwargs.get("document_id"),
        embedding_provider=embedding_provider,
        embedding_model=embedding_model,
        embedding_api_key=embedding_api_key,
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

    target_collection = collection_name_for(project_id, embedding_provider, embedding_model)
    metric = get_embedding_meta(embedding_provider, embedding_model).metric
    document_id = str(prepared["document_id"])

    write_start = time.time()
    with chroma_write_lock(target_collection):
        try:
            # Replace under one lock so concurrent reindex/ingest cannot observe a
            # deleted-but-not-yet-rewritten gap, and prepare failures never wipe.
            try:
                p.delete_document_embeddings(document_id, collection_name=target_collection)
            except Exception as del_exc:
                logger.warning(
                    "Pre-write cleanup failed for document %s in %s (continuing): %s",
                    document_id,
                    target_collection,
                    del_exc,
                )
            p.write_prepared_ingest(
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
        logger.warning(f"⚠️ ingest took {elapsed:.1f}s (>{INGEST_TIMEOUT_WARN_SECONDS}s) — check ChromaDB performance: {path}")
    else:
        logger.info(
            f"✅ ingest completed in {elapsed:.1f}s (prepare={prepare_elapsed:.1f}s, write={write_elapsed:.1f}s) "
            f"-> {target_collection}: {path}"
        )

    if project_id:
        from ..knowledge_base_status import mark_kb_ready
        from ..reindex_service import invalidate_item_embedding_coverage_cache

        # Warm readiness True — do NOT invalidate (invalidating during crawl forced
        # every chat/search to re-probe Chroma under write-lock contention).
        mark_kb_ready(str(project_id))
        invalidate_item_embedding_coverage_cache(str(project_id))

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

    ingest_start = time.time()
    embed_start = time.time()
    embedder = p._embedder_for(embedding_provider, embedding_model, embedding_api_key)
    embeddings = embedder.embed(texts)
    embed_elapsed = time.time() - embed_start

    target_collection = collection_name_for(project_id, embedding_provider, embedding_model)
    metric = get_embedding_meta(embedding_provider, embedding_model).metric

    write_start = time.time()
    with chroma_write_lock(target_collection):
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
    """Delete vectors by document_id under the Chroma write lock."""
    p = get_pipeline()
    if p is None:
        logger.error("locked_delete_document_embeddings: pipeline not available")
        return False
    with chroma_write_lock(collection_name):
        return bool(p.delete_document_embeddings(document_id, collection_name=collection_name))


def locked_delete_by_source_file_pattern(
    pattern: str,
    collection_name: Optional[str] = None,
) -> bool:
    """Pattern delete (legacy CSV paths) under the Chroma write lock."""
    p = get_pipeline()
    if p is None:
        return False
    with chroma_write_lock(collection_name):
        return bool(p.delete_by_source_file_pattern(pattern, collection_name=collection_name))


def locked_delete_by_source_file_exact(
    source_file_basename: str,
    collection_name: Optional[str] = None,
) -> bool:
    """Exact metadata source_file delete without scanning the collection."""
    p = get_pipeline()
    if p is None:
        return False
    with chroma_write_lock(collection_name):
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
    with chroma_write_lock():
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
    """Delete all vectors for a project under the Chroma write lock."""
    p = get_pipeline()
    if p is None:
        return False
    with chroma_write_lock(collection_name):
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
