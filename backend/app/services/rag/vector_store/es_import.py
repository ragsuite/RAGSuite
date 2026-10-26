"""One-way import of pgvector ``ragvec`` collections into Elasticsearch.

    python -m app.services.rag.vector_store.es_import --auto
"""
from __future__ import annotations

import argparse
import logging
import sys
from typing import List, Optional

from sqlalchemy import text

from . import codec, schema
from .engine import read_tx
from .es_client import configured, create_index, get_es, health
from .es_collection import EsCollection

logger = logging.getLogger("es_import")
STATE_INDEX = "ragsuite-migrate-state"
PAGE = 400


def _log(message: str) -> None:
    print(f"[es-import] {message}", flush=True)


def _state_done() -> bool:
    client = get_es()
    if not client.indices.exists(index=STATE_INDEX):
        return False
    try:
        doc = client.get(index=STATE_INDEX, id="pgvector")
        return bool((doc.get("_source") or {}).get("complete"))
    except Exception:
        return False


def _mark_done() -> None:
    client = get_es()
    if not client.indices.exists(index=STATE_INDEX):
        create_index(STATE_INDEX, mappings={"properties": {"complete": {"type": "boolean"}}})
    client.index(index=STATE_INDEX, id="pgvector", document={"complete": True}, refresh=True)


def run_auto(force: bool = False) -> int:
    if not configured():
        _log("ELASTICSEARCH_URL is not set; skip")
        return 0
    report = health()
    if not report.get("healthy"):
        _log(f"Elasticsearch not healthy: {report.get('message')}")
        return 1
    if _state_done() and not force:
        _log("already complete")
        return 0
    schema.ensure_schema_once()
    try:
        with read_tx(timeout_ms=0) as conn:
            names = schema.list_names(conn)
    except Exception as exc:
        _log(f"no ragvec registry ({exc}); nothing to import")
        _mark_done()
        return 0
    if not names:
        _log("no pgvector collections; marking complete")
        _mark_done()
        return 0
    copied = 0
    for name in names:
        copied += _copy_collection(name)
    _mark_done()
    _log(f"imported {copied} chunk(s) from {len(names)} collection(s)")
    return 0


def _copy_collection(name: str) -> int:
    with read_tx(timeout_ms=0) as conn:
        info = schema.load_info(conn, name)
        if info is None or info.dim is None:
            return 0
        if conn.execute(text("SELECT to_regclass(:t)"), {"t": info.qualified}).scalar() is None:
            return 0
        total = int(conn.execute(text(f"SELECT count(*) FROM {info.qualified}")).scalar() or 0)
        if total == 0:
            return 0
        target = EsCollection(name, metric=info.metric)
        offset = 0
        written = 0
        while offset < total:
            rows = conn.execute(
                text(
                    f"SELECT chunk_id, document, metadata::text AS metadata, embedding::text AS embedding "
                    f"FROM {info.qualified} ORDER BY seq LIMIT :lim OFFSET :off"
                ),
                {"lim": PAGE, "off": offset},
            ).all()
            if not rows:
                break
            ids = [r.chunk_id for r in rows]
            docs = [r.document for r in rows]
            metas = [codec.loads_metadata(r.metadata) for r in rows]
            embs = [codec.decode(r.embedding) for r in rows]
            target.upsert(ids, embs, documents=docs, metadatas=metas)
            written += len(ids)
            offset += len(rows)
        _log(f"{name}: {written} chunk(s)")
        return written


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Import pgvector collections into Elasticsearch")
    parser.add_argument("--auto", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.WARNING)
    try:
        return run_auto(force=args.force)
    except Exception as exc:
        _log(f"ERROR: {exc}")
        logger.exception("es import failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
