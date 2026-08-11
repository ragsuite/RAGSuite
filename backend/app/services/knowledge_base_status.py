"""Knowledge-base readiness helpers for chat/search gates."""
from __future__ import annotations

import logging
import threading
import time
from typing import Dict, Literal, Optional, Tuple, Union
from uuid import UUID

from sqlalchemy.orm import Session

from .rag.embedder_factory import collection_name_for
from .rag.embedding_resolver import resolve_for_project

logger = logging.getLogger(__name__)

Source = Literal["search", "chat"]

# TTL cache so every chat/search query does not touch Chroma for readiness.
_KB_CACHE_TTL: float = 120.0
_kb_readiness_cache: Dict[str, Tuple[bool, float]] = {}
_kb_readiness_lock = threading.Lock()


def invalidate_kb_cache(project_id: str) -> None:
    """Drop cached readiness for a project (deletes / empty-index transitions)."""
    prefix = str(project_id) + ":"
    with _kb_readiness_lock:
        keys = [k for k in _kb_readiness_cache if k.startswith(prefix)]
        for k in keys:
            del _kb_readiness_cache[k]


def mark_kb_ready(project_id: str, *, source: Optional[Source] = None) -> None:
    """
    Optimistic warm after successful ingest: set readiness True without a Chroma scan.

    Avoids cache stampedes during large crawls (every batch used to invalidate →
    every concurrent chat/search re-probed Chroma under write lock).
    """
    pid = str(project_id)
    now = time.monotonic()
    with _kb_readiness_lock:
        if source is None:
            # Warm any existing keys for this project; also seed chat+search wildcards
            # once collection is known on next miss.
            for key in list(_kb_readiness_cache):
                if key.startswith(pid + ":"):
                    _kb_readiness_cache[key] = (True, now)
            return
        # source-specific keys are collection-qualified; warm all matching source suffixes.
        suffix = f":{source}"
        for key in list(_kb_readiness_cache):
            if key.startswith(pid + ":") and key.endswith(suffix):
                _kb_readiness_cache[key] = (True, now)


def _project_has_expected_content(db: Session, project_uuid: UUID) -> bool:
    """True when Postgres shows any upload or crawl content (EXISTS only — no blobs)."""
    from ..models import CrawlSource, Document, UploadedDocument

    # Never touch LargeBinary text_content on the hot path.
    has_upload = (
        db.query(UploadedDocument.id)
        .filter(UploadedDocument.project_id == project_uuid)
        .limit(1)
        .first()
    )
    if has_upload:
        return True

    # Prefer denormalized documents_count (O(1)).
    has_crawl_counted = (
        db.query(CrawlSource.id)
        .filter(
            CrawlSource.project_id == project_uuid,
            CrawlSource.documents_count.isnot(None),
            CrawlSource.documents_count > 0,
        )
        .limit(1)
        .first()
    )
    if has_crawl_counted:
        return True

    has_page = (
        db.query(Document.id)
        .join(CrawlSource, CrawlSource.id == Document.source_id)
        .filter(CrawlSource.project_id == project_uuid)
        .limit(1)
        .first()
    )
    return has_page is not None


def _compute_project_has_retrievable_content(
    vdb,
    db: Session,
    project_id: Union[str, UUID],
    user_id: Optional[int],
    *,
    collection: str,
    project_uuid: UUID,
) -> bool:
    """
    Uncached readiness — must stay O(1) on the chat/search critical path.

    Deliberately does NOT walk Chroma metadata or probe every coverage item.
    Gate semantics: project has live content in DB AND at least one vector exists
    in the active collection (existence get(limit=1) via vdb.count).
    """
    if not _project_has_expected_content(db, project_uuid):
        return False

    # Existence-only count (ChromaVDB.count uses get(limit=1)).
    quick_count = vdb.count(
        user_id=user_id,
        project_id=str(project_id),
        collection_name=collection,
    )
    if quick_count > 0:
        return True

    project_only = vdb.count(
        user_id=None,
        project_id=str(project_id),
        collection_name=collection,
    )
    if project_only > 0 and user_id is not None:
        logger.debug(
            "KB readiness: no chunks for user_id=%s in %s; project has %s chunk(s) from other members",
            user_id,
            collection,
            project_only,
        )
    return project_only > 0


def project_has_retrievable_content(
    vdb,
    db: Session,
    project_id: Union[str, UUID],
    user_id: Optional[int],
    *,
    source: Source = "chat",
) -> bool:
    """
    True when the project has live documents/crawl sources with retrievable vectors
    in the active embedding collection (ignores orphan vectors from deleted docs).
    """
    provider, model, _ = resolve_for_project(db, project_id, source=source)
    collection = collection_name_for(project_id, provider, model)
    project_uuid = project_id if isinstance(project_id, UUID) else UUID(str(project_id))

    cache_key = f"{project_id}:{collection}:{source}"
    now = time.monotonic()
    with _kb_readiness_lock:
        cached = _kb_readiness_cache.get(cache_key)
        if cached is not None and now - cached[1] < _KB_CACHE_TTL:
            return cached[0]

    result = _compute_project_has_retrievable_content(
        vdb,
        db,
        project_id,
        user_id,
        collection=collection,
        project_uuid=project_uuid,
    )

    with _kb_readiness_lock:
        _kb_readiness_cache[cache_key] = (result, now)
    return result


def no_embedded_content_detail(
    db: Session,
    project_id: Union[str, UUID],
    *,
    source: Source = "chat",
) -> str:
    """Actionable 503 message when the active collection has no vectors."""
    provider, model, _ = resolve_for_project(db, project_id, source=source)
    collection = collection_name_for(project_id, provider, model)
    return (
        "No documents embedded yet for this project in the active "
        f"embedding collection ({collection}). Upload documents or run a crawl, "
        "then re-index if you changed the embedding model in Settings."
    )
