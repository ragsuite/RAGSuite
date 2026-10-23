"""Elasticsearch collection with the Chroma-shaped API used by ``VectorDB``."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Mapping, Optional, Sequence

from . import es_client, es_filters

logger = logging.getLogger(__name__)

_GET_DEFAULT_INCLUDE = ("metadatas", "documents")
_QUERY_DEFAULT_INCLUDE = ("metadatas", "documents", "distances")


def _bulk_item_error(item: Any) -> Optional[str]:
    if not isinstance(item, dict) or not item:
        return None
    payload = next(iter(item.values()))
    if not isinstance(payload, dict):
        return None
    err = payload.get("error")
    if not err:
        return None
    if isinstance(err, dict):
        return str(err.get("reason") or err.get("type") or err)
    return str(err)


def raise_if_bulk_errors(resp: Any, op: str) -> None:
    """ES bulk returns HTTP 200 with ``errors: true`` when items are rejected."""
    body = resp.body if hasattr(resp, "body") else resp
    if not isinstance(body, dict) or not body.get("errors"):
        return
    reasons: List[str] = []
    for item in body.get("items") or []:
        reason = _bulk_item_error(item)
        if reason:
            reasons.append(reason)
        if len(reasons) >= 3:
            break
    detail = "; ".join(reasons) if reasons else "one or more items failed"
    raise RuntimeError(f"Elasticsearch bulk {op} failed: {detail}")


def _include(include: Optional[Sequence[str]], default: Sequence[str]) -> set:
    return set(default if include is None else include)


def _mapping(dim: int) -> Dict[str, Any]:
    return {
        "properties": {
            "chunk_id": {"type": "keyword"},
            "document_id": {"type": "keyword"},
            "project_id": {"type": "keyword"},
            "source_file": {"type": "keyword"},
            "user_id": {"type": "keyword"},
            "text": {"type": "text"},
            "head": {"type": "text"},
            "embedding": {
                "type": "dense_vector",
                "dims": int(dim),
                "index": True,
                "similarity": "cosine",
            },
            "metadata": {"type": "object", "enabled": True},
        }
    }


class EsCollection:
    def __init__(self, name: str, metric: str = "cosine") -> None:
        self.name = name
        self._metric = metric or "cosine"
        self.index = es_client.index_name_for(name)
        self._dim: Optional[int] = None
        stored = es_client.load_collection(name)
        if stored:
            self.index = stored.get("index") or self.index
            self._dim = stored.get("dim")

    @property
    def metadata(self) -> Dict[str, Any]:
        return {"hnsw:space": self._metric}

    def _ensure_index(self, dim: int) -> None:
        client = es_client.get_es()
        if not client.indices.exists(index=self.index):
            es_client.create_index(self.index, _mapping(dim))
            es_client.register_collection(self.name, self.index, dim, self._metric)
            self._dim = dim
            return
        es_client.ensure_single_node_replicas(self.index)
        if self._dim is None:
            self._dim = dim
            es_client.register_collection(self.name, self.index, dim, self._metric)
        elif int(self._dim) != int(dim):
            raise ValueError(f"Collection {self.name} expects dimension {self._dim}, got {dim}")

    def count(self, where: Optional[Mapping[str, Any]] = None) -> int:
        client = es_client.get_es()
        if not client.indices.exists(index=self.index):
            return 0
        result = client.count(index=self.index, query=es_filters.to_es_query(where))
        return int(result.get("count") or 0)

    def get(
        self,
        ids: Optional[Sequence[str]] = None,
        where: Optional[Mapping[str, Any]] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
        include: Optional[Sequence[str]] = None,
        **_: Any,
    ) -> Dict[str, Any]:
        inc = _include(include, _GET_DEFAULT_INCLUDE)
        out: Dict[str, Any] = {
            "ids": [],
            "documents": [] if "documents" in inc else None,
            "metadatas": [] if "metadatas" in inc else None,
            "embeddings": [] if "embeddings" in inc else None,
        }
        if ids is not None and len(ids) == 0:
            return out
        client = es_client.get_es()
        if not client.indices.exists(index=self.index):
            return out
        query = es_filters.to_es_query(where)
        if ids is not None:
            query = {"bool": {"must": [query, {"terms": {"chunk_id": [str(i) for i in ids]}}]}}
        size = max(0, int(limit)) if limit is not None else 10000
        result = client.search(
            index=self.index,
            query=query,
            from_=max(0, int(offset or 0)),
            size=size,
            _source=True,
        )
        for hit in result.get("hits", {}).get("hits", []):
            src = hit.get("_source") or {}
            out["ids"].append(src.get("chunk_id") or hit.get("_id"))
            if out["documents"] is not None:
                out["documents"].append(src.get("text") or "")
            if out["metadatas"] is not None:
                out["metadatas"].append(src.get("metadata") or {})
            if out["embeddings"] is not None:
                out["embeddings"].append(src.get("embedding"))
        return out

    def query(
        self,
        query_embeddings: Sequence[Sequence[float]],
        n_results: int = 10,
        where: Optional[Mapping[str, Any]] = None,
        include: Optional[Sequence[str]] = None,
        **_: Any,
    ) -> Dict[str, Any]:
        inc = _include(include, _QUERY_DEFAULT_INCLUDE)
        result: Dict[str, Any] = {
            "ids": [],
            "documents": [] if "documents" in inc else None,
            "metadatas": [] if "metadatas" in inc else None,
            "distances": [] if "distances" in inc else None,
            "embeddings": [] if "embeddings" in inc else None,
        }
        client = es_client.get_es()
        if not client.indices.exists(index=self.index):
            for _ in query_embeddings:
                result["ids"].append([])
                if result["documents"] is not None:
                    result["documents"].append([])
                if result["metadatas"] is not None:
                    result["metadatas"].append([])
                if result["distances"] is not None:
                    result["distances"].append([])
                if result["embeddings"] is not None:
                    result["embeddings"].append([])
            return result
        k = max(1, int(n_results))
        filt = es_filters.to_es_query(where)
        for emb in query_embeddings:
            knn = {
                "field": "embedding",
                "query_vector": [float(x) for x in emb],
                "k": k,
                "num_candidates": max(k * 4, 40),
                "filter": filt,
            }
            hits = client.search(index=self.index, knn=knn, size=k, _source=True).get("hits", {}).get("hits", [])
            result["ids"].append([h.get("_source", {}).get("chunk_id") or h.get("_id") for h in hits])
            if result["documents"] is not None:
                result["documents"].append([h.get("_source", {}).get("text") or "" for h in hits])
            if result["metadatas"] is not None:
                result["metadatas"].append([h.get("_source", {}).get("metadata") or {} for h in hits])
            if result["distances"] is not None:
                # ES 8 cosine knn _score is (1 + cosine) / 2. pgvector stores 1 - cosine.
                dists = []
                for h in hits:
                    score = float(h.get("_score") or 0.0)
                    dists.append(max(0.0, min(2.0, 2.0 * (1.0 - score))))
                result["distances"].append(dists)
            if result["embeddings"] is not None:
                result["embeddings"].append([h.get("_source", {}).get("embedding") for h in hits])
        return result

    def add(
        self,
        ids: Sequence[str],
        embeddings: Sequence[Sequence[float]],
        documents: Optional[Sequence[Optional[str]]] = None,
        metadatas: Optional[Sequence[Optional[Mapping[str, Any]]]] = None,
        **_: Any,
    ) -> int:
        return self._bulk(ids, embeddings, documents, metadatas, op="create")

    def upsert(
        self,
        ids: Sequence[str],
        embeddings: Sequence[Sequence[float]],
        documents: Optional[Sequence[Optional[str]]] = None,
        metadatas: Optional[Sequence[Optional[Mapping[str, Any]]]] = None,
        **_: Any,
    ) -> int:
        return self._bulk(ids, embeddings, documents, metadatas, op="index")

    def _bulk(
        self,
        ids: Sequence[str],
        embeddings: Sequence[Sequence[float]],
        documents: Optional[Sequence[Optional[str]]],
        metadatas: Optional[Sequence[Optional[Mapping[str, Any]]]],
        *,
        op: str,
    ) -> int:
        if not ids:
            return 0
        dim = len(embeddings[0])
        self._ensure_index(dim)
        docs = list(documents or [])
        metas = list(metadatas or [])
        actions: List[Dict[str, Any]] = []
        for i, chunk_id in enumerate(ids):
            meta = dict(metas[i] or {}) if i < len(metas) else {}
            text = docs[i] if i < len(docs) else ""
            body = {
                "chunk_id": str(chunk_id),
                "document_id": str(meta.get("document_id") or ""),
                "project_id": str(meta.get("project_id") or ""),
                "source_file": str(meta.get("source_file") or "")[:500],
                "user_id": str(meta["user_id"]) if meta.get("user_id") is not None else "",
                "text": text or "",
                "head": str(meta.get("title") or ""),
                "embedding": [float(x) for x in embeddings[i]],
                "metadata": meta,
            }
            actions.append({op: {"_index": self.index, "_id": str(chunk_id)}})
            actions.append(body)
        resp = es_client.get_es().bulk(operations=actions, refresh=True)
        raise_if_bulk_errors(resp, op)
        return len(ids)

    def delete(self, ids: Optional[Sequence[str]] = None, where: Optional[Mapping[str, Any]] = None, **_: Any) -> int:
        if ids is None and not where:
            raise ValueError("delete() needs ids or where")
        if ids is not None and len(ids) == 0:
            return 0
        client = es_client.get_es()
        if not client.indices.exists(index=self.index):
            return 0
        query = es_filters.to_es_query(where)
        if ids is not None:
            query = {"bool": {"must": [query, {"terms": {"chunk_id": [str(i) for i in ids]}}]}}
        result = client.delete_by_query(index=self.index, query=query, refresh=True)
        return int(result.get("deleted") or 0)

    def delete_source_prefix(self, prefix: str) -> List[str]:
        if not prefix:
            return []
        client = es_client.get_es()
        if not client.indices.exists(index=self.index):
            return []
        found = client.search(
            index=self.index,
            query={"prefix": {"source_file": prefix}},
            size=10000,
            _source=["chunk_id"],
        )
        ids = [h.get("_source", {}).get("chunk_id") or h.get("_id") for h in found.get("hits", {}).get("hits", [])]
        if ids:
            self.delete(ids=ids)
        return [str(i) for i in ids if i]
