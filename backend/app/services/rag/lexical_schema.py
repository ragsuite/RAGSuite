"""Rows and SQL statements of the keyword sidecar index (``rag_chunk_lexical_index``).

Lexeme weights: title/URL words ``A``, passage words ``D`` and, for compound languages,
trailing word parts ``B`` ("verschleppung" of "Wasserverschleppung"). ``RANK_WEIGHTS``
keeps A and D at Postgres' defaults, so rows written before word parts existed rank
exactly as before, while part matches rank well below whole-word matches.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

from sqlalchemy import bindparam, text

from . import query_keywords
from .language_preference import chunk_language

TABLE = "rag_chunk_lexical_index"
MAX_BODY_CHARS = 20000
_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)
# Bump when the indexed lexemes change; the daily backfill re-indexes older rows.
INDEX_VERSION = 3
# ts_rank_cd weight order is {D, C, B, A}.
RANK_WEIGHTS = "{0.1, 0.05, 0.02, 1.0}"
PAGE_LEAD_CHUNKS = 3
OUTDATED_CLAUSE = "(index_version IS NULL OR index_version < :v)"

# Joined codes rank as passage words: for a question in another language than the page,
# the code may be the only term that matches.
_TSV_EXPR = (
    "setweight(to_tsvector('simple', :head), 'A') || to_tsvector('simple', :body)"
    " || setweight(to_tsvector('simple', :parts), 'B') || to_tsvector('simple', :joined)"
)
_COLUMNS = "collection_name, chunk_id, project_id, document_id, source_file, tsv"
_VALUES = ":collection_name, :chunk_id, :project_id, :document_id, :source_file, " + _TSV_EXPR
_UPDATES = (
    "project_id = EXCLUDED.project_id, document_id = EXCLUDED.document_id, "
    "source_file = EXCLUDED.source_file, tsv = EXCLUDED.tsv"
)


def head_text(meta: Dict[str, Any]) -> str:
    """Title + URL words, weighted higher so entity/site names rank first.

    A site header/footer chunk's URL is just the page the block was first seen on, so
    only its title counts."""
    title = str(meta.get("title") or "")
    url = "" if meta.get("content_kind") else re.sub(r"^https?://(www\.)?", "", str(meta.get("url") or ""))
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
        "joined": query_keywords.joined_hyphenated(body, max_chars=MAX_BODY_CHARS),
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


SOURCE_CLAUSE = "AND (document_id IN :src_ids OR source_file IN :src_files)"
# Sources switched off for answers; a bare NOT IN would also drop rows whose source_file is NULL.
EXCLUDE_CLAUSE = "AND (source_file IS NULL OR source_file NOT IN :excluded_files)"
# Uploaded sources (Document / Text / Q&A) switched off for answers, keyed by document_id.
EXCLUDE_DOCUMENTS_CLAUSE = "AND (document_id IS NULL OR document_id NOT IN :excluded_docs)"
# Page scope: document_id alone lets Postgres use the (collection_name, document_id) index.
DOCUMENT_CLAUSE = "AND document_id IN :doc_ids"
_PAGE_IDENTITY = "document_id IS NOT NULL AND source_file IS DISTINCT FROM 'crawl_source_' || document_id"


def page_documents_sql(project_clause: str):
    """Documents of chunks ``:chunk_ids`` that are single pages of at most ``:max_chunks`` rows.

    Rows stamped with a source-wide crawl id carry no page identity and are skipped.
    """
    return text(
        f"SELECT document_id FROM {TABLE} "
        f"WHERE collection_name = :collection_name {project_clause} AND document_id IN ("
        f"SELECT DISTINCT document_id FROM {TABLE} "
        f"WHERE collection_name = :collection_name AND chunk_id IN :chunk_ids AND {_PAGE_IDENTITY}"
        ") GROUP BY document_id HAVING count(*) <= :max_chunks"
    ).bindparams(bindparam("chunk_ids", expanding=True))


def term_counts_sql(project_clause: str):
    """Rows matching each tsquery of ``:queries`` (1-based ``ordinality``), counted up to ``:cap``."""
    return text(
        "SELECT term.ordinality, (SELECT count(*) FROM ("
        f"SELECT 1 FROM {TABLE} WHERE collection_name = :collection_name {project_clause} "
        "AND tsv @@ to_tsquery('simple', term.query) LIMIT :cap) hits) "
        "FROM unnest(CAST(:queries AS text[])) WITH ORDINALITY AS term(query, ordinality)"
    )


def mentions_sql():
    """Positions (1-based) of the tsqueries in ``:queries`` matching some row of project ``:project_id``."""
    return text(
        "SELECT term.position FROM unnest(CAST(:queries AS text[])) WITH ORDINALITY AS term(query, position) "
        f"WHERE EXISTS(SELECT 1 FROM {TABLE} WHERE project_id = :project_id "
        "AND tsv @@ to_tsquery('simple', term.query))"
    )


def search_sql(
    project_clause: str,
    source_clause: str = "",
    required: bool = False,
    documents: bool = False,
    exclude: bool = False,
    exclude_documents: bool = False,
):
    """Ranked chunk ids for query ``:q``; ``source_clause`` (``SOURCE_CLAUSE``) scopes to sources.

    The best ``PAGE_LEAD_CHUNKS`` chunks of each document come first; its further chunks
    rank after every other document's lead chunks, so one large document whose title
    matches (a 370-page catalog PDF) cannot fill all ``:limit`` slots. Older crawls
    stamp the crawl source id as document_id on every page; such rows carry no page
    identity and are not grouped. ``required`` keeps only rows that also match ``:must``;
    ``documents`` keeps only rows of documents ``:doc_ids``; ``exclude`` drops rows of the
    crawl sources ``:excluded_files``; ``exclude_documents`` drops rows of the uploaded
    sources ``:excluded_docs``.
    """
    must_from = ", to_tsquery('simple', :must) AS must" if required else ""
    must_where = "AND tsv @@ must " if required else ""
    if documents:
        source_clause = f"{source_clause} {DOCUMENT_CLAUSE}"
    if exclude:
        source_clause = f"{source_clause} {EXCLUDE_CLAUSE}"
    if exclude_documents:
        source_clause = f"{source_clause} {EXCLUDE_DOCUMENTS_CLAUSE}"
    stmt = text(
        "SELECT chunk_id, rank FROM ("
        f"SELECT chunk_id, ts_rank_cd('{RANK_WEIGHTS}'::float4[], tsv, q) AS rank, "
        "row_number() OVER (PARTITION BY CASE WHEN document_id IS NULL "
        "OR source_file = 'crawl_source_' || document_id THEN chunk_id ELSE document_id END "
        f"ORDER BY ts_rank_cd('{RANK_WEIGHTS}'::float4[], tsv, q) DESC) AS page_pos "
        f"FROM {TABLE}, to_tsquery('simple', :q) AS q{must_from} "
        f"WHERE collection_name = :collection_name {project_clause} {source_clause} "
        f"{must_where}AND tsv @@ q"
        f") ranked ORDER BY (page_pos > {PAGE_LEAD_CHUNKS}), rank DESC LIMIT :limit"
    )
    params = []
    if SOURCE_CLAUSE in source_clause:
        params += [bindparam("src_ids", expanding=True), bindparam("src_files", expanding=True)]
    if documents:
        params.append(bindparam("doc_ids", expanding=True))
    if exclude:
        params.append(bindparam("excluded_files", expanding=True))
    if exclude_documents:
        params.append(bindparam("excluded_docs", expanding=True))
    return stmt.bindparams(*params) if params else stmt
