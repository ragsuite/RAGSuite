"""Per-document embedding target for uploaded files, Text and Q&A sources.

A document may pin a Model Configuration provider key (``openai`` / ``mistral`` /
``gemini`` / ``ollama``) in ``ingest_embedding_target``, exactly like a crawl source.
The provider's *current* embedding model is resolved at training time. Rows without a
target (NULL) keep the legacy behavior: train into every distinct Search/Chat collection.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Iterable, List, Optional, Set

from sqlalchemy.orm import Session

from ..models import UploadedDocument
from .crawl_provider_targets import (
    PROVIDER_INGEST_TARGETS,
    normalize_ingest_target,
    provider_target_selection_error,
    resolve_provider_ingest_target,
    surface_collections,
)
from .rag import embedding_resolver
from .rag.embedding_resolver import IngestEmbeddingTarget

logger = logging.getLogger(__name__)


def _to_uuid(value: Any) -> Optional[uuid.UUID]:
    if isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError):
        return None


def normalize_document_ingest_target(value: Any) -> Optional[str]:
    """Provider key, or None for legacy / empty values."""
    key = normalize_ingest_target(value)
    return key if key in PROVIDER_INGEST_TARGETS else None


def parse_document_ingest_target(db: Session, project_id, value: Any) -> Optional[str]:
    """Validate a requested target; raises ``ValueError`` with a user-facing message."""
    raw = normalize_ingest_target(value)
    if not raw:
        return None
    if raw not in PROVIDER_INGEST_TARGETS:
        raise ValueError("Choose an AI model provider configured in Model Configuration.")
    error = provider_target_selection_error(db, project_id, raw)
    if error:
        raise ValueError(error)
    return raw


def document_ingest_targets(db: Session, project_id, ingest_target: Any) -> List[IngestEmbeddingTarget]:
    """Where a document trains: its pinned provider, or every Search/Chat collection."""
    key = normalize_document_ingest_target(ingest_target)
    if key is None:
        return embedding_resolver.resolve_upload_ingest_targets(db, project_id)
    target = resolve_provider_ingest_target(db, project_id, key)
    return [target] if target is not None else []


def stored_document_ingest_target(db: Session, document_id: Any) -> Optional[str]:
    doc_uuid = _to_uuid(document_id)
    if doc_uuid is None:
        return None
    row = (
        db.query(UploadedDocument.ingest_embedding_target)
        .filter(UploadedDocument.id == doc_uuid)
        .first()
    )
    return normalize_document_ingest_target(row[0]) if row else None


def pinned_document_collections(db: Session, project_id) -> Dict[str, Optional[str]]:
    """Pinned document id -> its provider's current collection (None while unusable)."""
    pid = _to_uuid(project_id)
    if pid is None:
        return {}
    pinned = (
        db.query(UploadedDocument.id, UploadedDocument.ingest_embedding_target)
        .filter(
            UploadedDocument.project_id == pid,
            UploadedDocument.ingest_embedding_target.isnot(None),
        )
        .all()
    )
    if not pinned:
        return {}

    surfaces = surface_collections(db, pid)
    collection_by_provider: Dict[str, Optional[str]] = {}
    out: Dict[str, Optional[str]] = {}
    for doc_id, raw_target in pinned:
        key = normalize_document_ingest_target(raw_target)
        if key is None:
            continue
        if key not in collection_by_provider:
            target = resolve_provider_ingest_target(db, pid, key, surfaces=surfaces)
            collection_by_provider[key] = target.collection if target else None
        out[str(doc_id)] = collection_by_provider[key]
    return out


def uploaded_ids_expected_for_collection(
    db: Session,
    project_id,
    active_collection: str,
    uploaded_ids: Iterable[str],
) -> Set[str]:
    """
    Uploaded document ids that belong in ``active_collection``.

    Unpinned documents belong in every Search/Chat collection. Pinned documents belong
    only in their provider's current collection (none while the provider cannot embed).
    """
    expected = {str(i) for i in uploaded_ids}
    if not expected:
        return expected
    for doc_id, collection in pinned_document_collections(db, project_id).items():
        if collection != active_collection:
            expected.discard(doc_id)
    return expected


def purge_stale_document_embedding_collections(
    db: Session,
    document_id: Any,
    current_targets: List[IngestEmbeddingTarget],
) -> None:
    """After a pinned document trains, drop its vectors from collections it no longer targets."""
    if stored_document_ingest_target(db, document_id) is None:
        return
    current = {t.collection for t in current_targets if t.collection}
    if not current:
        return

    from .rag.singleton import locked_delete_document_embeddings
    from .reindex_service import embedded_models_by_item_id

    doc_uuid = _to_uuid(document_id)
    row = db.query(UploadedDocument.project_id).filter(UploadedDocument.id == doc_uuid).first()
    if row is None:
        return
    did = str(doc_uuid)
    indexed = {
        str(m.get("collection"))
        for m in embedded_models_by_item_id(str(row[0]), candidate_ids={did}).get(did, [])
        if m.get("collection")
    }
    for collection_name in indexed - current:
        try:
            locked_delete_document_embeddings(did, collection_name=collection_name)
            logger.info("Purged stale document embeddings for %s in %s", did, collection_name)
        except Exception as exc:
            logger.warning(
                "Failed to purge stale document embeddings for %s in %s: %s",
                did,
                collection_name,
                exc,
            )
