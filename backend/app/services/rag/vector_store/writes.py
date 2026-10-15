"""Row-level writes for a collection table, inside a caller-owned transaction."""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence

from sqlalchemy import text
from sqlalchemy.engine import Connection

from . import codec
from .filters import build_where, promoted_values
from .schema import CollectionInfo

# Rows per multi-row INSERT statement (one round trip; ~2–8 MB of vector text).
ROWS_PER_STATEMENT = 200

_UPSERT = (
    "ON CONFLICT (chunk_id) DO UPDATE SET project_id = EXCLUDED.project_id, user_id = EXCLUDED.user_id, "
    "document_id = EXCLUDED.document_id, source_file = EXCLUDED.source_file, document = EXCLUDED.document, "
    "metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding"
)


def _checked(info: CollectionInfo, values: Any) -> Any:
    vec = codec.to_float32(values)
    if vec.shape[0] != info.dim:
        raise ValueError(f"Collection {info.name} expects dimension {info.dim}, got {vec.shape[0]}")
    return vec


def insert_rows(
    conn: Connection,
    info: CollectionInfo,
    ids: Sequence[str],
    embeddings: Sequence[Sequence[float]],
    documents: Optional[Sequence[Optional[str]]],
    metadatas: Optional[Sequence[Optional[Mapping[str, Any]]]],
    *,
    on_conflict: str = "nothing",
) -> int:
    """Multi-row INSERT; existing ids are skipped (``nothing``) or replaced (``update``)."""
    if not ids:
        return 0
    if len(embeddings) != len(ids):
        raise ValueError("ids and embeddings must have the same length")
    conflict = "ON CONFLICT (chunk_id) DO NOTHING" if on_conflict == "nothing" else _UPSERT
    written = 0
    for start in range(0, len(ids), ROWS_PER_STATEMENT):
        params: Dict[str, Any] = {}
        values: List[str] = []
        for j, i in enumerate(range(start, min(start + ROWS_PER_STATEMENT, len(ids)))):
            meta = dict(metadatas[i] or {}) if metadatas is not None else {}
            row = {
                "chunk_id": str(ids[i]),
                **promoted_values(meta),
                "document": codec.clean_text((documents[i] if documents is not None else None) or ""),
                "metadata": codec.dumps_metadata(meta),
                "embedding": codec.encode(_checked(info, embeddings[i])),
            }
            for key, value in row.items():
                params[f"{key}_{j}"] = value
            values.append(
                f"(:chunk_id_{j}, :project_id_{j}, :user_id_{j}, :document_id_{j}, :source_file_{j}, "
                f":document_{j}, CAST(:metadata_{j} AS jsonb), CAST(:embedding_{j} AS vector))"
            )
        result = conn.execute(
            text(
                f"INSERT INTO {info.qualified} "
                "(chunk_id, project_id, user_id, document_id, source_file, document, metadata, embedding) "
                f"VALUES {', '.join(values)} {conflict}"
            ),
            params,
        )
        written += max(0, int(result.rowcount or 0))
    return written


def update_rows(
    conn: Connection,
    info: CollectionInfo,
    ids: Sequence[str],
    embeddings: Optional[Sequence[Sequence[float]]],
    metadatas: Optional[Sequence[Optional[Mapping[str, Any]]]],
    documents: Optional[Sequence[Optional[str]]],
) -> int:
    """Chroma ``update``: given fields replace; metadata keys merge into the stored dict."""
    updated = 0
    for i, cid in enumerate(ids):
        sets: List[str] = []
        params: Dict[str, Any] = {"id": str(cid)}
        if embeddings is not None:
            sets.append("embedding = CAST(:emb AS vector)")
            params["emb"] = codec.encode(_checked(info, embeddings[i]))
        if documents is not None and documents[i] is not None:
            sets.append("document = :doc")
            params["doc"] = codec.clean_text(documents[i])
        meta = metadatas[i] if metadatas is not None else None
        if meta is not None:
            sets.append("metadata = metadata || CAST(:meta AS jsonb)")
            params["meta"] = codec.dumps_metadata(dict(meta))
        if not sets:
            continue
        row = conn.execute(
            text(f"UPDATE {info.qualified} SET {', '.join(sets)} WHERE chunk_id = :id RETURNING metadata::text AS metadata"),
            params,
        ).first()
        if row is None:
            continue
        updated += 1
        if meta is not None:
            conn.execute(
                text(
                    f"UPDATE {info.qualified} SET project_id = :project_id, user_id = :user_id, "
                    "document_id = :document_id, source_file = :source_file WHERE chunk_id = :id"
                ),
                {**promoted_values(codec.loads_metadata(row.metadata)), "id": str(cid)},
            )
    return updated


def delete_rows(
    conn: Connection,
    info: CollectionInfo,
    *,
    ids: Optional[Sequence[str]] = None,
    where: Optional[Mapping[str, Any]] = None,
) -> int:
    clause, params = build_where(where)
    if ids is not None:
        clause = f"({clause}) AND chunk_id = ANY(:ids)"
        params["ids"] = [str(i) for i in ids]
    result = conn.execute(text(f"DELETE FROM {info.qualified} WHERE {clause}"), params)
    return int(result.rowcount or 0)


def delete_source_prefix(conn: Connection, info: CollectionInfo, prefix: str) -> List[str]:
    like = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    rows = conn.execute(
        text(f"DELETE FROM {info.qualified} WHERE source_file LIKE :p RETURNING chunk_id"),
        {"p": like},
    ).all()
    return [r.chunk_id for r in rows]
