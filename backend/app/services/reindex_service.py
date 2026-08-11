"""
Embedding reindex: shared logic for inline (thread) and durable (background job) paths.
"""
from __future__ import annotations

import logging
import os
import re
import threading
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Optional, Set, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from ..db import SessionLocal
from ..models import (
    BackgroundJob,
    BackgroundJobStatus,
    BackgroundJobType,
    CrawlSource,
    Document,
    ReindexJob,
    UploadedDocument,
)
from ..settings import settings
from .rag.embedder_factory import (
    EMBEDDING_REGISTRY,
    JINA_FALLBACK_MODEL,
    JINA_FALLBACK_PROVIDER,
    _normalize_provider,
    collection_name_for,
    resolve_embedding,
)
from .rag.embedding_resolver import (
    _read_chatbot_settings,
    _read_search_settings,
    resolve_for_project,
    resolve_reindex_for_project,
)
from .rag.singleton import (
    get_pipeline,
    locked_delete_document_embeddings,
    locked_ingest,
    locked_write_prepared_ingest,
)

logger = logging.getLogger(__name__)

_REINDEX_SUPPORTED_EXTS = frozenset(
    {".pdf", ".docx", ".doc", ".pptx", ".txt", ".md", ".html", ".htm", ".csv"}
)


def read_reindex_job(db: Session, project_uuid: uuid.UUID, source: str) -> Optional[ReindexJob]:
    return (
        db.query(ReindexJob)
        .filter(ReindexJob.project_id == project_uuid, ReindexJob.source == source)
        .first()
    )


def start_reindex_job(
    db: Session,
    project_uuid: uuid.UUID,
    user_id: int,
    source: str,
    total: int,
    collection_name: str,
) -> ReindexJob:
    row = read_reindex_job(db, project_uuid, source)
    if row:
        row.status = "running"
        row.total = total
        row.embedded = 0
        row.skipped = 0
        row.failed = 0
        row.error = None
        row.collection_name = collection_name
        row.finished_at = None
        row.user_id = user_id
    else:
        row = ReindexJob(
            project_id=project_uuid,
            user_id=user_id,
            source=source,
            status="running",
            total=total,
            collection_name=collection_name,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def add_reindex_progress(
    db: Session,
    project_uuid: uuid.UUID,
    source: str,
    *,
    embedded_delta: int = 0,
    skipped_delta: int = 0,
    failed_delta: int = 0,
    error: Optional[str] = None,
) -> None:
    row = (
        db.query(ReindexJob)
        .filter(ReindexJob.project_id == project_uuid, ReindexJob.source == source)
        .with_for_update()
        .first()
    )
    if not row:
        return
    row.embedded = int(row.embedded or 0) + embedded_delta
    row.skipped = int(row.skipped or 0) + skipped_delta
    row.failed = int(row.failed or 0) + failed_delta
    if error:
        row.error = error
    db.commit()


def finalize_reindex_job(
    db: Session,
    project_uuid: uuid.UUID,
    source: str,
    *,
    status: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    row = read_reindex_job(db, project_uuid, source)
    if not row or row.status not in ("running", "started"):
        return
    failed = int(row.failed or 0)
    if status is None:
        status = "completed_with_errors" if failed > 0 or row.error else "done"
    row.status = status
    if error is not None:
        row.error = error[:2000] if error else None
    row.finished_at = datetime.now(timezone.utc)
    db.commit()
    invalidate_item_embedding_coverage_cache(str(project_uuid))
    from .knowledge_base_status import invalidate_kb_cache

    invalidate_kb_cache(str(project_uuid))


def count_crawled_docs(db: Session, project_uuid: uuid.UUID) -> int:
    sources = db.query(CrawlSource).filter(CrawlSource.project_id == project_uuid).all()
    if not sources:
        return 0
    ids = [s.id for s in sources]
    return db.query(Document).filter(Document.source_id.in_(ids)).count()


def count_reindex_items(
    db: Session,
    project_uuid: uuid.UUID,
    *,
    include_crawled: bool = True,
    document_ids: Optional[List[uuid.UUID]] = None,
) -> int:
    """
    Items that reindex progress tracks: uploaded files with extractable bytes,
    plus crawl sources that have at least one non-empty page (when include_crawled).
    Matches embedding coverage semantics (not per-page counts).
    """
    if document_ids:
        unique_ids = list(dict.fromkeys(document_ids))
        count = 0
        for doc in (
            db.query(UploadedDocument)
            .filter(
                UploadedDocument.project_id == project_uuid,
                UploadedDocument.id.in_(unique_ids),
            )
            .all()
        ):
            if _document_has_reindexable_bytes(doc, db):
                count += 1
        return count

    _, uploaded_ids, crawl_source_ids, _ = expected_coverage_item_ids(db, project_uuid)
    if include_crawled:
        return len(uploaded_ids | crawl_source_ids)
    return len(uploaded_ids)


@dataclass(frozen=True)
class EmbeddingCoverageReport:
    """Per-item coverage of the active embedding collection."""

    total_documents: int
    coverage_items_total: int
    coverage_items_embedded: int
    coverage_items_missing: int
    missing_uploaded_count: int
    missing_crawl_sources_count: int
    needs_reindex: bool


_CRAWL_SOURCE_FILE_RE = re.compile(
    r"^crawl_source_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$",
    re.I,
)

# Chroma/SQLite fails when fetching tens of thousands of rows in one get().
_COVERAGE_METADATA_BATCH = 500
# Use targeted per-item lookups only for small candidate sets in very few collections.
# With many collections, per-item queries explode (items × collections × 2 HTTP calls).
_COVERAGE_CANDIDATE_LOOKUP_MAX = 200
_COVERAGE_PER_ITEM_MAX_COLLECTIONS = 2


def _coverage_item_ids_from_metadata(meta: Optional[Dict[str, Any]]) -> Set[str]:
    """
    Map a Chroma chunk metadata row to coverage item id(s).

    Uploaded documents use ``document_id`` = UploadedDocument.id.
    Crawl sources use ``document_id`` = CrawlSource.id at ingest time, but older
    or partial ingests may only have ``source_file`` = ``crawl_source_<uuid>``.
    Status must recognize both so the UI matches chat retrieval.
    """
    if not meta:
        return set()

    out: Set[str] = set()
    doc_id = meta.get("document_id")
    if doc_id is not None:
        doc_s = str(doc_id).strip()
        if doc_s and doc_s.lower() != "unknown":
            out.add(doc_s)

    source_file = str(meta.get("source_file") or "").strip()
    if source_file:
        basename = os.path.basename(source_file)
        m = _CRAWL_SOURCE_FILE_RE.match(basename)
        if m:
            out.add(str(m.group(1)))

    return out


def _use_per_item_coverage_lookup(
    candidate_ids: Optional[Set[str]],
    num_collections: int,
) -> bool:
    """Per-item get(limit=1) is cheaper only when there are few collections to probe."""
    return (
        candidate_ids is not None
        and len(candidate_ids) <= _COVERAGE_CANDIDATE_LOOKUP_MAX
        and num_collections <= _COVERAGE_PER_ITEM_MAX_COLLECTIONS
    )


def _scan_item_collection_index(
    project_id: str,
    *,
    candidate_ids: Optional[Set[str]] = None,
    collection_names: Optional[List[str]] = None,
) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """
    One paginated metadata scan per collection.

    Returns item_id -> {collection_name -> {provider, model, collection}}.
    """
    pipeline = get_pipeline()
    if pipeline is None:
        return {}

    names = collection_names
    if names is None:
        try:
            names = list(pipeline.vdb.list_known_collections())
        except Exception as exc:
            logger.warning(
                "_scan_item_collection_index: list collections failed for %s: %s",
                project_id,
                exc,
            )
            return []

    filter_candidates = candidate_ids is not None
    candidate_set = candidate_ids or set()
    out: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)

    for collection_name in names:
        provider, model = _collection_to_provider_model(collection_name, project_id)
        entry = {
            "provider": provider,
            "model": model,
            "collection": collection_name,
        }
        for meta in _project_metadatas_in_collection(project_id, collection_name):
            for item_id in _coverage_item_ids_from_metadata(meta):
                if filter_candidates and item_id not in candidate_set:
                    continue
                out[item_id][collection_name] = entry

    return {item_id: dict(by_collection) for item_id, by_collection in out.items()}


def _project_metadatas_in_collection(
    project_id: str,
    collection_name: str,
) -> List[Dict[str, Any]]:
    """Return chunk metadatas for a project in one collection (batched for large indexes)."""
    pipeline = get_pipeline()
    if pipeline is None:
        return []
    try:
        coll = pipeline.vdb.get_collection(collection_name)
        out: List[Dict[str, Any]] = []
        offset = 0
        while True:
            result = coll.get(
                where={"project_id": str(project_id)},
                include=["metadatas"],
                limit=_COVERAGE_METADATA_BATCH,
                offset=offset,
            )
            ids = result.get("ids") or []
            metas = result.get("metadatas") or []
            out.extend(m for m in metas if m)
            if len(ids) < _COVERAGE_METADATA_BATCH:
                break
            offset += len(ids)
        return out
    except Exception as exc:
        logger.warning(
            "_project_metadatas_in_collection failed project=%s collection=%s: %s",
            project_id,
            collection_name,
            exc,
        )
        return []


def _item_embedded_in_collection(
    project_id: str,
    collection_name: str,
    item_id: str,
) -> bool:
    """True if any chunk in the collection is linked to this coverage item id."""
    pipeline = get_pipeline()
    if pipeline is None:
        return False
    try:
        coll = pipeline.vdb.get_collection(collection_name)
        pid = str(project_id)
        item = str(item_id)
        # Per-project collections already isolate tenants — skip $and with project_id
        # (compound filters are much slower on large Chroma collections).
        if (collection_name or "").startswith("proj_"):
            queries = [
                {"document_id": item},
                {"source_file": f"crawl_source_{item}"},
            ]
        else:
            queries = [
                {"$and": [{"project_id": pid}, {"document_id": item}]},
                {"$and": [{"project_id": pid}, {"crawl_source_id": item}]},
                {
                    "$and": [
                        {"project_id": pid},
                        {"source_file": f"crawl_source_{item}"},
                    ]
                },
            ]
        for where in queries:
            try:
                result = coll.get(where=where, limit=1, include=[])
            except Exception:
                continue
            if result.get("ids"):
                return True
        return False
    except Exception as exc:
        logger.debug(
            "_item_embedded_in_collection failed project=%s collection=%s item=%s: %s",
            project_id,
            collection_name,
            item_id,
            exc,
        )
        return False


def document_ids_in_active_collection(
    project_id: str,
    collection_name: str,
    *,
    candidate_ids: Optional[Set[str]] = None,
) -> Set[str]:
    """Distinct coverage item ids present in Chroma for this project + collection."""
    if _use_per_item_coverage_lookup(candidate_ids, 1):
        out: Set[str] = set()
        for item_id in candidate_ids or set():
            if _item_embedded_in_collection(project_id, collection_name, item_id):
                out.add(item_id)
        return out

    out: Set[str] = set()
    candidate_set = candidate_ids or None
    for meta in _project_metadatas_in_collection(project_id, collection_name):
        for item_id in _coverage_item_ids_from_metadata(meta):
            if candidate_set is not None and item_id not in candidate_set:
                continue
            out.add(item_id)
    return out


def expected_coverage_item_ids(
    db: Session,
    project_uuid: uuid.UUID,
) -> Tuple[Set[str], Set[str], Set[str], int]:
    """
    Return (all_item_ids, uploaded_ids, crawl_source_ids, total_documents_display).

    Coverage items:
    - Each uploaded document with extractable bytes
    - Each crawl source that has at least one non-empty crawled page

    total_documents_display counts uploaded rows + crawled pages (UI parity).
    """
    # Push non-empty check to DB; select only ids (never load LargeBinary blobs).
    uploaded_ids: Set[str] = {
        str(row.id)
        for row in (
            db.query(UploadedDocument.id)
            .filter(
                UploadedDocument.project_id == project_uuid,
                UploadedDocument.text_content.isnot(None),
                sa_func.length(UploadedDocument.text_content) > 0,
            )
            .all()
        )
    }

    crawl_source_ids: Set[str] = set()
    page_count = 0
    sources = (
        db.query(CrawlSource)
        .filter(CrawlSource.project_id == project_uuid)
        .all()
    )
    for src in sources:
        page_count += (
            db.query(sa_func.count(Document.id))
            .filter(Document.source_id == src.id)
            .scalar()
            or 0
        )
        has_content = (
            db.query(Document.id)
            .filter(
                Document.source_id == src.id,
                Document.text_content.isnot(None),
                Document.text_content != "",
            )
            .limit(1)
            .first()
        )
        if has_content:
            crawl_source_ids.add(str(src.id))

    all_ids = uploaded_ids | crawl_source_ids
    total_display = len(uploaded_ids) + page_count
    return all_ids, uploaded_ids, crawl_source_ids, total_display


def chroma_index_readiness() -> Tuple[bool, Optional[str]]:
    """True when the RAG pipeline can query Chroma for coverage checks."""
    pipeline = get_pipeline()
    if pipeline is None:
        return False, "Vector index not loaded"
    try:
        pipeline.vdb.list_known_collections()
        return True, None
    except Exception as exc:
        logger.warning("chroma_index_readiness failed: %s", exc)
        return False, str(exc)


def _saved_collection_for_source(
    db: Session,
    project_uuid: uuid.UUID,
    source: Literal["search", "chat"],
) -> Optional[str]:
    """Collection for the model saved in settings (before runtime fallback)."""
    if source == "chat":
        row = _read_chatbot_settings(db, project_uuid)
    else:
        row = _read_search_settings(db, project_uuid)
    if not row:
        return None
    provider = _normalize_provider(getattr(row, "model_provider", None))
    model = (getattr(row, "embedding_model", None) or "").strip()
    if not provider or not model:
        return collection_name_for(
            str(project_uuid), JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL
        )
    return collection_name_for(str(project_uuid), provider, model)


def _embedded_coverage_ids(
    project_id: str,
    active_collection: str,
    extra_collections: List[str],
    *,
    candidate_ids: Optional[Set[str]] = None,
) -> Set[str]:
    """Item ids embedded in the active collection and any saved-model alias."""
    collections = [active_collection] + [
        c for c in extra_collections if c and c != active_collection
    ]
    if _use_per_item_coverage_lookup(candidate_ids, len(collections)):
        out: Set[str] = set()
        for item_id in candidate_ids or set():
            for coll in collections:
                if _item_embedded_in_collection(project_id, coll, item_id):
                    out.add(item_id)
                    break
        return out

    index = _scan_item_collection_index(
        project_id,
        candidate_ids=candidate_ids,
        collection_names=collections,
    )
    return set(index.keys())


def assess_embedding_coverage(
    db: Session,
    project_uuid: uuid.UUID,
    active_collection: str,
    *,
    source: Optional[Literal["search", "chat"]] = None,
) -> EmbeddingCoverageReport:
    """
    Model-agnostic check: does each document/crawl source have vectors in the
    active collection (and the saved settings collection when it differs)?
    """
    expected_ids, uploaded_ids, crawl_source_ids, total_display = (
        expected_coverage_item_ids(db, project_uuid)
    )
    extra_collections: List[str] = []
    if source:
        saved_coll = _saved_collection_for_source(db, project_uuid, source)
        if saved_coll and saved_coll != active_collection:
            extra_collections.append(saved_coll)

    embedded_ids = _embedded_coverage_ids(
        str(project_uuid),
        active_collection,
        extra_collections,
        candidate_ids=expected_ids,
    )

    missing_uploaded = uploaded_ids - embedded_ids
    missing_crawl = crawl_source_ids - embedded_ids
    missing_all = expected_ids - embedded_ids
    embedded_count = len(expected_ids & embedded_ids)

    coverage_total = len(expected_ids)
    missing_count = len(missing_all)
    needs_reindex = coverage_total > 0 and missing_count > 0

    return EmbeddingCoverageReport(
        total_documents=total_display,
        coverage_items_total=coverage_total,
        coverage_items_embedded=embedded_count,
        coverage_items_missing=missing_count,
        missing_uploaded_count=len(missing_uploaded),
        missing_crawl_sources_count=len(missing_crawl),
        needs_reindex=needs_reindex,
    )


_LEGACY_COLLECTION = "rag_collection"
_ITEM_COVERAGE_CACHE: Dict[Tuple[str, str, str], Tuple[float, Dict[str, Any]]] = {}
# Longer TTL: invalidate_item_embedding_coverage_cache runs on ingest/reindex.
# Avoid re-scanning Chroma on every crawl/document list refresh.
_ITEM_COVERAGE_CACHE_TTL_SEC = 45


def invalidate_item_embedding_coverage_cache(project_id: Optional[str] = None) -> None:
    """Drop cached per-item embedding coverage (all sources for a project, or entire cache)."""
    if project_id is None:
        _ITEM_COVERAGE_CACHE.clear()
        return
    pid = str(project_id)
    for key in list(_ITEM_COVERAGE_CACHE):
        if key[0] == pid:
            del _ITEM_COVERAGE_CACHE[key]


_HASHED_MODEL_SUFFIX = re.compile(r"^[a-f0-9]{10}$")


def _collection_to_provider_model(
    collection_name: str,
    project_id: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    if collection_name == _LEGACY_COLLECTION:
        return JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL
    m = re.match(r"^proj_[^_]+(?:_[^_]+)*?__([a-z0-9_]+)__(.+)$", collection_name)
    if not m:
        return None, None
    provider, model_part = m.group(1), m.group(2)
    if project_id and _HASHED_MODEL_SUFFIX.fullmatch(model_part):
        for p, mod in EMBEDDING_REGISTRY:
            if collection_name_for(project_id, p, mod) == collection_name:
                return p, mod
    return provider, model_part


def _probe_item_coverage_in_collections(
    project_id: str,
    collection_names: List[str],
    candidate_ids: Set[str],
) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """
    Targeted coverage probe: per-item get(limit=1) against named collections only.

    Never walks full collection metadata — critical for large crawls (thousands of pages /
    tens of thousands of chunks) on the request path.
    """
    out: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
    if not candidate_ids or not collection_names:
        return {}
    for collection_name in collection_names:
        provider, model = _collection_to_provider_model(collection_name, project_id)
        entry = {
            "provider": provider,
            "model": model,
            "collection": collection_name,
        }
        for item_id in candidate_ids:
            if _item_embedded_in_collection(project_id, collection_name, item_id):
                out[item_id][collection_name] = entry
    return {item_id: dict(by_collection) for item_id, by_collection in out.items()}


def embedded_models_by_item_id(
    project_id: str,
    *,
    candidate_ids: Optional[Set[str]] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Scan Chroma collections once and map coverage item id -> embedding model entries.
    Item ids are uploaded document UUIDs or crawl source UUIDs (see reindex paths).
    """
    pipeline = get_pipeline()
    if pipeline is None:
        return {}

    try:
        collection_names = list(pipeline.vdb.list_known_collections())
    except Exception as exc:
        logger.warning(
            "embedded_models_by_item_id: list collections failed for %s: %s",
            project_id,
            exc,
        )
        return {}

    if _use_per_item_coverage_lookup(candidate_ids, len(collection_names)):
        out: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(dict)
        for collection_name in collection_names:
            provider, model = _collection_to_provider_model(collection_name, project_id)
            entry = {
                "provider": provider,
                "model": model,
                "collection": collection_name,
            }
            for item_id in candidate_ids or set():
                if _item_embedded_in_collection(project_id, collection_name, item_id):
                    out[item_id][collection_name] = entry
        return {
            item_id: list(by_collection.values())
            for item_id, by_collection in out.items()
        }

    index = _scan_item_collection_index(
        project_id,
        candidate_ids=candidate_ids,
        collection_names=collection_names,
    )
    return {
        item_id: list(by_collection.values())
        for item_id, by_collection in index.items()
    }


def get_item_embedding_coverage(
    db: Session,
    project_uuid: uuid.UUID,
    source: Literal["search", "chat"] = "chat",
    *,
    skip_cache: bool = False,
) -> Dict[str, Any]:
    """
    Per uploaded-document and per crawl-source embedding coverage for the
    requested chat/search embedding model.

    This status check honors the requested source so the UI can report
    chat coverage versus search coverage accurately. Ingest follows
    ``EMBEDDING_PREFERRED_SOURCE`` (same row when set to ``chat``).
    Result is cached briefly to avoid repeated Chroma scans on document list refresh.

    Request path only probes the active (+ saved) collection(s) with per-item
    lookups — never a full metadata walk of every chunk.
    """
    effective_source: Literal["search", "chat"] = "chat" if source == "chat" else "search"
    provider, model, _ = resolve_for_project(
        db,
        project_uuid,
        source=effective_source,
        honor_requested_source=True,
    )
    active_collection = collection_name_for(project_uuid, provider, model)

    cache_key = (str(project_uuid), effective_source, active_collection)
    now = time.time()
    if not skip_cache:
        cached = _ITEM_COVERAGE_CACHE.get(cache_key)
        if cached and (now - cached[0]) < _ITEM_COVERAGE_CACHE_TTL_SEC:
            return cached[1]

    _, uploaded_ids, crawl_source_ids, _ = expected_coverage_item_ids(db, project_uuid)
    all_expected = uploaded_ids | crawl_source_ids

    saved_coll = _saved_collection_for_source(db, project_uuid, effective_source)
    extra_colls: List[str] = []
    if saved_coll and saved_coll != active_collection:
        extra_colls.append(saved_coll)

    project_id_str = str(project_uuid)
    active_collections = {active_collection, *extra_colls}
    probe_collections = list(dict.fromkeys([active_collection, *extra_colls]))

    # Prefer targeted per-item probes on active/saved collections only.
    # Fall back to a scoped metadata scan (still restricted to probe_collections)
    # only when the candidate set is huge and would explode into too many gets.
    if (
        all_expected
        and len(all_expected) <= _COVERAGE_CANDIDATE_LOOKUP_MAX
    ) or len(probe_collections) <= _COVERAGE_PER_ITEM_MAX_COLLECTIONS:
        coverage_index = _probe_item_coverage_in_collections(
            project_id_str,
            probe_collections,
            all_expected,
        )
    else:
        coverage_index = _scan_item_collection_index(
            project_id_str,
            candidate_ids=all_expected,
            collection_names=probe_collections,
        )

    embedded_in_active = {
        item_id
        for item_id, by_collection in coverage_index.items()
        if active_collections & set(by_collection.keys())
    }
    models_by_item = {
        item_id: list(by_collection.values())
        for item_id, by_collection in coverage_index.items()
    }

    def _entry(item_id: str) -> Dict[str, Any]:
        raw_models = models_by_item.get(item_id, [])
        embedded_models: List[Dict[str, Any]] = []
        seen_collections: Set[str] = set()
        for raw in raw_models:
            coll = raw.get("collection") or ""
            if coll in seen_collections:
                continue
            seen_collections.add(coll)
            embedded_models.append(
                {
                    "provider": raw.get("provider"),
                    "model": raw.get("model"),
                    "collection": coll,
                    "is_active": coll == active_collection,
                }
            )
        embedded_models.sort(key=lambda m: (not m["is_active"], m.get("collection") or ""))
        return {
            "id": item_id,
            "embedded_models": embedded_models,
            "missing_active": item_id not in embedded_in_active,
        }

    payload: Dict[str, Any] = {
        "project_id": str(project_uuid),
        "source": effective_source,
        "active_provider": provider,
        "active_model": model,
        "active_collection": active_collection,
        "documents": [_entry(uid) for uid in sorted(uploaded_ids)],
        "crawl_sources": [_entry(cid) for cid in sorted(crawl_source_ids)],
    }
    _ITEM_COVERAGE_CACHE[cache_key] = (now, payload)
    return payload


def _uploaded_document_bytes(doc: UploadedDocument, db: Optional[Session] = None) -> bytes:
    """Bytes for reindex/content. Optionally recover from connector staging when DB blob is empty."""
    raw = doc.text_content or b""
    if isinstance(raw, memoryview):
        raw = raw.tobytes()
    content = bytes(raw)
    if content:
        return content
    if db is None:
        return b""
    try:
        from ..models import ConnectorDocument

        link = (
            db.query(ConnectorDocument)
            .filter(ConnectorDocument.document_id == doc.id)
            .first()
        )
        staging = (link.staging_path if link else None) or None
        if staging and os.path.isfile(staging):
            with open(staging, "rb") as fh:
                recovered = fh.read()
            if recovered:
                doc.text_content = recovered
                try:
                    db.commit()
                except Exception:
                    db.rollback()
                return recovered
    except Exception as exc:
        logger.warning("Reindex: could not recover bytes for document %s: %s", doc.id, exc)
    return b""


def _document_has_reindexable_bytes(doc: UploadedDocument, db: Optional[Session] = None) -> bool:
    raw = _uploaded_document_bytes(doc, db)
    if not raw:
        return False
    # Avoid stripping binary PDFs/DOCX (ZIP) — only skip pure-whitespace text payloads.
    if raw[:5] == b"%PDF-" or raw[:2] == b"PK":
        return True
    return bool(raw.strip())


def reindex_temp_suffix_for_uploaded_doc(doc: UploadedDocument, raw: bytes) -> str:
    title = (doc.title or "").strip()
    ct = (doc.type or "").lower()
    ext = ""
    m = re.search(r"(\.[a-z0-9]{1,12})\s*$", title, re.I)
    if m:
        cand = m.group(1).lower()
        if cand in _REINDEX_SUPPORTED_EXTS:
            ext = cand
    if not ext and len(raw) >= 5 and raw[:5] == b"%PDF-":
        ext = ".pdf"
    if not ext and len(raw) >= 2 and raw[:2] == b"PK":
        # OOXML packages (docx/pptx/xlsx) are ZIP. Never treat as .txt.
        head = raw[:16384]
        if b"ppt/" in head or b"presentationml" in head or b"ppt\\slides" in head:
            ext = ".pptx"
        elif b"word/" in head or b"wordprocessingml" in head:
            ext = ".docx"
        elif b"xl/" in head or b"spreadsheetml" in head:
            # Spreadsheets are not supported by extract_text_from_file; fail clearly.
            raise ValueError(
                "Reindex refused: Excel OOXML (.xlsx) is not supported for text extraction"
            )
        elif title.lower().endswith(".pptx") or "presentation" in ct or ct.endswith("/pptx"):
            ext = ".pptx"
        elif title.lower().endswith(".docx") or "wordprocessing" in ct or ct.endswith("/docx"):
            ext = ".docx"
        else:
            raise ValueError(
                "Reindex refused: cannot determine Office type for ZIP payload "
                "(refusing .txt fallback that would embed binary garbage)"
            )
    if not ext:
        if "pdf" in ct:
            ext = ".pdf"
        elif "presentationml" in ct or ct.endswith("/pptx") or ct == "pptx":
            ext = ".pptx"
        elif "wordprocessingml" in ct or "officedocument.wordprocessingml.document" in ct:
            ext = ".docx"
        elif "msword" in ct:
            ext = ".doc"
        elif "html" in ct:
            ext = ".html"
        elif "csv" in ct or "comma-separated" in ct:
            ext = ".csv"
        elif "markdown" in ct or ct in ("text/markdown", "text/x-markdown"):
            ext = ".md"
        elif "text/plain" in ct or ct in ("txt", "text"):
            ext = ".txt"
    if not ext:
        ext = ".txt"
    return ext


def _probe_embedding_credentials(
    provider: str,
    model: str,
    api_key: Optional[str],
) -> Optional[str]:
    """Return an error string when the embedding endpoint rejects credentials."""
    try:
        from .rag.embedder_factory import get_raw_embedder

        embedder = get_raw_embedder(provider, model, api_key)
        embedder.get_text_embedding("ragsuite-reindex-preflight")
        return None
    except Exception as exc:
        return str(exc)


def reindex_uploaded_document(
    doc: UploadedDocument,
    provider: str,
    model: str,
    api_key: Optional[str],
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    raw = _uploaded_document_bytes(doc, db)
    if not raw:
        return {"chunks": 0, "status": "No text extracted"}
    # Keep binary intact; only strip pure text payloads.
    if not (raw[:5] == b"%PDF-" or raw[:2] == b"PK"):
        raw = raw.strip()
    if not raw:
        return {"chunks": 0, "status": "No text extracted"}

    try:
        suffix = reindex_temp_suffix_for_uploaded_doc(doc, raw)
    except ValueError as exc:
        logger.warning("Reindex refused for document %s: %s", getattr(doc, "id", None), exc)
        return {"chunks": 0, "status": "Indexing Failed", "error": str(exc)}

    # Never delete existing vectors until credentials are known-good — a bad Search
    # key on a shared collection previously wiped Indexed docs on Documents reindex.
    probe_error = _probe_embedding_credentials(provider, model, api_key)
    if probe_error:
        logger.warning(
            "Reindex preflight failed for document %s (%s/%s): %s",
            getattr(doc, "id", None),
            provider,
            model,
            probe_error,
        )
        return {
            "chunks": int(getattr(doc, "chunks", 0) or 0),
            "status": "Indexing Failed",
            "error": probe_error,
            "preflight_failed": True,
        }

    title = (doc.title or "doc").strip()
    if title.lower().endswith(suffix):
        stem = title[: -len(suffix)].strip() or "doc"
    else:
        stem = title
    safe_stem = re.sub(r"[^\w\-]", "_", stem)[:50] or "doc"

    from ..paths import data_tmp_dir

    # Unique name per run avoids concurrent reindex jobs clobbering the same path.
    run_token = uuid.uuid4().hex[:12]
    tmp_path = data_tmp_dir() / f"{doc.id}_reindex_{run_token}_{safe_stem}{suffix}"
    abs_path = str(tmp_path.resolve())

    try:
        tmp_path.write_bytes(raw)
        if not tmp_path.is_file():
            raise FileNotFoundError(f"Reindex temp file was not created: {abs_path}")

        # Do NOT delete existing vectors before prepare succeeds. locked_ingest
        # replaces under one Chroma write lock only after extract+embed works —
        # otherwise every failed reindex (or restart-triggered reindex) wiped
        # Indexed uploads and left Documents UI stuck on Failed.
        result = locked_ingest(
            abs_path,
            document_id=str(doc.id),
            user_id=doc.user_id,
            project_id=str(doc.project_id),
            embedding_provider=provider,
            embedding_model=model,
            embedding_api_key=api_key,
            title=title,
        )
        return result or {"chunks": 0, "status": "Error", "vectors_preserved": True}
    finally:
        try:
            if tmp_path.exists():
                os.remove(tmp_path)
        except Exception:
            pass


def _sync_uploaded_document_after_reindex(
    db: Session,
    doc: UploadedDocument,
    result: Dict[str, Any],
    *,
    exc: Optional[Exception] = None,
) -> None:
    """Keep Documents UI status in sync with reindex outcome (Queued/Failed → Indexed)."""
    from datetime import datetime, timezone

    from .embed_rate_limit import EmbeddingRateLimitError, is_embed_rate_limit_error

    prior_status = str(getattr(doc, "status", "") or "")
    prior_chunks = int(getattr(doc, "chunks", 0) or 0)
    was_indexed = prior_status == "Indexed" and prior_chunks > 0

    if exc is not None:
        if is_embed_rate_limit_error(exc) or isinstance(exc, EmbeddingRateLimitError):
            # Leave transitional status; job queue will retry the REINDEX job.
            if doc.status not in ("Queued", "Extracting", "Indexing"):
                doc.status = "Indexing"
            return
        # Failed replace must not clear a previously good Indexed row when vectors
        # were preserved (prepare failed before delete).
        if was_indexed:
            return
        doc.status = "Indexing Failed"
        doc.chunks = 0
        return

    # Credential/probe failure or extract failure before vector replace — keep prior
    # Indexed status + chunk count so restart/reindex never flips Indexed → Failed.
    if result.get("preflight_failed") or result.get("vectors_preserved"):
        return

    chunks = int(result.get("chunks", 0) or 0)
    status = str(result.get("status") or "")
    if chunks > 0:
        doc.chunks = chunks
        doc.status = "Indexed"
        doc.indexed_at = datetime.now(timezone.utc)
        return

    if was_indexed:
        return

    lower = status.lower()
    if lower in {"no text extracted", "no text extractable"}:
        doc.status = "No Text Extracted"
        doc.chunks = 0
    else:
        doc.status = status if status and lower not in {"indexed", "index"} else "Indexing Failed"
        doc.chunks = 0


def reindex_crawl_source(
    db: Session,
    crawl_source_id: uuid.UUID,
    project_uuid: uuid.UUID,
    provider: str,
    model: str,
    api_key: Optional[str],
) -> Tuple[int, int, Optional[str]]:
    """Re-embed one crawl source in page batches (same strategy as post-crawl ingest)."""
    from .crawler import _ingest_crawl_documents_for_source

    crawl_src = db.query(CrawlSource).filter(CrawlSource.id == crawl_source_id).first()
    if not crawl_src:
        return 0, 0, "Crawl source not found"

    rows = db.query(Document).filter(Document.source_id == crawl_src.id).all()
    doc_count = len(rows)
    if not rows:
        return 0, 0, None

    target_collection = collection_name_for(str(project_uuid), provider, model)
    probe_error = _probe_embedding_credentials(provider, model, api_key)
    if probe_error:
        logger.warning(
            "Reindex preflight failed for crawl source %s (%s/%s): %s",
            crawl_src.id,
            provider,
            model,
            probe_error,
        )
        return doc_count, 0, probe_error

    rows_with_text = [d for d in rows if (d.text_content or "").strip()]
    if not rows_with_text:
        # Never wipe the collection when there is nothing to re-embed.
        return doc_count, 0, "No text extracted"

    try:
        locked_delete_document_embeddings(
            str(crawl_src.id), collection_name=target_collection
        )
    except Exception as exc:
        logger.warning(
            "Reindex: could not delete old crawl embeddings for source %s in %s: %s",
            crawl_src.id,
            target_collection,
            exc,
        )

    page_batch_size = int(settings.crawl_ingest_batch_size_jobs)
    if page_batch_size <= 0:
        page_batch_size = len(rows_with_text)
    else:
        page_batch_size = max(1, page_batch_size)

    total_chunks = 0
    last_error: Optional[str] = None
    for start in range(0, len(rows_with_text), page_batch_size):
        batch = rows_with_text[start : start + page_batch_size]
        try:
            result = _ingest_crawl_documents_for_source(
                db,
                crawl_src,
                batch,
                embedding_provider=provider,
                embedding_model=model,
                embedding_api_key=api_key,
                project_id=str(project_uuid),
            )
            total_chunks += int(result.get("chunks", 0) or 0)
            status = str(result.get("status") or "")
            if total_chunks == 0 and status and status.lower() not in {"indexed", "index"}:
                last_error = status
        except Exception as exc:
            logger.error(
                "Reindex: crawl source %s batch failed: %s",
                crawl_src.id,
                exc,
            )
            last_error = str(exc)

    if total_chunks > 0:
        return doc_count, total_chunks, None
    return doc_count, 0, last_error or "No chunks indexed"


def _apply_upload_result_to_progress(
    db: Session,
    project_uuid: uuid.UUID,
    source: str,
    result: Dict[str, Any],
    exc: Optional[Exception],
) -> None:
    if exc is not None:
        add_reindex_progress(
            db, project_uuid, source, failed_delta=1, error=str(exc)
        )
        return
    chunks = int(result.get("chunks", 0) or 0)
    if chunks > 0:
        add_reindex_progress(db, project_uuid, source, embedded_delta=1)
    elif result.get("preflight_failed") or result.get("vectors_preserved"):
        # Existing index left intact — count as skip, not a wipe/failure.
        add_reindex_progress(db, project_uuid, source, skipped_delta=1)
    else:
        detail = str(result.get("status") or "No chunks indexed")
        add_reindex_progress(db, project_uuid, source, failed_delta=1, error=detail)


def _apply_crawl_result_to_progress(
    db: Session,
    project_uuid: uuid.UUID,
    source: str,
    doc_count: int,
    chunks: int,
    error: Optional[str],
) -> None:
    """One progress tick per crawl source (not per crawled page)."""
    if doc_count == 0:
        return
    if error:
        add_reindex_progress(db, project_uuid, source, failed_delta=1, error=error)
    elif chunks > 0:
        add_reindex_progress(db, project_uuid, source, embedded_delta=1)
    else:
        add_reindex_progress(
            db,
            project_uuid,
            source,
            failed_delta=1,
            error=error or "No chunks indexed",
        )


def _pending_reindex_jobs_for_run(
    db: Session,
    project_id: uuid.UUID,
    source: str,
    run_id: str,
) -> int:
    prefix = f"reindex:{project_id}:{source}:{run_id}:"
    return (
        db.query(BackgroundJob)
        .filter(
            BackgroundJob.job_type == BackgroundJobType.REINDEX.value,
            BackgroundJob.project_id == project_id,
            BackgroundJob.status.in_(
                [
                    BackgroundJobStatus.PENDING.value,
                    BackgroundJobStatus.RUNNING.value,
                ]
            ),
            BackgroundJob.idempotency_key.like(f"{prefix}%"),
        )
        .count()
    )


def maybe_finalize_after_batch(
    db: Session,
    project_uuid: uuid.UUID,
    source: str,
    run_id: str,
) -> None:
    if _pending_reindex_jobs_for_run(db, project_uuid, source, run_id) > 0:
        return
    finalize_reindex_job(db, project_uuid, source)


def clear_orphaned_reindex_job_if_idle(
    db: Session,
    project_uuid: uuid.UUID,
    source: str,
) -> bool:
    """
    If ReindexJob is stuck ``running`` but no durable REINDEX jobs remain for this
    project/source, clear it so a new reindex can start. Returns True when cleared.
    """
    row = read_reindex_job(db, project_uuid, source)
    if not row or row.status != "running":
        return False
    prefix = f"reindex:{project_uuid}:{source}:"
    pending = (
        db.query(BackgroundJob)
        .filter(
            BackgroundJob.job_type == BackgroundJobType.REINDEX.value,
            BackgroundJob.status.in_(
                [
                    BackgroundJobStatus.PENDING.value,
                    BackgroundJobStatus.RUNNING.value,
                ]
            ),
            BackgroundJob.idempotency_key.like(f"{prefix}%"),
        )
        .count()
    )
    if pending > 0:
        return False
    finalize_reindex_job(
        db,
        project_uuid,
        source,
        status="error",
        error="Previous reindex run was interrupted with no active jobs.",
    )
    return True


def process_reindex_payload(payload: dict) -> None:
    """Worker entry: one REINDEX background job (upload batch or single crawl source)."""
    project_id = payload.get("project_id")
    source = payload.get("source", "search")
    run_id = payload.get("run_id")
    phase = payload.get("phase", "upload")

    if not project_id or not run_id:
        raise ValueError("reindex missing project_id or run_id")

    project_uuid = uuid.UUID(str(project_id))
    db = SessionLocal()
    try:
        provider, model, api_key = resolve_reindex_for_project(
            db, project_uuid, source=source
        )

        if phase == "crawl":
            crawl_source_id = payload.get("crawl_source_id")
            if not crawl_source_id:
                raise ValueError("reindex crawl phase missing crawl_source_id")
            doc_count, chunks, err = reindex_crawl_source(
                db,
                uuid.UUID(str(crawl_source_id)),
                project_uuid,
                provider,
                model,
                api_key,
            )
            _apply_crawl_result_to_progress(db, project_uuid, source, doc_count, chunks, err)
        else:
            document_ids: list[str] = payload.get("document_ids") or []
            if not document_ids:
                logger.info("Reindex upload batch empty for project %s", project_id)
            for doc_id in document_ids:
                doc = (
                    db.query(UploadedDocument)
                    .filter(UploadedDocument.id == uuid.UUID(str(doc_id)))
                    .first()
                )
                if not doc:
                    add_reindex_progress(db, project_uuid, source, skipped_delta=1)
                    continue
                try:
                    result = reindex_uploaded_document(doc, provider, model, api_key, db=db)
                    _sync_uploaded_document_after_reindex(db, doc, result)
                    db.commit()
                    _apply_upload_result_to_progress(db, project_uuid, source, result, None)
                except Exception as exc:
                    from .embed_rate_limit import EmbeddingRateLimitError, is_embed_rate_limit_error

                    if is_embed_rate_limit_error(exc) or isinstance(exc, EmbeddingRateLimitError):
                        _sync_uploaded_document_after_reindex(db, doc, {}, exc=exc)
                        db.commit()
                        # Let job_queue defer/retry this REINDEX job (do not mark item failed).
                        raise
                    logger.error("Reindex failed for doc %s: %s", doc_id, exc)
                    _sync_uploaded_document_after_reindex(db, doc, {}, exc=exc)
                    db.commit()
                    _apply_upload_result_to_progress(db, project_uuid, source, {}, exc)

    finally:
        db.close()


def enqueue_durable_reindex(
    db: Session,
    *,
    project_id: uuid.UUID,
    source: str,
    user_id: Optional[int],
    document_ids: List[str],
    include_crawled: bool,
) -> Tuple[str, int]:
    """
    Enqueue all REINDEX work for a run. Returns (run_id, job_count).
    Uses run_id in idempotency keys so concurrent runs do not collide.
    """
    from .job_queue import enqueue_job

    run_id = str(uuid.uuid4())
    batch_size = max(1, int(settings.reindex_batch_size))
    batch_idx = 0

    upload_batches = [
        document_ids[i : i + batch_size]
        for i in range(0, len(document_ids), batch_size)
    ]
    for batch in upload_batches:
        if not batch:
            continue
        enqueue_job(
            db,
            job_type=BackgroundJobType.REINDEX.value,
            payload={
                "project_id": str(project_id),
                "document_ids": batch,
                "source": source,
                "run_id": run_id,
                "phase": "upload",
            },
            user_id=user_id,
            project_id=project_id,
            idempotency_key=f"reindex:{project_id}:{source}:{run_id}:upload{batch_idx}",
            priority=1,
        )
        batch_idx += 1

    if include_crawled:
        _, _, crawl_source_ids, _ = expected_coverage_item_ids(db, project_id)
        for src_id_str in sorted(crawl_source_ids):
            src_id = uuid.UUID(src_id_str)
            enqueue_job(
                db,
                job_type=BackgroundJobType.REINDEX.value,
                payload={
                    "project_id": str(project_id),
                    "source": source,
                    "run_id": run_id,
                    "phase": "crawl",
                    "crawl_source_id": str(src_id),
                },
                user_id=user_id,
                project_id=project_id,
                idempotency_key=f"reindex:{project_id}:{source}:{run_id}:crawl{src_id}",
                priority=1,
            )
            batch_idx += 1

    return run_id, batch_idx


def run_reindex_inline(
    db: Session,
    project_uuid: uuid.UUID,
    source: str,
    provider: str,
    model: str,
    api_key: Optional[str],
    target_collection: str,
    *,
    include_crawled: bool = True,
    document_ids: Optional[List[uuid.UUID]] = None,
) -> Dict[str, Any]:
    """Full reindex in-process (thread path). Updates ReindexJob through completion."""
    if document_ids:
        unique_ids = list(dict.fromkeys(document_ids))
        uploaded = [
            doc
            for doc in (
                db.query(UploadedDocument)
                .filter(
                    UploadedDocument.project_id == project_uuid,
                    UploadedDocument.id.in_(unique_ids),
                )
                .all()
            )
            if _document_has_reindexable_bytes(doc, db)
        ]
        total = len(uploaded)
        include_crawled = False
    else:
        uploaded = [
            doc
            for doc in (
                db.query(UploadedDocument)
                .filter(UploadedDocument.project_id == project_uuid)
                .all()
            )
            if _document_has_reindexable_bytes(doc, db)
        ]
        total = count_reindex_items(
            db, project_uuid, include_crawled=include_crawled
        )

    row = read_reindex_job(db, project_uuid, source)
    if row:
        row.status = "running"
        db.commit()

    last_error: Optional[str] = None

    for doc in uploaded:
        try:
            result = reindex_uploaded_document(doc, provider, model, api_key, db=db)
            _sync_uploaded_document_after_reindex(db, doc, result)
            db.commit()
            chunks = int(result.get("chunks", 0) or 0)
            if chunks > 0:
                add_reindex_progress(db, project_uuid, source, embedded_delta=1)
            else:
                detail = str(result.get("error") or result.get("status") or "No chunks indexed")
                add_reindex_progress(
                    db, project_uuid, source, failed_delta=1, error=detail
                )
        except Exception as exc:
            from .embed_rate_limit import EmbeddingRateLimitError, is_embed_rate_limit_error

            if is_embed_rate_limit_error(exc) or isinstance(exc, EmbeddingRateLimitError):
                _sync_uploaded_document_after_reindex(db, doc, {}, exc=exc)
                db.commit()
                raise
            logger.error("Reindex: failed for uploaded_document %s: %s", doc.id, exc)
            _sync_uploaded_document_after_reindex(db, doc, {}, exc=exc)
            db.commit()
            add_reindex_progress(
                db, project_uuid, source, failed_delta=1, error=str(exc)
            )
            last_error = str(exc)

    if include_crawled:
        _, _, crawl_source_ids, _ = expected_coverage_item_ids(db, project_uuid)
        if crawl_source_ids:
            sources = (
                db.query(CrawlSource)
                .filter(
                    CrawlSource.project_id == project_uuid,
                    CrawlSource.id.in_([uuid.UUID(s) for s in crawl_source_ids]),
                )
                .all()
            )
            for crawl_src in sources:
                doc_count, chunks, err = reindex_crawl_source(
                    db, crawl_src.id, project_uuid, provider, model, api_key
                )
                _apply_crawl_result_to_progress(
                    db, project_uuid, source, doc_count, chunks, err
                )
                if err:
                    last_error = err

    finalize_reindex_job(
        db,
        project_uuid,
        source,
        status="done" if not last_error else "completed_with_errors",
    )

    row = read_reindex_job(db, project_uuid, source)
    return {
        "total": total,
        "embedded": int(row.embedded or 0) if row else 0,
        "skipped": int(row.skipped or 0) if row else 0,
        "failed": int(row.failed or 0) if row else 0,
        "error": row.error if row else last_error,
        "collection": target_collection,
    }
