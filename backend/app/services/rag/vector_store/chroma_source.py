"""Locate and open the legacy Chroma store (migration only).

The only module allowed to import ``chromadb``. Search order for the data directory:
``CHROMA_IMPORT_PATH`` > ``CHROMA_PERSIST_PATH`` > ``backend/data/chroma_db`` >
``backend/rag_db_local``. A directory counts only when it holds ``chroma.sqlite3``.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

_BACKEND_ROOT = Path(__file__).resolve().parents[4]
_SQLITE = "chroma.sqlite3"


@dataclass(frozen=True)
class SourceCollection:
    name: str
    metric: str
    count: int
    handle: Any


def _env_value(name: str) -> str:
    """Process env first, then ``backend/.env`` (deploy scripts do not export it)."""
    raw = os.environ.get(name)
    if raw is None:
        from dotenv import dotenv_values

        raw = dotenv_values(_BACKEND_ROOT / ".env").get(name)
    return (raw or "").strip()


def candidate_paths() -> List[Path]:
    out: List[Path] = []
    for env in ("CHROMA_IMPORT_PATH", "CHROMA_PERSIST_PATH"):
        raw = _env_value(env)
        if raw:
            path = Path(raw).expanduser()
            out.append(path if path.is_absolute() else _BACKEND_ROOT / path)
    out.append(_BACKEND_ROOT / "data" / "chroma_db")
    out.append(_BACKEND_ROOT / "rag_db_local")
    return out


def find_source_path() -> Optional[Path]:
    for path in candidate_paths():
        if (path / _SQLITE).is_file():
            return path
    return None


def chromadb_available() -> bool:
    try:
        import chromadb  # noqa: F401
    except ImportError:
        return False
    return True


class ChromaSource:
    """Read-only use of a Chroma persistent directory (only ``get``/``query``/``count``)."""

    def __init__(self, path: Path) -> None:
        import chromadb
        from chromadb.config import Settings

        self.path = path
        self._client = chromadb.PersistentClient(
            path=str(path), settings=Settings(anonymized_telemetry=False, allow_reset=False)
        )

    def collections(self) -> List[SourceCollection]:
        out: List[SourceCollection] = []
        for coll in self._client.list_collections():
            metric = str((coll.metadata or {}).get("hnsw:space") or "l2")
            out.append(SourceCollection(coll.name, metric, int(coll.count()), coll))
        out.sort(key=lambda c: (c.count, c.name))
        return out

    def collection(self, name: str) -> SourceCollection:
        coll = self._client.get_collection(name)
        metric = str((coll.metadata or {}).get("hnsw:space") or "l2")
        return SourceCollection(coll.name, metric, int(coll.count()), coll)


def iter_pages(
    coll: SourceCollection, *, page_size: int, start: int = 0, include: Optional[List[str]] = None
) -> Iterator[Dict[str, Any]]:
    """Pages in Chroma's stable storage order; each page carries its ``offset``."""
    fields = include if include is not None else ["documents", "metadatas", "embeddings"]
    offset = start
    while True:
        page = coll.handle.get(limit=page_size, offset=offset, include=fields)
        ids = list(page.get("ids") or [])
        if not ids:
            return
        page["offset"] = offset
        yield page
        offset += len(ids)
