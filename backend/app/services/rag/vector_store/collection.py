"""pgvector-backed collection with the Chroma collection API the RAG code uses.

Response shapes match Chroma (``get`` -> flat lists, ``query`` -> list per query
embedding, ``None`` for fields not in ``include``), so callers and their tests keep
working unchanged. Rows keep insertion order (``seq``) for stable offset paging.
"""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence

from sqlalchemy import text
from sqlalchemy.engine import Connection

from . import codec, schema, writes
from .engine import read_tx, set_search_params, write_tx
from .filters import build_where

_GET_DEFAULT_INCLUDE = ("metadatas", "documents")
_QUERY_DEFAULT_INCLUDE = ("metadatas", "documents", "distances")
_HALFVEC_CANDIDATE_FACTOR = 4
_CANDIDATE_FACTOR = 2
_MIN_EXTRA_CANDIDATES = 20
_MAX_EF_SEARCH = 1000


def candidate_pool(k: int, *, halfvec: bool) -> int:
    """Index candidates re-ranked by exact distance for a top-``k`` query."""
    factor = _HALFVEC_CANDIDATE_FACTOR if halfvec else _CANDIDATE_FACTOR
    return max(k * factor, k + _MIN_EXTRA_CANDIDATES)


def _include(include: Optional[Sequence[str]], default: Sequence[str]) -> set:
    return set(default if include is None else include)


class PgCollection:
    def __init__(self, name: str, metric: str = "cosine") -> None:
        self.name = name
        self._metric = codec.normalize_metric(metric)

    @property
    def metadata(self) -> Dict[str, Any]:
        return {"hnsw:space": self._metric}

    # ---------------- registry ----------------
    def info_for_read(self, conn: Connection) -> Optional[schema.CollectionInfo]:
        info = schema.load_info(conn, self.name)
        return info if info is not None and info.dim is not None else None

    def info_for_write(self, conn: Connection, dim: int) -> schema.CollectionInfo:
        info = schema.load_info(conn, self.name)
        if info is not None and info.dim is not None:
            if info.dim != dim:
                raise ValueError(f"Collection {self.name} expects dimension {info.dim}, got {dim}")
            return info
        return schema.ensure_table(conn, self.name, dim, self._metric)

    # ---------------- reads ----------------
    def count(self, where: Optional[Mapping[str, Any]] = None) -> int:
        with read_tx() as conn:
            info = self.info_for_read(conn)
            if info is None:
                return 0
            clause, params = build_where(where)
            return int(conn.execute(text(f"SELECT count(*) FROM {info.qualified} WHERE {clause}"), params).scalar() or 0)

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
        with read_tx() as conn:
            info = self.info_for_read(conn)
            if info is None:
                return out
            clause, params = build_where(where)
            if ids is not None:
                clause = f"({clause}) AND chunk_id = ANY(:ids)"
                params["ids"] = [str(i) for i in ids]
            cols = ["chunk_id"]
            if "documents" in inc:
                cols.append("document")
            if "metadatas" in inc:
                cols.append("metadata::text AS metadata")
            if "embeddings" in inc:
                cols.append("embedding::text AS embedding")
            sql = f"SELECT {', '.join(cols)} FROM {info.qualified} WHERE {clause} ORDER BY seq"
            if limit is not None:
                sql += " LIMIT :limit"
                params["limit"] = max(0, int(limit))
            if offset:
                sql += " OFFSET :offset"
                params["offset"] = max(0, int(offset))
            rows = conn.execute(text(sql), params).all()
        for row in rows:
            out["ids"].append(row.chunk_id)
            if out["documents"] is not None:
                out["documents"].append(row.document)
            if out["metadatas"] is not None:
                out["metadatas"].append(codec.loads_metadata(row.metadata))
            if out["embeddings"] is not None:
                out["embeddings"].append(codec.decode(row.embedding))
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
        for emb in query_embeddings:
            rows = self._nearest(emb, max(1, int(n_results)), where, "embeddings" in inc)
            result["ids"].append([r.chunk_id for r in rows])
            if result["documents"] is not None:
                result["documents"].append([r.document for r in rows])
            if result["metadatas"] is not None:
                result["metadatas"].append([codec.loads_metadata(r.metadata) for r in rows])
            if result["distances"] is not None:
                result["distances"].append([float(r.distance) for r in rows])
            if result["embeddings"] is not None:
                result["embeddings"].append([codec.decode(r.embedding) for r in rows])
        return result

    def _nearest(self, embedding: Sequence[float], k: int, where: Optional[Mapping[str, Any]], with_embeddings: bool):
        from ....settings import settings

        vec = codec.to_float32(embedding)
        with read_tx() as conn:
            info = self.info_for_read(conn)
            if info is None:
                return []
            if vec.shape[0] != info.dim:
                raise ValueError(f"Query dimension {vec.shape[0]} does not match collection {self.name} ({info.dim})")
            clause, params = build_where(where)
            pool = candidate_pool(k, halfvec=info.halfvec)
            params.update({"q": codec.encode(vec), "k": k, "pool": pool})
            op = codec.distance_operator(info.metric)
            exact = codec.distance_sql(info.metric, f"(c.embedding {op} CAST(:q AS vector))")
            if info.halfvec:
                inner_order = f"(embedding::halfvec({info.dim}) {op} CAST(:q AS halfvec({info.dim})))"
            else:
                inner_order = f"(embedding {op} CAST(:q AS vector))"
            set_search_params(
                conn,
                ef_search=min(_MAX_EF_SEARCH, max(int(settings.pgvector_ef_search or 100), 2 * pool)),
                max_scan_tuples=int(settings.pgvector_max_scan_tuples or 20000),
                random_page_cost=float(settings.pgvector_random_page_cost or 1.1),
            )
            emb_col = ", c.embedding::text AS embedding" if with_embeddings else ""
            # The index walk (relaxed order, half precision above 2000 dims) yields a
            # candidate pool; exact distance picks the final top k, and only those rows
            # load their document and metadata.
            sql = f"""
                WITH pool AS MATERIALIZED (
                    SELECT seq FROM {info.qualified}
                    WHERE {clause}
                    ORDER BY {inner_order}
                    LIMIT :pool
                ), ranked AS MATERIALIZED (
                    SELECT c.seq, {exact} AS distance
                    FROM pool JOIN {info.qualified} c ON c.seq = pool.seq
                    ORDER BY distance, c.seq
                    LIMIT :k
                )
                SELECT c.chunk_id, c.document, c.metadata::text AS metadata{emb_col}, r.distance
                FROM ranked r JOIN {info.qualified} c ON c.seq = r.seq
                ORDER BY r.distance, r.seq
            """
            return conn.execute(text(sql), params).all()

    # ---------------- writes ----------------
    def add(
        self,
        ids: Sequence[str],
        embeddings: Sequence[Sequence[float]],
        documents: Optional[Sequence[Optional[str]]] = None,
        metadatas: Optional[Sequence[Optional[Mapping[str, Any]]]] = None,
        **_: Any,
    ) -> int:
        """Insert chunks; ids that already exist are left untouched (Chroma ``add``)."""
        if not ids:
            return 0
        with write_tx() as conn:
            info = self.info_for_write(conn, len(codec.to_float32(embeddings[0])))
            return writes.insert_rows(conn, info, ids, embeddings, documents, metadatas)

    def upsert(self, ids, embeddings, documents=None, metadatas=None, **_: Any) -> int:
        if not ids:
            return 0
        with write_tx() as conn:
            info = self.info_for_write(conn, len(codec.to_float32(embeddings[0])))
            return writes.insert_rows(conn, info, ids, embeddings, documents, metadatas, on_conflict="update")

    def update(
        self,
        ids: Sequence[str],
        embeddings: Optional[Sequence[Sequence[float]]] = None,
        metadatas: Optional[Sequence[Optional[Mapping[str, Any]]]] = None,
        documents: Optional[Sequence[Optional[str]]] = None,
        **_: Any,
    ) -> int:
        if not ids:
            return 0
        with write_tx() as conn:
            info = self.info_for_read(conn)
            if info is None:
                return 0
            return writes.update_rows(conn, info, ids, embeddings, metadatas, documents)

    def delete(self, ids: Optional[Sequence[str]] = None, where: Optional[Mapping[str, Any]] = None, **_: Any) -> int:
        if ids is None and not where:
            raise ValueError("delete() needs ids or where")
        if ids is not None and len(ids) == 0:
            return 0
        with write_tx() as conn:
            info = self.info_for_read(conn)
            return writes.delete_rows(conn, info, ids=ids, where=where) if info is not None else 0

    def delete_source_prefix(self, prefix: str) -> List[str]:
        """Delete chunks whose ``source_file`` starts with ``prefix``; returns deleted ids."""
        if not prefix:
            return []
        with write_tx() as conn:
            info = self.info_for_read(conn)
            return writes.delete_source_prefix(conn, info, prefix) if info is not None else []
