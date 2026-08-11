"""
ChromaDB HNSW ↔ SQLite consistency repair and health checks.

Detects chunks recorded in a collection's METADATA segment that are missing from
its VECTOR (HNSW) index. Partial writes after a crash can leave these orphans and
break compaction / queries.

Safe guarantees:
  - Operates per collection (never compares unrelated collections).
  - Backs up chroma.sqlite3 before any modification.
  - SQLite deletes run in a single transaction.
  - Never deletes HNSW binary files directly.
  - Works for local PersistentClient and local HTTP sidecar (same data dir).
  - Remote Chroma without a local path is skipped.
"""
from __future__ import annotations

import logging
import os
import pickle
import shutil
import sqlite3
import uuid as _uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _CollectionSegments:
    name: str
    vector_seg_id: str
    metadata_seg_id: Optional[str]


def _backend_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def _absolute_chroma_dir(raw: str) -> Path:
    """Resolve relative Chroma paths against the backend package root (not CWD)."""
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = (_backend_root() / path).resolve()
    return path


def resolve_local_chroma_path(override: Optional[str] = None) -> Optional[Path]:
    """Return the on-disk Chroma directory when this process uses local storage."""
    if override:
        path = _absolute_chroma_dir(override)
        return path if path.exists() else None

    from .infra_env import chroma_host, chroma_http_enabled

    if chroma_http_enabled():
        host = chroma_host().lower()
        if host not in ("", "127.0.0.1", "localhost"):
            return None

    try:
        from ..settings import settings

        if getattr(settings, "chroma_persist_path", ""):
            path = _absolute_chroma_dir(settings.chroma_persist_path)
            if path.exists():
                return path
    except Exception:
        pass

    candidate = _backend_root() / "rag_db_local"
    return candidate if candidate.exists() else None


def resolve_rag_chroma_db_path() -> Path:
    """
    Canonical on-disk Chroma directory for RAG ingest/query.

    Matches ``CHROMA_PERSIST_PATH`` / ``settings.chroma_persist_path`` when set,
    otherwise ``backend/rag_db_local``. HTTP mode still uses this as the path
    label; the sidecar should use the same ``--path``.
    """
    from .infra_env import chroma_persist_path

    configured = chroma_persist_path()
    if configured:
        return _absolute_chroma_dir(configured)
    return _backend_root() / "rag_db_local"


def repair_chroma_index(
    chroma_db_path: Optional[str] = None,
    *,
    create_backup: bool = True,
) -> Dict[str, Any]:
    """Repair all local collections. Returns a summary dict; never raises."""
    try:
        return _repair_all(chroma_db_path, create_backup=create_backup)
    except Exception as exc:
        logger.error("chroma_repair: unexpected error — skipping repair: %s", exc, exc_info=True)
        return {
            "orphans_removed": 0,
            "collections_repaired": 0,
            "backup_path": None,
            "message": f"Repair failed: {exc}",
        }


def check_chroma_health(
    chroma_db_path: Optional[str] = None,
    *,
    collection_names: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """Read-only health report for local Chroma collections."""
    try:
        return _health_report(chroma_db_path, collection_names=collection_names)
    except Exception as exc:
        logger.error("chroma_health: unexpected error: %s", exc, exc_info=True)
        return {
            "healthy": False,
            "local_path": None,
            "collections": [],
            "message": f"Health check failed: {exc}",
        }


def _list_collection_segments(db_path: Path) -> List[_CollectionSegments]:
    sqlite_path = db_path / "chroma.sqlite3"
    conn = sqlite3.connect(str(sqlite_path))
    try:
        rows = conn.execute(
            """
            SELECT c.name,
                   MAX(CASE WHEN s.scope = 'VECTOR' THEN s.id END) AS vector_seg,
                   MAX(CASE WHEN s.scope = 'METADATA' THEN s.id END) AS meta_seg
            FROM collections c
            JOIN segments s ON s.collection = c.id
            GROUP BY c.name
            ORDER BY c.name
            """
        ).fetchall()
    finally:
        conn.close()

    out: List[_CollectionSegments] = []
    for name, vector_seg, meta_seg in rows:
        if not vector_seg:
            continue
        out.append(_CollectionSegments(str(name), str(vector_seg), str(meta_seg) if meta_seg else None))
    return out


def _metadata_embedding_ids(sqlite_path: Path, metadata_seg_id: Optional[str]) -> set[str]:
    if not metadata_seg_id:
        return set()
    conn = sqlite3.connect(str(sqlite_path))
    try:
        return {
            r[0]
            for r in conn.execute(
                "SELECT embedding_id FROM embeddings WHERE segment_id = ?",
                (metadata_seg_id,),
            ).fetchall()
        }
    finally:
        conn.close()


def _segment_has_rust_hnsw_files(segment_dir: Path) -> bool:
    """Chroma HTTP/Rust sidecars store HNSW as binary files, not index_metadata.pickle."""
    if not segment_dir.is_dir():
        return False
    markers = ("data_level0.bin", "header.bin", "length.bin", "link_lists.bin")
    return any((segment_dir / name).exists() for name in markers)


def _load_hnsw_ids(segment_dir: Path) -> Optional[set[str]]:
    """
    Return HNSW ids from the legacy Python pickle layout.

    Returns:
      - set of ids when pickle is readable
      - empty set only when the segment dir has no vector index at all
      - None when the index exists but cannot be reconciled (skip destructive repair)

    Critical: modern Chroma HTTP servers write Rust HNSW binaries. A stale
    ``index_metadata.pickle`` may coexist; trusting that pickle as the live id
    set caused startup repair to delete live SQLite embedding rows and flag
    uploaded docs as Indexing Failed on every restart.
    """
    # Prefer Rust layout detection first — even when a pickle also exists.
    if _segment_has_rust_hnsw_files(segment_dir):
        logger.info(
            "chroma_repair: skipping HNSW reconcile for %s — Rust binary index; "
            "refusing destructive orphan deletes",
            segment_dir.name,
        )
        return None

    pickle_path = segment_dir / "index_metadata.pickle"
    if not pickle_path.exists():
        return set()
    try:
        with open(pickle_path, "rb") as f:
            meta = pickle.load(f)
        return set((meta.get("id_to_label") or {}).keys())
    except Exception as exc:
        logger.error("chroma_repair: failed to load HNSW pickle at %s: %s", pickle_path, exc)
        return None


def _api_collection_healthy(collection_name: str) -> bool:
    try:
        import chromadb
        from chromadb.config import Settings as ChromaSettings

        from .infra_env import chroma_host, chroma_http_enabled, chroma_port, chroma_ssl

        if chroma_http_enabled():
            host = chroma_host()
            port = chroma_port()
            ssl = chroma_ssl()
            settings = ChromaSettings(chroma_server_host=host, chroma_server_http_port=port)
            client = chromadb.HttpClient(host=host, port=port, ssl=ssl, settings=settings)
        else:
            db_path = resolve_local_chroma_path()
            if db_path is None:
                return False
            client = chromadb.PersistentClient(path=str(db_path))

        col = client.get_collection(collection_name)
        col.count()
        return True
    except Exception as exc:
        logger.debug("chroma_health: API smoke test failed for %s: %s", collection_name, exc)
        return False


def _collection_health_row(
    db_path: Path,
    entry: _CollectionSegments,
) -> Dict[str, Any]:
    sqlite_path = db_path / "chroma.sqlite3"
    vector_dir = db_path / entry.vector_seg_id
    meta_ids = _metadata_embedding_ids(sqlite_path, entry.metadata_seg_id)
    hnsw_ids = _load_hnsw_ids(vector_dir)
    hnsw_readable = hnsw_ids is not None
    hnsw_count = len(hnsw_ids or set())
    orphans = len(meta_ids - hnsw_ids) if hnsw_readable else len(meta_ids)
    api_ok = _api_collection_healthy(entry.name) if meta_ids or hnsw_count else True

    if not hnsw_readable:
        status = "hnsw_unreadable"
    elif orphans > 0:
        status = "orphans"
    elif not api_ok:
        status = "api_error"
    else:
        status = "healthy"

    return {
        "collection": entry.name,
        "metadata_chunks": len(meta_ids),
        "hnsw_chunks": hnsw_count,
        "orphan_chunks": orphans,
        "hnsw_readable": hnsw_readable,
        "api_healthy": api_ok,
        "status": status,
    }


def _health_report(
    chroma_db_path: Optional[str],
    *,
    collection_names: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    db_path = resolve_local_chroma_path(chroma_db_path)
    if db_path is None:
        return {
            "healthy": True,
            "local_path": None,
            "collections": [],
            "message": "No local Chroma directory — health check skipped.",
        }

    entries = _list_collection_segments(db_path)
    if collection_names:
        wanted = set(collection_names)
        entries = [e for e in entries if e.name in wanted]

    rows = [_collection_health_row(db_path, entry) for entry in entries]
    healthy = all(
        row["status"] == "healthy" or (row["metadata_chunks"] == 0 and row["hnsw_chunks"] == 0)
        for row in rows
    )
    if not rows:
        healthy = True

    return {
        "healthy": healthy,
        "local_path": str(db_path),
        "collections": rows,
        "message": "All collections healthy." if healthy else "One or more collections need repair.",
    }


def _prune_sqlite_backups(sqlite_path: Path, *, keep: int = 2) -> None:
    """Keep only the newest chroma.sqlite3.bak.* files so startup repair cannot fill the disk."""
    parent = sqlite_path.parent
    backups = sorted(
        parent.glob("chroma.sqlite3.bak.*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in backups[max(0, keep) :]:
        try:
            old.unlink(missing_ok=True)
            logger.info("chroma_repair: pruned old backup %s", old.name)
        except Exception as exc:
            logger.warning("chroma_repair: could not prune backup %s: %s", old, exc)


def _backup_sqlite(sqlite_path: Path) -> Optional[Path]:
    import time

    # Drop stale backups first so a ~1GB copy does not exhaust the volume.
    _prune_sqlite_backups(sqlite_path, keep=1)

    ts = int(time.time())
    backup = sqlite_path.parent / f"chroma.sqlite3.bak.{ts}"
    try:
        shutil.copy2(str(sqlite_path), str(backup))
        logger.info("chroma_repair: backup created at %s", backup)
        _prune_sqlite_backups(sqlite_path, keep=2)
        return backup
    except Exception as exc:
        logger.warning("chroma_repair: could not create backup: %s", exc)
        try:
            if backup.exists():
                backup.unlink(missing_ok=True)
        except Exception:
            pass
        return None


def _delete_orphans_for_segment(sqlite_path: Path, metadata_seg_id: str, orphan_ids: list[str]) -> int:
    if not orphan_ids:
        return 0

    conn = sqlite3.connect(str(sqlite_path))
    try:
        conn.execute("BEGIN IMMEDIATE")
        placeholders = ",".join("?" * len(orphan_ids))
        internal_ids = [
            r[0]
            for r in conn.execute(
                f"""
                SELECT id FROM embeddings
                WHERE segment_id = ? AND embedding_id IN ({placeholders})
                """,
                [metadata_seg_id, *orphan_ids],
            ).fetchall()
        ]
        if not internal_ids:
            conn.rollback()
            return 0

        ip = ",".join("?" * len(internal_ids))
        conn.execute(f"DELETE FROM embedding_metadata WHERE id IN ({ip})", internal_ids)
        conn.execute(
            f"DELETE FROM embedding_fulltext_search_content WHERE id IN ({ip})",
            internal_ids,
        )
        conn.execute(
            f"DELETE FROM embedding_fulltext_search WHERE rowid IN ({ip})",
            internal_ids,
        )
        conn.execute(
            f"DELETE FROM embeddings WHERE segment_id = ? AND embedding_id IN ({placeholders})",
            [metadata_seg_id, *orphan_ids],
        )
        deleted = conn.execute("SELECT changes()").fetchone()[0]
        conn.execute("COMMIT")
        return int(deleted)
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


def _affected_document_ids(sqlite_path: Path, orphan_ids: list[str]) -> list[str]:
    if not orphan_ids:
        return []
    conn = sqlite3.connect(str(sqlite_path))
    try:
        ph = ",".join("?" * len(orphan_ids))
        return list({
            r[0]
            for r in conn.execute(
                f"""
                SELECT DISTINCT em.string_value
                FROM embedding_metadata em
                JOIN embeddings e ON em.id = e.id
                WHERE e.embedding_id IN ({ph})
                  AND em.key = 'document_id'
                """,
                orphan_ids,
            ).fetchall()
            if r[0]
        })
    finally:
        conn.close()


def _flag_documents_in_postgres(document_ids: list[str]) -> int:
    if not document_ids:
        return 0
    try:
        from ..db import SessionLocal
        from ..models import UploadedDocument

        db = SessionLocal()
        flagged = 0
        try:
            for did in document_ids:
                try:
                    doc_uuid = _uuid.UUID(str(did))
                except ValueError:
                    continue
                doc = db.query(UploadedDocument).filter(UploadedDocument.id == doc_uuid).first()
                if doc and doc.status not in ("Indexing Failed", "Queued", "Extracting", "Indexing"):
                    doc.status = "Indexing Failed"
                    doc.chunks = 0
                    flagged += 1
            db.commit()
            return flagged
        finally:
            db.close()
    except Exception as exc:
        logger.error("chroma_repair: could not flag documents in Postgres: %s", exc)
        return 0


def _repair_all(chroma_db_path: Optional[str], *, create_backup: bool) -> Dict[str, Any]:
    db_path = resolve_local_chroma_path(chroma_db_path)
    if db_path is None:
        return {
            "orphans_removed": 0,
            "collections_repaired": 0,
            "backup_path": None,
            "message": "No local Chroma directory found.",
        }

    sqlite_path = db_path / "chroma.sqlite3"
    if not sqlite_path.exists():
        return {
            "orphans_removed": 0,
            "collections_repaired": 0,
            "backup_path": None,
            "message": "chroma.sqlite3 not found.",
        }

    entries = _list_collection_segments(db_path)
    pending: list[tuple[_CollectionSegments, list[str]]] = []
    for entry in entries:
        meta_ids = _metadata_embedding_ids(sqlite_path, entry.metadata_seg_id)
        hnsw_ids = _load_hnsw_ids(db_path / entry.vector_seg_id)
        if hnsw_ids is None:
            logger.warning(
                "chroma_repair: skipping %s — HNSW index not reconcilable via pickle",
                entry.name,
            )
            continue
        orphans = list(meta_ids - hnsw_ids)
        # Safety: never wipe an entire collection when HNSW appears empty.
        # That pattern is almost always a layout mismatch, not true orphans.
        if orphans and meta_ids and len(orphans) == len(meta_ids) and len(hnsw_ids) == 0:
            logger.warning(
                "chroma_repair: refusing to delete all %d chunk(s) in %s "
                "(HNSW reported empty) — re-index manually if needed",
                len(orphans),
                entry.name,
            )
            continue
        if orphans:
            pending.append((entry, orphans))

    if not pending:
        logger.info("chroma_repair: all collections consistent ✓")
        return {
            "orphans_removed": 0,
            "collections_repaired": 0,
            "backup_path": None,
            "message": "Index already consistent.",
        }

    backup_path = _backup_sqlite(sqlite_path) if create_backup else None
    if create_backup and backup_path is None:
        return {
            "orphans_removed": 0,
            "collections_repaired": 0,
            "backup_path": None,
            "message": "Backup failed — repair aborted to protect your data.",
        }

    total_deleted = 0
    collections_repaired = 0
    all_doc_ids: list[str] = []

    for entry, orphan_ids in pending:
        if not entry.metadata_seg_id:
            continue
        logger.warning(
            "chroma_repair: %s has %d orphan chunk(s) — repairing",
            entry.name,
            len(orphan_ids),
        )
        all_doc_ids.extend(_affected_document_ids(sqlite_path, orphan_ids))
        try:
            deleted = _delete_orphans_for_segment(sqlite_path, entry.metadata_seg_id, orphan_ids)
            total_deleted += deleted
            if deleted:
                collections_repaired += 1
        except Exception as exc:
            logger.error("chroma_repair: failed repairing %s: %s", entry.name, exc)

    flagged = _flag_documents_in_postgres(list(set(all_doc_ids)))
    if flagged:
        logger.warning("chroma_repair: flagged %d uploaded document(s) for re-index", flagged)

    after = _health_report(str(db_path))
    return {
        "orphans_removed": total_deleted,
        "collections_repaired": collections_repaired,
        "backup_path": str(backup_path) if backup_path else None,
        "healthy_after": after.get("healthy", False),
        "message": (
            f"Removed {total_deleted} mismatched chunk(s) across {collections_repaired} collection(s). "
            "Re-index affected sources if search is incomplete."
        ),
    }


# Backward-compatible alias used at startup.
def _repair(chroma_db_path: Optional[str]) -> int:
    result = _repair_all(chroma_db_path, create_backup=True)
    return int(result.get("orphans_removed", 0))
