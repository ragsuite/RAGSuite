"""One-way import of legacy Chroma vectors into pgvector (idempotent, resumable).

    python -m app.services.rag.vector_store.chroma_import --auto       # start-up step
    python -m app.services.rag.vector_store.chroma_import --verify     # re-check copies
    python -m app.services.rag.vector_store.chroma_import --benchmark  # recall/latency gates

Chunk ids are kept, so keyword-index rows and every stored reference stay valid. Each
page is inserted together with its checkpoint in one transaction; a crash resumes at
the last committed page. The HNSW index is built after the bulk load (much cheaper than
incremental inserts), then ``ANALYZE`` and a full verification run. Only a verified
import marks the collection complete; any failure exits non-zero so the API does not
start on a partial store. Chroma is only read, never modified.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional

from sqlalchemy import text

from . import schema, writes
from .chroma_source import ChromaSource, SourceCollection, chromadb_available, find_source_path, iter_pages
from .chroma_verify import target_count, verify_collection
from .engine import get_engine, write_tx

logger = logging.getLogger("chroma_import")

ALL_DONE = "*"
IMPORT_PAGE_SIZE = 500
_PAGE_PAUSE_SECONDS = 0.02
_RUN_LOCK_KEY = 0x52414749  # "RAGI"


def _log(message: str) -> None:
    print(f"[vector-import] {message}", flush=True)


def _state(name: str) -> Optional[Any]:
    with write_tx() as conn:
        return conn.execute(text(f"SELECT * FROM {schema.IMPORT_STATE} WHERE collection = :c"), {"c": name}).first()


def _set_state(conn, name: str, **fields: Any) -> None:
    cols = ["collection", *fields.keys()]
    sets = ", ".join(f"{k} = EXCLUDED.{k}" for k in fields) + ", updated_at = now()"
    conn.execute(
        text(
            f"INSERT INTO {schema.IMPORT_STATE} ({', '.join(cols)}) VALUES ({', '.join(':' + c for c in cols)}) "
            f"ON CONFLICT (collection) DO UPDATE SET {sets}"
        ),
        {"collection": name, **fields},
    )


def _save_state(name: str, **fields: Any) -> None:
    with write_tx() as conn:
        _set_state(conn, name, **fields)


@contextmanager
def _run_lock() -> Iterator[None]:
    """One importer at a time across processes/containers (session advisory lock)."""
    with get_engine().connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _RUN_LOCK_KEY})
        try:
            yield
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _RUN_LOCK_KEY})


def _copy(coll: SourceCollection, start: int, copied: int) -> int:
    for page in iter_pages(coll, page_size=IMPORT_PAGE_SIZE, start=start):
        ids = [str(i) for i in page["ids"]]
        embeddings = page["embeddings"]
        with write_tx() as conn:
            info = schema.ensure_table(conn, coll.name, len(embeddings[0]), coll.metric, with_index=False)
            copied += writes.insert_rows(conn, info, ids, embeddings, page.get("documents"), page.get("metadatas"))
            _set_state(conn, coll.name, copied=copied, next_offset=page["offset"] + len(ids), status="copying")
        _log(f"{coll.name}: {page['offset'] + len(ids)}/{coll.count} rows read, {copied} written")
        time.sleep(_PAGE_PAUSE_SECONDS)
    return copied


def _build_index(name: str) -> None:
    with write_tx(timeout_ms=0) as conn:
        info = schema.load_info(conn, name)
        if info is None or info.dim is None:
            return
        schema.build_vector_index(conn, info)
        conn.execute(text(f"ANALYZE {info.qualified}"))
        _set_state(conn, name, index_built=True, status="indexed")


def import_collection(coll: SourceCollection) -> Dict[str, Any]:
    state = _state(coll.name)
    if state is not None and state.status == "complete" and state.verified:
        return {"collection": coll.name, "ok": True, "skipped": True, "source_count": coll.count}
    if state is not None and state.status == "failed":
        # Resuming cannot repair a copy that failed verification; Chroma is still the
        # source of truth, so copy it again — unless the table holds rows Chroma never
        # had (written by an API started anyway), which must never be dropped silently.
        if target_count(coll.name) > coll.count:
            raise RuntimeError(
                f"{coll.name}: pgvector has more rows than the Chroma source after a failed import; "
                "refusing to re-copy automatically. Inspect ragvec.import_state and resolve manually."
            )
        _log(f"{coll.name}: previous attempt failed verification; re-copying from the start")
        with write_tx() as conn:
            schema.drop_collection(conn, coll.name)
            conn.execute(text(f"DELETE FROM {schema.IMPORT_STATE} WHERE collection = :c"), {"c": coll.name})
        state = None
    with write_tx() as conn:
        schema.register(conn, coll.name, coll.metric)
    _save_state(coll.name, source_count=coll.count, status="copying")
    if coll.count:
        start = int(state.next_offset) if state is not None else 0
        copied = int(state.copied) if state is not None else 0
        t0 = time.monotonic()
        copied = _copy(coll, start, copied)
        _log(f"{coll.name}: copied {copied} rows in {time.monotonic() - t0:.1f}s; building vector index")
        t0 = time.monotonic()
        _build_index(coll.name)
        _log(f"{coll.name}: index built in {time.monotonic() - t0:.1f}s; verifying")
    result = verify_collection(coll)
    summary = result.summary()
    _save_state(
        coll.name,
        verified=result.ok,
        status="complete" if result.ok else "failed",
        detail=json.dumps(summary)[:4000],
    )
    return summary


def _source() -> Optional[ChromaSource]:
    path = find_source_path()
    if path is None:
        return None
    if not chromadb_available():
        raise RuntimeError(f"Legacy Chroma data found at {path} but the chromadb package is not installed")
    _log(f"legacy Chroma store: {path}")
    return ChromaSource(path)


def run_auto(force: bool = False) -> int:
    schema.ensure_schema_once()
    marker = _state(ALL_DONE)
    if marker is not None and marker.status == "complete" and not force:
        _log("already migrated; nothing to do")
        return 0
    source = _source()
    if source is None:
        _log("no legacy Chroma data found; nothing to import")
        return 0
    with _run_lock():
        marker = _state(ALL_DONE)
        if marker is not None and marker.status == "complete" and not force:
            _log("already migrated by another process")
            return 0
        results: List[Dict[str, Any]] = []
        for coll in source.collections():
            _log(f"{coll.name}: {coll.count} rows ({coll.metric})")
            results.append(import_collection(coll))
        failed = [r["collection"] for r in results if not r["ok"]]
        detail = json.dumps({"source": str(source.path), "collections": results})[:4000]
        if failed:
            _save_state(ALL_DONE, status="failed", detail=detail)
            _log(f"FAILED verification: {', '.join(failed)}")
            return 1
        _save_state(ALL_DONE, status="complete", verified=True, detail=detail,
                    source_count=sum(r["source_count"] for r in results))
        _log(f"migration complete: {len(results)} collection(s), {sum(r['source_count'] for r in results)} rows")
        return 0


def run_verify() -> int:
    source = _source()
    if source is None:
        _log("no legacy Chroma data found; nothing to verify")
        return 0
    bad = 0
    for coll in source.collections():
        summary = verify_collection(coll).summary()
        _log(json.dumps(summary))
        bad += 0 if summary["ok"] else 1
    _log("verification passed" if not bad else f"verification FAILED for {bad} collection(s)")
    return 1 if bad else 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Import legacy Chroma vectors into pgvector")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--auto", action="store_true", help="import when needed (idempotent start-up step)")
    mode.add_argument("--verify", action="store_true", help="re-verify every collection against Chroma")
    mode.add_argument("--benchmark", action="store_true", help="recall/latency comparison with gates")
    parser.add_argument("--force", action="store_true", help="re-run --auto even when marked complete")
    parser.add_argument("--queries", type=int, default=100, help="benchmark queries per collection")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.WARNING)
    try:
        if args.auto:
            return run_auto(force=args.force)
        if args.verify:
            return run_verify()
        from .chroma_benchmark import run_benchmark

        source = _source()
        if source is None:
            _log("no legacy Chroma data found; nothing to benchmark")
            return 0
        return run_benchmark(source, queries=args.queries)
    except Exception as exc:
        _log(f"ERROR: {exc}")
        logger.exception("vector import failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
