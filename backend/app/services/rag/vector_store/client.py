"""``VectorDB``: per-(project, model) collections behind the RAG pipeline.

Elasticsearch is the primary retrieve engine when ``ELASTICSEARCH_URL`` is set.
pgvector remains available for tests and as the one-shot migrate source.
"""
from __future__ import annotations

import logging
import threading
from typing import Any, Dict, List, Optional, Union

from .. import lexical_index, source_routing
from ..embedder_factory import DEFAULT_COLLECTION_NAME
from . import schema
from .collection import PgCollection
from .engine import read_tx, write_tx
from .es_client import configured as es_configured
from .es_client import list_collection_names
from .es_collection import EsCollection
from .ingest import IngestMixin

logger = logging.getLogger(__name__)

CollectionT = Union[EsCollection, PgCollection]


class VectorDB(IngestMixin):
    def __init__(self) -> None:
        self._use_es = es_configured()
        if not self._use_es:
            schema.ensure_schema_once()
        self._collections: Dict[str, CollectionT] = {}
        self._collections_lock = threading.Lock()
        self.collection = self._get_or_create(DEFAULT_COLLECTION_NAME, metric="cosine")

    # ---------------- collections ----------------
    def _get_or_create(self, name: str, metric: str = "cosine") -> CollectionT:
        cached = self._collections.get(name)
        if cached is not None:
            return cached
        with self._collections_lock:
            cached = self._collections.get(name)
            if cached is not None:
                return cached
            if self._use_es:
                coll: CollectionT = EsCollection(name, metric=metric)
            else:
                with write_tx() as conn:
                    schema.register(conn, name, metric)
                coll = PgCollection(name, metric=metric)
            self._collections[name] = coll
            return coll

    def get_collection(self, name: Optional[str] = None, metric: str = "cosine") -> CollectionT:
        """Collection by name (registered on first use); default ``rag_collection``."""
        if not name:
            return self.collection
        return self._get_or_create(name, metric=metric)

    def list_known_collections(self) -> List[str]:
        try:
            if self._use_es:
                return list_collection_names() or list(self._collections.keys())
            with read_tx() as conn:
                return schema.list_names(conn)
        except Exception as exc:
            logger.warning("Failed to list vector collections: %s", exc)
            return list(self._collections.keys())

    def _targets(self, collection_name: Optional[str]) -> List[str]:
        if collection_name:
            return [collection_name]
        try:
            return self.list_known_collections() or [DEFAULT_COLLECTION_NAME]
        except Exception:
            return [DEFAULT_COLLECTION_NAME]

    # ---------------- deletes ----------------
    def delete_by_document_id(self, document_id: str, collection_name: Optional[str] = None) -> bool:
        """Delete a document's chunks; without ``collection_name`` sweeps every collection."""
        targets = self._targets(collection_name)
        any_ok = False
        for name in targets:
            try:
                self.get_collection(name).delete(where={"document_id": document_id})
                lexical_index.delete_where(name, document_id=document_id)
                any_ok = True
            except Exception as e:
                logger.error("Error deleting embeddings for %s from collection %s: %s", document_id, name, e)
        if any_ok:
            logger.info("Deleted embeddings for document_id=%s across %d collection(s)", document_id, len(targets))
        return any_ok

    def get_chunks_by_document_id(self, document_id: str) -> List[dict]:
        """All chunks of a document across collections, sorted by ``chunk_index``."""
        seen_ids: set = set()
        chunks: List[dict] = []
        for name in self._targets(None):
            try:
                result = self.get_collection(name).get(
                    where={"document_id": document_id}, include=["documents", "metadatas"]
                )
                for cid, chunk_text, meta in zip(
                    result.get("ids") or [], result.get("documents") or [], result.get("metadatas") or []
                ):
                    if cid not in seen_ids:
                        seen_ids.add(cid)
                        chunks.append({"text": chunk_text or "", "metadata": meta or {}})
            except Exception as e:
                logger.warning("get_chunks_by_document_id failed for collection %s: %s", name, e)
        chunks.sort(key=lambda c: c["metadata"].get("chunk_index", 0))
        return chunks

    def delete_by_source_file_exact(self, source_file_basename: str, collection_name: Optional[str] = None) -> bool:
        """Delete chunks whose ``source_file`` equals the basename."""
        targets = self._targets(collection_name)
        any_ok = False
        for name in targets:
            try:
                self.get_collection(name).delete(where={"source_file": source_file_basename})
                lexical_index.delete_where(name, source_file=source_file_basename)
                any_ok = True
            except Exception as e:
                logger.error("Error deleting embeddings for source_file=%s in %s: %s", source_file_basename, name, e)
        if any_ok:
            logger.info("Deleted embeddings for source_file=%s across %d collection(s)", source_file_basename, len(targets))
        return any_ok

    def delete_by_source_file_pattern(self, pattern: str, collection_name: Optional[str] = None) -> bool:
        """Delete by ``source_file`` prefix pattern (e.g. ``crawl_export_{id}_%``)."""
        prefix = pattern.replace("%", "")
        all_ok = True
        for name in self._targets(collection_name):
            try:
                deleted = self.get_collection(name).delete_source_prefix(prefix)
                if deleted:
                    lexical_index.delete_where(name, ids=deleted)
                    logger.info("Deleted %d embeddings for source_file pattern '%s' in %s", len(deleted), pattern, name)
            except Exception as e:
                logger.error("Error deleting embeddings for source_file pattern %s in %s: %s", pattern, name, e)
                all_ok = False
        return all_ok

    def delete_by_project_id(self, project_id: str, collection_name: Optional[str] = None) -> bool:
        """Delete a project's vectors; by default sweeps every collection."""
        targets = self._targets(collection_name)
        any_ok = False
        for name in targets:
            try:
                self.get_collection(name).delete(where={"project_id": str(project_id)})
                lexical_index.delete_where(name, project_id=str(project_id))
                any_ok = True
            except Exception as e:
                logger.error("Error deleting embeddings for project_id %s in %s: %s", project_id, name, e)
        if any_ok:
            logger.info("Deleted embeddings for project_id=%s across %d collection(s)", project_id, len(targets))
        return any_ok

    # ---------------- query / counts ----------------
    def query(
        self,
        embedding: List[float],
        top_k: int = 5,
        source_file: Optional[str] = None,
        document_id: Optional[str] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        collection_name: Optional[str] = None,
        document_ids: Optional[List[str]] = None,
        exclude_source_files: Optional[List[str]] = None,
        exclude_document_ids: Optional[List[str]] = None,
    ):
        """Nearest chunks as ``(documents, document_ids, metadatas, distances)``."""
        conditions: List[Dict[str, Any]] = []
        if source_file:
            conditions.append({"source_file": source_file})
        if document_id:
            conditions.append({"document_id": document_id})
        elif document_ids:
            conditions.append(source_routing.metadata_where(document_ids))
        if exclude_source_files:
            conditions.append({"source_file": {"$nin": list(exclude_source_files)}})
        if exclude_document_ids:
            conditions.append({"document_id": {"$nin": list(exclude_document_ids)}})
        if user_id is not None:
            conditions.append({"user_id": user_id})
        if project_id is not None:
            conditions.append({"project_id": str(project_id)})
        where: Optional[Dict[str, Any]] = None
        if len(conditions) == 1:
            where = conditions[0]
        elif conditions:
            where = {"$and": conditions}
        res = self.get_collection(collection_name).query(
            query_embeddings=[embedding],
            n_results=top_k,
            where=where,
            include=["documents", "distances", "metadatas"],
        )
        documents = res.get("documents", [[]])[0]
        metadatas = res.get("metadatas", [[]])[0]
        distances = res.get("distances", [[]])[0]
        document_ids_out = [m.get("document_id", "unknown") if m else "unknown" for m in metadatas]
        return documents, document_ids_out, metadatas, distances

    def count(self, user_id: Optional[int] = None, project_id: Optional[str] = None, collection_name: Optional[str] = None) -> int:
        """Total vectors without filters; with filters a 0/1 existence check (legacy contract)."""
        try:
            target = self.get_collection(collection_name)
            if user_id is None and project_id is None:
                return int(target.count())
            conditions: List[Dict[str, Any]] = []
            if user_id is not None:
                conditions.append({"user_id": user_id})
            if project_id is not None:
                conditions.append({"project_id": str(project_id)})
            where = conditions[0] if len(conditions) == 1 else {"$and": conditions}
            return 1 if target.get(where=where, limit=1, include=[]).get("ids") else 0
        except Exception as e:
            logger.warning(
                "Error counting documents (user_id=%s, project_id=%s, collection=%s): %s",
                user_id, project_id, collection_name, e,
            )
            return 0

    def count_filtered_exact(self, project_id: Optional[str] = None, collection_name: Optional[str] = None) -> int:
        """Exact number of a project's vectors in a collection (one indexed COUNT)."""
        try:
            target = self.get_collection(collection_name)
            if not project_id:
                return int(target.count())
            return int(target.count(where={"project_id": str(project_id)}))
        except Exception as exc:
            logger.warning("count_filtered_exact failed for project_id=%s collection=%s: %s", project_id, collection_name, exc)
            return 0
