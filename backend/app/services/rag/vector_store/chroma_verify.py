"""Prove a Chroma collection was copied to pgvector without loss.

Checks, per collection: equal row counts, every Chroma id present, float32 vectors
byte-identical, documents and metadata equal (after the storage normalization that
``codec`` applies on every write: NUL removal, non-finite floats as strings).
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List

from sqlalchemy import text

from . import codec, schema
from .chroma_source import SourceCollection, iter_pages
from .engine import read_tx

logger = logging.getLogger(__name__)

VERIFY_PAGE_SIZE = 500
_MAX_EXAMPLES = 5


@dataclass
class VerifyResult:
    collection: str
    source_count: int
    target_count: int = 0
    checked: int = 0
    missing: int = 0
    vector_mismatch: int = 0
    document_mismatch: int = 0
    metadata_mismatch: int = 0
    examples: List[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return (
            self.target_count == self.source_count
            and self.checked == self.source_count
            and not (self.missing or self.vector_mismatch or self.document_mismatch or self.metadata_mismatch)
        )

    def note(self, message: str) -> None:
        if len(self.examples) < _MAX_EXAMPLES:
            self.examples.append(message)

    def summary(self) -> Dict[str, Any]:
        return {
            "collection": self.collection,
            "ok": self.ok,
            "source_count": self.source_count,
            "target_count": self.target_count,
            "checked": self.checked,
            "missing": self.missing,
            "vector_mismatch": self.vector_mismatch,
            "document_mismatch": self.document_mismatch,
            "metadata_mismatch": self.metadata_mismatch,
            "examples": self.examples,
        }


def target_count(name: str) -> int:
    with read_tx(timeout_ms=0) as conn:
        info = schema.load_info(conn, name)
        if info is None or info.dim is None:
            return 0
        return int(conn.execute(text(f"SELECT count(*) FROM {info.qualified}")).scalar() or 0)


def _target_rows(name: str, ids: List[str]) -> Dict[str, Any]:
    with read_tx(timeout_ms=0) as conn:
        info = schema.load_info(conn, name)
        if info is None or info.dim is None:
            return {}
        rows = conn.execute(
            text(
                f"SELECT chunk_id, document, metadata::text AS metadata, embedding::text AS embedding "
                f"FROM {info.qualified} WHERE chunk_id = ANY(:ids)"
            ),
            {"ids": ids},
        ).all()
    return {r.chunk_id: r for r in rows}


def _compare_page(result: VerifyResult, page: Dict[str, Any]) -> None:
    ids = [str(i) for i in page.get("ids") or []]
    docs = page.get("documents") or [None] * len(ids)
    metas = page.get("metadatas") or [None] * len(ids)
    embs = page.get("embeddings")
    rows = _target_rows(result.collection, ids)
    for i, cid in enumerate(ids):
        result.checked += 1
        row = rows.get(cid)
        if row is None:
            result.missing += 1
            result.note(f"missing id {cid}")
            continue
        if not codec.vectors_equal(embs[i], codec.decode(row.embedding)):
            result.vector_mismatch += 1
            result.note(f"vector differs for {cid}")
        if codec.clean_text(docs[i] or "") != (row.document or ""):
            result.document_mismatch += 1
            result.note(f"document differs for {cid}")
        expected = json.loads(json.dumps(codec.normalize_metadata(metas[i] or {}), default=str))
        if expected != json.loads(row.metadata):
            result.metadata_mismatch += 1
            result.note(f"metadata differs for {cid}")


def verify_collection(coll: SourceCollection, *, page_size: int = VERIFY_PAGE_SIZE) -> VerifyResult:
    result = VerifyResult(collection=coll.name, source_count=coll.count)
    result.target_count = target_count(coll.name)
    if coll.count == 0:
        return result
    for page in iter_pages(coll, page_size=page_size):
        _compare_page(result, page)
    if not result.ok:
        logger.error("verify %s failed: %s", coll.name, result.summary())
    return result
