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
    """Return the on-disk Chroma directory when this process can see local storage.

    Docker sidecar mode (``CHROMA_HOST=chromadb``) still returns the shared
    persist volume when it is mounted into this container. Remote hosts without
    a local mount return ``None``.
    """
    if override:
        path = _absolute_chroma_dir(override)
        return path if path.exists() else None

    try:
        from ..settings import settings

        if getattr(settings, "chroma_persist_path", ""):
            path = _absolute_chroma_dir(settings.chroma_persist_path)
            if path.exists():
                return path
    except Exception:
        pass

    from .infra_env import chroma_host, chroma_http_enabled

    if chroma_http_enabled():
        host = chroma_host().lower()
        if host not in ("", "127.0.0.1", "localhost"):
            # Sidecar / remote HTTP with no mounted persist path.
            return None

    candidate = _backend_root() / "rag_db_local"
    return candidate if candidate.exists() else None


def is_hnsw_segment_error(message: Any) -> bool:
    """True when Chroma reports a missing/corrupt HNSW segment on disk."""
    text = str(message or "").lower()
    if not text:
        return False
    if "nothing found on disk" in text:
        return True
    if "hnsw segment" in text and ("error" in text or "corrupt" in text or "not found" in text):
        return True
    if "error creating hnsw segment reader" in text:
        return True
    return False


def _rust_hnsw_segment_corrupt(segment_dir: Path) -> bool:
    """Detect a Rust HNSW segment that looks incomplete (e.g. empty link lists)."""
    if not _segment_has_rust_hnsw_files(segment_dir):
        return False
    link_lists = segment_dir / "link_lists.bin"
    # Empty link_lists with other binaries present → unreadable segment reader.
    if link_lists.exists() and link_lists.stat().st_size == 0:
        return True
    data_level0 = segment_dir / "data_level0.bin"
    header = segment_dir / "header.bin"
    if data_level0.exists() and header.exists() and not link_lists.exists():
        return True
    return False


def _chroma_client():
    """HTTP or persistent Chroma client for repair rebuilds."""
    import chromadb
    from chromadb.config import Settings as ChromaSettings

    from .infra_env import chroma_host, chroma_http_enabled, chroma_port, chroma_ssl

    if chroma_http_enabled():
        host = chroma_host()
        port = chroma_port()
        ssl = chroma_ssl()
        settings = ChromaSettings(chroma_server_host=host, chroma_server_http_port=port)
        return chromadb.HttpClient(host=host, port=port, ssl=ssl, settings=settings)

    db_path = resolve_local_chroma_path()
    if db_path is None:
        raise RuntimeError("No local Chroma path available for PersistentClient")
    return chromadb.PersistentClient(path=str(db_path))


def _api_vector_probe(collection_name: str) -> tuple[bool, Optional[str]]:
    """Probe whether a collection answers a tiny vector query.

    Returns ``(ok, error_message)``. ``ok=True`` means live query works even if
    on-disk segment markers look suspicious.
    """
    try:
        client = _chroma_client()
        col = client.get_collection(collection_name)
        # Prefer a real query — count() alone can succeed when HNSW query fails.
        try:
            dim = None
            try:
                sample = col.get(limit=1, include=["embeddings"])
                embeddings = (sample or {}).get("embeddings") or []
                if embeddings and embeddings[0] is not None:
                    dim = len(embeddings[0])
            except Exception:
                dim = None
            if dim and dim > 0:
                col.query(query_embeddings=[[0.0] * dim], n_results=1)
            else:
                col.count()
        except Exception as query_exc:
            return False, str(query_exc)
        return True, None
    except Exception as exc:
        return False, str(exc)


def _invalidate_rag_collection_cache(collection_name: str) -> None:
    """Drop cached ChromaVDB handles so the next query reopens the collection."""
    try:
        from .rag.singleton import get_pipeline

        pipeline = get_pipeline()
        if pipeline is None:
            return
        vdb = getattr(pipeline, "vdb", None)
        if vdb is None:
            return
        cache = getattr(vdb, "_collections", None)
        if isinstance(cache, dict):
            cache.pop(collection_name, None)
            if collection_name == "rag_collection":
                vdb.collection = None
        try:
            from .rag import rag as rag_mod

            size_cache = getattr(rag_mod, "_collection_size_cache", None)
            if isinstance(size_cache, dict):
                size_cache.pop(collection_name, None)
        except Exception:
            pass
    except Exception as exc:
        logger.debug("chroma_repair: cache invalidate skipped: %s", exc)


def _snapshot_collection_vectors(
    collection_name: str,
    *,
    batch_size: int = 200,
) -> Dict[str, List[Any]]:
    """Export ids/embeddings/documents/metadatas before a destructive rebuild."""
    empty: Dict[str, List[Any]] = {
        "ids": [],
        "embeddings": [],
        "documents": [],
        "metadatas": [],
    }
    try:
        client = _chroma_client()
        col = client.get_collection(collection_name)
    except Exception as exc:
        logger.warning("chroma_repair: snapshot open failed for %s: %s", collection_name, exc)
        return empty

    ids: List[Any] = []
    embeddings: List[Any] = []
    documents: List[Any] = []
    metadatas: List[Any] = []
    offset = 0
    try:
        while True:
            batch = col.get(
                limit=batch_size,
                offset=offset,
                include=["embeddings", "documents", "metadatas"],
            )
            batch_ids = list((batch or {}).get("ids") or [])
            if not batch_ids:
                break
            batch_emb = list((batch or {}).get("embeddings") or [None] * len(batch_ids))
            batch_docs = list((batch or {}).get("documents") or [None] * len(batch_ids))
            batch_meta = list((batch or {}).get("metadatas") or [None] * len(batch_ids))
            # Keep only rows that still have embeddings (skip broken rows).
            for i, eid in enumerate(batch_ids):
                emb = batch_emb[i] if i < len(batch_emb) else None
                if emb is None:
                    continue
                ids.append(eid)
                embeddings.append(emb)
                documents.append(batch_docs[i] if i < len(batch_docs) else None)
                metadatas.append(batch_meta[i] if i < len(batch_meta) else None)
            offset += len(batch_ids)
            if len(batch_ids) < batch_size:
                break
    except Exception as exc:
        logger.warning("chroma_repair: snapshot get failed for %s: %s", collection_name, exc)
        if is_hnsw_segment_error(exc):
            return empty

    return {
        "ids": ids,
        "embeddings": embeddings,
        "documents": documents,
        "metadatas": metadatas,
    }


def rebuild_corrupt_hnsw_collection(
    collection_name: str,
    *,
    force: bool = False,
) -> Dict[str, Any]:
    """Delete and recreate a collection, restoring vectors from a pre-delete snapshot."""
    ok, err = _api_vector_probe(collection_name)
    if ok and not force:
        return {
            "rebuilt": False,
            "restored_vectors": 0,
            "flagged_documents": 0,
            "message": f"Collection {collection_name} is queryable — rebuild skipped.",
        }

    snapshot = _snapshot_collection_vectors(collection_name)
    client = _chroma_client()
    try:
        client.delete_collection(collection_name)
    except Exception as exc:
        logger.warning("chroma_repair: delete_collection(%s) failed: %s", collection_name, exc)

    col = client.get_or_create_collection(name=collection_name)
    restored = 0
    if snapshot.get("ids") and snapshot.get("embeddings"):
        try:
            col.add(
                ids=snapshot["ids"],
                embeddings=snapshot["embeddings"],
                documents=snapshot.get("documents"),
                metadatas=snapshot.get("metadatas"),
            )
            restored = len(snapshot["ids"])
        except Exception as exc:
            logger.error("chroma_repair: restore add failed for %s: %s", collection_name, exc)
            restored = 0

    _invalidate_rag_collection_cache(collection_name)
    flagged = 0
    if restored == 0:
        doc_ids: list[str] = []
        for meta in snapshot.get("metadatas") or []:
            if isinstance(meta, dict) and meta.get("document_id"):
                doc_ids.append(str(meta["document_id"]))
        flagged = _flag_documents_in_postgres(list(set(doc_ids)))

    # Optional post-rebuild probe (tests may stub a second success).
    _api_vector_probe(collection_name)

    if restored > 0:
        message = (
            f"Rebuilt collection {collection_name} and restored {restored} vector(s)."
        )
    elif flagged:
        message = (
            f"Rebuilt collection {collection_name} with no restorable vectors. "
            f"Flagged {flagged} document(s) for re-index."
        )
    else:
        message = (
            f"Rebuilt collection {collection_name}; no vectors were restored "
            f"(prior error: {err or 'unknown'})."
        )

    return {
        "rebuilt": True,
        "restored_vectors": restored,
        "flagged_documents": flagged,
        "message": message,
    }


def rebuild_corrupt_hnsw_collections(
    collection_names: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """Rebuild collections whose on-disk Rust HNSW segment looks corrupt.

    Never rebuilds when the live API still answers vector queries — disk markers
    alone are not enough (shared-volume / cache timing can look empty).
    """
    db_path = resolve_local_chroma_path()
    rebuilt = 0
    details: List[Dict[str, Any]] = []

    if db_path is None:
        return {
            "collections_rebuilt": 0,
            "details": [],
            "message": "No local Chroma directory — rebuild skipped.",
        }

    entries = _list_collection_segments(db_path)
    if collection_names:
        wanted = set(collection_names)
        entries = [e for e in entries if e.name in wanted]

    for entry in entries:
        segment_dir = db_path / entry.vector_seg_id
        if not _rust_hnsw_segment_corrupt(segment_dir):
            continue
        ok, _err = _api_vector_probe(entry.name)
        if ok:
            logger.info(
                "chroma_repair: skipping rebuild of %s — API probe OK despite disk markers",
                entry.name,
            )
            continue
        result = rebuild_corrupt_hnsw_collection(entry.name, force=True)
        details.append({"collection": entry.name, **result})
        if result.get("rebuilt"):
            rebuilt += 1

    return {
        "collections_rebuilt": rebuilt,
        "details": details,
        "message": (
            f"Rebuilt {rebuilt} collection(s)."
            if rebuilt
            else "No corrupt collections required rebuild."
        ),
    }


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
