"""Chunk writes for ``VectorDB``: metadata shaping, batched ingest, atomic replace."""
from __future__ import annotations

import logging
import os
import re
import uuid
from typing import Any, Dict, List, Optional, Sequence

from .. import lexical_index
from ..utils_rag import _as_primitive, normalize_url

logger = logging.getLogger(__name__)

_URL_PATTERN = re.compile(r"https?://[^\s,<>'\")]+|www\.[^\s,<>'\")]+")
_META_STR_MAX = 1000


def sanitize_metadata(meta: Dict[str, Any]) -> Dict[str, Any]:
    """Scalar-only metadata (None -> "", long strings and other types truncated)."""
    sanitized: Dict[str, Any] = {}
    for key, value in meta.items():
        key_str = str(key)
        if value is None:
            sanitized[key_str] = ""
        elif isinstance(value, (str, int, float, bool)):
            sanitized[key_str] = value[:_META_STR_MAX] if isinstance(value, str) and len(value) > _META_STR_MAX else value
        else:
            sanitized[key_str] = str(value)[:_META_STR_MAX]
    return sanitized


def build_chunk_metadatas(
    documents: Sequence[str],
    *,
    start_index: int,
    document_id: str,
    source_file: str,
    chunk_metadata: Optional[List[Dict[str, Any]]],
    user_id: Optional[int],
    project_id: Optional[str],
) -> List[Dict[str, Any]]:
    metadatas: List[Dict[str, Any]] = []
    basename = str(os.path.basename(source_file))[:500]
    for idx, doc_text in enumerate(documents):
        chunk_idx = start_index + idx
        if chunk_metadata and chunk_idx < len(chunk_metadata):
            meta = dict(chunk_metadata[chunk_idx])
            meta["document_id"] = str(document_id)
            meta["source_file"] = basename
        else:
            found_urls = _URL_PATTERN.findall(doc_text)
            url = normalize_url(found_urls[0]) if found_urls else ""
            if not url.startswith(("http://", "https://", "file://")):
                url = f"file://{os.path.basename(source_file)}"
            title = os.path.splitext(os.path.basename(source_file))[0]
            meta = {
                "document_id": str(document_id),
                "source_file": basename,
                "title": str(_as_primitive(title))[:500] if title else "",
                "url": str(_as_primitive(url))[:1000] if url else "",
                "keywords": "",
                "chunk_index": int(chunk_idx),
            }
        if user_id is not None:
            meta["user_id"] = int(user_id)
        if project_id is not None:
            meta["project_id"] = str(project_id)
        metadatas.append(sanitize_metadata(meta))
    return metadatas


class IngestMixin:
    """Mixed into ``VectorDB`` (needs ``get_collection``)."""

    def _batch_size(self) -> int:
        from ....settings import settings

        return max(1, int(getattr(settings, "vector_ingest_batch_size", 500) or 500))

    def _prepare_rows(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        *,
        document_id: str,
        source_file: str,
        chunk_metadata: Optional[List[Dict[str, Any]]],
        user_id: Optional[int],
        project_id: Optional[str],
    ):
        total = min(len(texts), len(embeddings))
        if len(texts) != len(embeddings):
            logger.warning(
                "Text/embedding length mismatch for ingest: texts=%d, embeddings=%d. Using first %d items.",
                len(texts), len(embeddings), total,
            )
        texts = list(texts[:total])
        metadatas = build_chunk_metadatas(
            texts,
            start_index=0,
            document_id=document_id,
            source_file=source_file,
            chunk_metadata=chunk_metadata,
            user_id=user_id,
            project_id=project_id,
        )
        ids = [str(uuid.uuid4()) for _ in range(total)]
        return ids, texts, list(embeddings[:total]), metadatas

    def ingest(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        document_id: str,
        source_file: str,
        chunk_metadata: Optional[List[Dict[str, Any]]] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        collection_name: Optional[str] = None,
        collection_metric: str = "cosine",
    ) -> None:
        """Append chunks in batches (one transaction per batch)."""
        target = self.get_collection(collection_name, metric=collection_metric)
        ids, texts, embeddings, metadatas = self._prepare_rows(
            texts, embeddings, document_id=document_id, source_file=source_file,
            chunk_metadata=chunk_metadata, user_id=user_id, project_id=project_id,
        )
        size = self._batch_size()
        for start in range(0, len(ids), size):
            end = start + size
            target.add(
                ids[start:end],
                embeddings[start:end],
                documents=texts[start:end],
                metadatas=metadatas[start:end],
            )
            lexical_index.upsert_chunks(target.name, ids[start:end], texts[start:end], metadatas[start:end])
            logger.info(
                "Ingested batch %d (%d chunks) from %s -> %s",
                start // size + 1, len(ids[start:end]), os.path.basename(source_file), target.name,
            )
        logger.info(
            "Successfully ingested all %d chunks from %s with document_id: %s",
            len(ids), os.path.basename(source_file), document_id,
        )

    def replace_document(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        document_id: str,
        source_file: str,
        chunk_metadata: Optional[List[Dict[str, Any]]] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        collection_name: Optional[str] = None,
        collection_metric: str = "cosine",
    ) -> None:
        """Swap a document's chunks in one transaction: readers see old or new, never a gap."""
        target = self.get_collection(collection_name, metric=collection_metric)
        ids, texts, embeddings, metadatas = self._prepare_rows(
            texts, embeddings, document_id=document_id, source_file=source_file,
            chunk_metadata=chunk_metadata, user_id=user_id, project_id=project_id,
        )
        removed = target.delete(where={"document_id": str(document_id)})
        if ids:
            target.upsert(ids, embeddings, documents=texts, metadatas=metadatas)
        lexical_index.delete_where(target.name, document_id=str(document_id))
        size = self._batch_size()
        for start in range(0, len(ids), size):
            lexical_index.upsert_chunks(target.name, ids[start:start + size], texts[start:start + size], metadatas[start:start + size])
        logger.info(
            "Replaced document %s in %s: %d old chunk(s) -> %d new chunk(s) from %s",
            document_id, target.name, removed, len(ids), os.path.basename(source_file),
        )
