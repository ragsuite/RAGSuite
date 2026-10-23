"""Vector store health and index repair (pgvector catalog reads, no table scans)."""
from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import text

from . import schema
from .engine import read_tx, write_tx

logger = logging.getLogger(__name__)

_COLLECTIONS_SQL = text(
    f"""
    SELECT r.name, r.table_name, r.dim, r.metric, r.index_kind,
           to_regclass('{schema.SCHEMA}.' || r.table_name) IS NOT NULL AS has_table,
           ix.indisvalid AS index_valid
    FROM {schema.REGISTRY} r
    LEFT JOIN pg_class ic
           ON ic.relname = r.table_name || '_hnsw'
          AND ic.relnamespace = '{schema.SCHEMA}'::regnamespace
    LEFT JOIN pg_index ix ON ix.indexrelid = ic.oid
    ORDER BY r.created_at, r.name
    """
)


def _status_of(row, count: Optional[int]) -> str:
    if not row.has_table or row.dim is None:
        return "empty"
    if not row.index_valid:
        return "index_missing"
    return "ok" if count != 0 else "empty"


def vector_store_status(
    collection_names: Optional[Iterable[str]] = None, *, include_counts: bool = True
) -> Dict[str, Any]:
    """ES cluster health when configured; otherwise pgvector catalog reads."""
    from .es_client import configured as es_configured
    from .es_client import health as es_health
    from .es_client import list_collection_names
    from .es_collection import EsCollection

    if es_configured():
        report = es_health()
        collections: List[Dict[str, Any]] = []
        wanted = {str(n) for n in collection_names} if collection_names is not None else None
        # Cheap probes (include_counts=False, no name filter) skip the collections listing.
        if include_counts or wanted is not None:
            try:
                for name in list_collection_names():
                    if wanted is not None and name not in wanted:
                        continue
                    count = EsCollection(name).count() if include_counts else None
                    collections.append({
                        "collection": name,
                        "count": count,
                        "dim": None,
                        "metric": "cosine",
                        "index_kind": "hnsw",
                        "index_valid": True,
                        "status": "ok" if (count or 0) or not include_counts else "empty",
                    })
            except Exception as exc:
                logger.warning("ES collection list failed: %s", exc)
        report["collections"] = collections
        report["pgvector_version"] = None
        report["elasticsearch_version"] = report.get("elasticsearch_version")
        return report

    return _pgvector_status(collection_names, include_counts=include_counts)


def _pgvector_status(
    collection_names: Optional[Iterable[str]] = None, *, include_counts: bool = True
) -> Dict[str, Any]:
    """Extension version plus per-collection table/index state (and row counts)."""
    wanted = {str(n) for n in collection_names} if collection_names is not None else None
    try:
        with read_tx() as conn:
            version = conn.execute(
                text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
            ).scalar()
            if not version:
                return {"healthy": False, "pgvector_version": None, "collections": [],
                        "message": "pgvector extension is not installed"}
            if conn.execute(text("SELECT to_regclass(:r)"), {"r": schema.REGISTRY}).scalar() is None:
                return {"healthy": False, "pgvector_version": version, "collections": [],
                        "message": "vector store schema is missing (run migrations)"}
            collections: List[Dict[str, Any]] = []
            for row in conn.execute(_COLLECTIONS_SQL):
                if wanted is not None and row.name not in wanted:
                    continue
                count: Optional[int] = None
                if include_counts and row.has_table:
                    count = int(conn.execute(
                        text(f"SELECT count(*) FROM {schema.SCHEMA}.{row.table_name}")
                    ).scalar() or 0)
                collections.append({
                    "collection": row.name,
                    "count": count,
                    "dim": row.dim,
                    "metric": row.metric,
                    "index_kind": row.index_kind,
                    "index_valid": bool(row.index_valid),
                    "status": _status_of(row, count),
                })
    except Exception as exc:
        logger.warning("Vector store status failed: %s", exc)
        return {"healthy": False, "pgvector_version": None, "collections": [], "message": str(exc)}
    broken = [c["collection"] for c in collections if c["status"] == "index_missing"]
    return {
        "healthy": not broken,
        "pgvector_version": version,
        "collections": collections,
        "message": f"Missing or invalid vector index: {', '.join(broken)}" if broken else "ok",
    }


def repair_vector_indexes(collection_names: Optional[Iterable[str]] = None) -> Dict[str, Any]:
    """Rebuild missing/invalid HNSW indexes and refresh planner statistics."""
    from .es_client import configured as es_configured

    if es_configured():
        return {"collections_repaired": 0, "repaired": [], "message": "Elasticsearch indexes do not use pgvector repair"}
    status = vector_store_status(collection_names, include_counts=False)
    repaired: List[str] = []
    for row in status.get("collections", []):
        if row["status"] != "index_missing":
            continue
        name = row["collection"]
        with write_tx(timeout_ms=0) as conn:
            info = schema.load_info(conn, name)
            if info is None or info.dim is None:
                continue
            conn.execute(text(f"DROP INDEX IF EXISTS {schema.SCHEMA}.{info.table}_hnsw"))
            schema.build_vector_index(conn, info)
            conn.execute(text(f"ANALYZE {info.qualified}"))
        repaired.append(name)
    message = f"Rebuilt vector index for {len(repaired)} collection(s)." if repaired else "All vector indexes are valid."
    return {"collections_repaired": len(repaired), "repaired": repaired, "message": message}
