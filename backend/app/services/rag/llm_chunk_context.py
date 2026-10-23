"""LLM-written chunk context for long documents (background, cached, in-place re-embed).

After a PDF / DOCX / PPTX with at least ``RAG_LLM_CONTEXT_MIN_CHUNKS`` chunks is indexed,
a ``CHUNK_LLM_CONTEXT`` job asks the project's chat model for one or two sentences that
situate each chunk within its document. The sentences are cached by a hash of the
document head and the chunk, stored on the chunk as ``ctx_llm``, and the chunk is
re-embedded as ``header + ctx_llm + chunk`` (``chunk_ctx_v = 2``). Stored text, ids and
the lexical index are untouched. Anything missing (no chat model, no key, LLM errors)
leaves the chunk at version 1.
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

from . import chunk_context

logger = logging.getLogger(__name__)

DOCUMENT_EXTS = frozenset({".pdf", ".docx", ".pptx"})
PROMPT_VERSION = 1
DOC_HEAD_CHARS = 3000
MAX_CONTEXT_CHARS = 300
_JOB_PRIORITY = -10


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)).strip())
    except (TypeError, ValueError):
        return default


def enabled() -> bool:
    return os.getenv("RAG_LLM_CONTEXT_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}


def min_chunks() -> int:
    return max(1, _env_int("RAG_LLM_CONTEXT_MIN_CHUNKS", 8))


def max_chunks() -> int:
    return max(1, _env_int("RAG_LLM_CONTEXT_MAX_CHUNKS", 400))


def concurrency() -> int:
    return max(1, _env_int("RAG_LLM_CONTEXT_CONCURRENCY", 4))


def timeout_seconds() -> int:
    return max(5, _env_int("RAG_LLM_CONTEXT_TIMEOUT_SECONDS", 30))


def document_ext(name: Optional[str]) -> str:
    raw = str(name or "")
    path = urlparse(raw).path if raw.startswith(("http://", "https://")) else raw
    return os.path.splitext(path.lower())[1]


def is_long_document(name: Optional[str], chunk_count: int) -> bool:
    return document_ext(name) in DOCUMENT_EXTS and int(chunk_count or 0) >= min_chunks()


def maybe_enqueue(
    *,
    project_id: Optional[str],
    user_id: Optional[int],
    document_id: str,
    collection: str,
    name: Optional[str],
    chunk_count: int,
    enhance_index: Optional[bool] = None,
) -> bool:
    """Queue the context job for a freshly indexed long document; never raises.

    ``enhance_index`` None keeps today's env gate. False never enqueues. True still
    requires a long pdf/docx/pptx (existing llm_chunk_context filters).
    """
    if enhance_index is False:
        return False
    env_ok = True if enhance_index is True else enabled()
    if not (env_ok and project_id and collection and document_id):
        return False
    if not is_long_document(name, chunk_count):
        return False
    try:
        from ...models import BackgroundJobType
        from ...settings import settings
        from ..job_queue import enqueue_job
        from ...db import SessionLocal

        if not settings.enable_durable_jobs:
            return False
        db = SessionLocal()
        try:
            enqueue_job(
                db,
                job_type=BackgroundJobType.CHUNK_LLM_CONTEXT.value,
                payload={"project_id": str(project_id), "document_id": str(document_id), "collection": collection},
                user_id=user_id,
                project_id=uuid.UUID(str(project_id)),
                idempotency_key=f"chunk_llm_context:{collection}:{document_id}",
                priority=_JOB_PRIORITY,
            )
        finally:
            db.close()
        return True
    except Exception as exc:
        logger.warning("Could not queue chunk LLM context for %s: %s", document_id, exc)
        return False


def cache_key(doc_head: str, chunk: str) -> str:
    raw = f"{PROMPT_VERSION}\n{hashlib.sha256(doc_head.encode()).hexdigest()}\n{chunk}"
    return hashlib.sha256(raw.encode()).hexdigest()


def build_prompt(title: str, doc_head: str, chunk: str) -> str:
    return (
        f"<document title=\"{title}\">\n{doc_head}\n</document>\n"
        f"Here is a passage from this document:\n<passage>\n{chunk}\n</passage>\n"
        "Write one or two short sentences that situate this passage within the document: "
        "which product, topic or section it belongs to. Use the document's language. "
        "Reply with the sentences only."
    )


def clean_context(text: Any) -> str:
    value = " ".join(str(text or "").split()).strip().strip('"')
    return value[:MAX_CONTEXT_CHARS].rstrip()


def document_head(chunks: Sequence[str]) -> str:
    parts: List[str] = []
    used = 0
    for chunk in chunks:
        if used >= DOC_HEAD_CHARS:
            break
        piece = (chunk or "")[: DOC_HEAD_CHARS - used]
        parts.append(piece)
        used += len(piece)
    return "\n".join(parts)


def generate_contexts(
    complete: Any, title: str, doc_head: str, chunks: Dict[str, str]
) -> Dict[str, str]:
    """``{key: chunk}`` -> ``{key: context}`` with bounded concurrency and a per-call timeout."""
    if not chunks:
        return {}
    results: Dict[str, str] = {}
    pool = ThreadPoolExecutor(max_workers=concurrency(), thread_name_prefix="chunk-llm-ctx")
    try:
        futures = {key: pool.submit(complete, build_prompt(title, doc_head, chunk)) for key, chunk in chunks.items()}
        for key, future in futures.items():
            try:
                context = clean_context(future.result(timeout=timeout_seconds()))
            except FutureTimeout:
                logger.info("Chunk LLM context timed out")
                continue
            except Exception as exc:
                logger.info("Chunk LLM context failed: %s", exc)
                continue
            if context:
                results[key] = context
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    return results


def contextualize_chunks(
    ids: Sequence[str],
    docs: Sequence[str],
    metas: Sequence[Dict[str, Any]],
    *,
    complete: Any,
    cache_get: Any,
    cache_put: Any,
) -> List[Tuple[str, str, Dict[str, Any]]]:
    """Return ``(id, chunk, new_meta)`` for chunks that gained an LLM context."""
    order = sorted(range(len(ids)), key=lambda i: int((metas[i] or {}).get("chunk_index") or 0))
    ordered = [(ids[i], docs[i] or "", dict(metas[i] or {})) for i in order]
    doc_head = document_head([doc for _, doc, _ in ordered])
    title = chunk_context.clean_title(ordered[0][2]) if ordered else ""
    pending = [row for row in ordered if not row[2].get("ctx_llm")][: max_chunks()]
    keys = {row[0]: cache_key(doc_head, row[1]) for row in pending}
    cached = cache_get(list(set(keys.values())))
    missing = {keys[cid]: doc for cid, doc, _ in pending if keys[cid] not in cached}
    fresh = generate_contexts(complete, title, doc_head, missing)
    if fresh:
        cache_put(fresh)
    contexts = {**cached, **fresh}
    updated: List[Tuple[str, str, Dict[str, Any]]] = []
    for cid, doc, meta in pending:
        context = contexts.get(keys[cid])
        if not context:
            continue
        meta["ctx_llm"] = context
        meta.setdefault("ctx_header", chunk_context.build_header(meta))
        meta["chunk_ctx_v"] = chunk_context.CHUNK_CONTEXT_VERSION_LLM
        updated.append((cid, doc, meta))
    return updated
