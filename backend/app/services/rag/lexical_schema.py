"""Rows and SQL statements of the keyword sidecar index (``rag_chunk_lexical_index``).

Lexeme weights: title/URL words ``A``, passage words ``D`` and, for compound languages,
trailing word parts ``B`` ("verschleppung" of "Wasserverschleppung"). ``RANK_WEIGHTS``
keeps A and D at Postgres' defaults, so rows written before word parts existed rank
exactly as before, while part matches rank well below whole-word matches.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

from sqlalchemy import text

from . import query_keywords
from .language_preference import chunk_language

TABLE = "rag_chunk_lexical_index"
MAX_BODY_CHARS = 20000
_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)
# Bump when the indexed lexemes change; the daily backfill re-indexes older rows.
INDEX_VERSION = 2
# ts_rank_cd weight order is {D, C, B, A}.
RANK_WEIGHTS = "{0.1, 0.05, 0.02, 1.0}"
OUTDATED_CLAUSE = "(index_version IS NULL OR index_version < :v)"

_TSV_EXPR = (
    "setweight(to_tsvector('simple', :head), 'A') || to_tsvector('simple', :body)"
    " || setweight(to_tsvector('simple', :parts), 'B')"
)
_COLUMNS = "collection_name, chunk_id, project_id, document_id, source_file, tsv"
_VALUES = ":collection_name, :chunk_id, :project_id, :document_id, :source_file, " + _TSV_EXPR
_UPDATES = (
    "project_id = EXCLUDED.project_id, document_id = EXCLUDED.document_id, "
    "source_file = EXCLUDED.source_file, tsv = EXCLUDED.tsv"
)


def head_text(meta: Dict[str, Any]) -> str:
    """Title + URL words, weighted higher so entity/site names rank first."""
    title = str(meta.get("title") or "")
    url = re.sub(r"^https?://(www\.)?", "", str(meta.get("url") or ""))
    return " ".join(_TOKEN_RE.findall(f"{title} {url}".lower()))


def build_row(collection_name: str, chunk_id: str, doc: str, meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Bind parameters of one upsert; word parts only for compound-language passages."""
    meta = meta or {}
    body = (doc or "")[:MAX_BODY_CHARS].replace("\x00", " ")
    return {
        "collection_name": collection_name,
        "chunk_id": str(chunk_id),
        "project_id": str(meta.get("project_id") or "") or None,
        "document_id": str(meta.get("document_id") or "") or None,
        "source_file": str(meta.get("source_file") or "")[:500] or None,
        "head": head_text(meta).replace("\x00", " "),
        "body": body,
        "parts": query_keywords.index_fragments(body, chunk_language(body, meta), max_chars=MAX_BODY_CHARS),
        "index_version": INDEX_VERSION,
    }


def upsert_sql(with_version: bool):
    """Row upsert; ``with_version`` once the ``index_version`` column exists."""
    columns, values, updates = _COLUMNS, _VALUES, _UPDATES
    if with_version:
        columns += ", index_version"
        values += ", :index_version"
        updates += ", index_version = EXCLUDED.index_version"
    return text(
        f"INSERT INTO {TABLE} ({columns}) VALUES ({values}) "
        f"ON CONFLICT (collection_name, chunk_id) DO UPDATE SET {updates}"
    )


def search_sql(project_clause: str):
    """Ranked chunk ids for query ``:q``."""
    return text(
        f"SELECT chunk_id, ts_rank_cd('{RANK_WEIGHTS}'::float4[], tsv, q) AS rank "
        f"FROM {TABLE}, to_tsquery('simple', :q) AS q "
        f"WHERE collection_name = :collection_name {project_clause} AND tsv @@ q "
        "ORDER BY rank DESC LIMIT :limit"
    )
