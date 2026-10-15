import pytest

from app.services.rag import chunk_context
from app.services.rag.chunk_context_backfill import backfill_collection
from app.services.rag.chunk_context_coverage import summarize


class FakeCollection:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []

    def get(self, limit, offset, include):
        page = self.rows[offset: offset + limit]
        return {
            "ids": [r["id"] for r in page],
            "documents": [r["doc"] for r in page],
            "metadatas": [r["meta"] for r in page],
        }

    def update(self, ids, embeddings, metadatas):
        self.updates.append((ids, embeddings, metadatas))
        for cid, meta in zip(ids, metadatas):
            next(r for r in self.rows if r["id"] == cid)["meta"] = meta


class Embedder:
    def __init__(self):
        self.texts = []

    def embed(self, texts):
        self.texts.extend(texts)
        return [[1.0] for _ in texts]


def _rows():
    return [
        {"id": "a", "doc": "Capacity 1000 ml", "meta": {"title": "Soap dispenser", "document_id": "d1",
                                                       "url": "https://x.com/catalogue.pdf"}},
        {"id": "b", "doc": "Already upgraded", "meta": {"title": "Page", "document_id": "d2",
                                                       "chunk_ctx_v": chunk_context.CHUNK_CONTEXT_VERSION}},
        {"id": "c", "doc": "   ", "meta": {"title": "Empty", "document_id": "d1"}},
        {"id": "d", "doc": "Weight 2 kg", "meta": {"title": "Soap dispenser", "document_id": "d1"}},
    ]


def test_backfill_updates_only_outdated_chunks_in_place():
    coll, embedder = FakeCollection(_rows()), Embedder()
    stats = backfill_collection(coll, "c", embedder, page_size=2, pause_seconds=0)
    assert stats["scanned"] == 4 and stats["updated"] == 2
    updated_ids = [cid for ids, _, _ in coll.updates for cid in ids]
    assert updated_ids == ["a", "d"]
    assert embedder.texts[0] == "Soap dispenser > catalogue\nCapacity 1000 ml"
    assert coll.rows[0]["doc"] == "Capacity 1000 ml"
    assert coll.rows[0]["meta"]["chunk_ctx_v"] == chunk_context.CHUNK_CONTEXT_VERSION
    assert stats["documents"]["d1"] == {"chunks": 3, "name": "https://x.com/catalogue.pdf"}


class FlakyCollection(FakeCollection):
    def __init__(self, rows):
        super().__init__(rows)
        self.dropped = False

    def update(self, ids, embeddings, metadatas):
        if not self.dropped:
            self.dropped = True
            raise RuntimeError("server closed the connection unexpectedly")
        super().update(ids, embeddings, metadatas)


def test_failed_update_is_not_swallowed_and_a_rerun_completes():
    coll = FlakyCollection(_rows())
    with pytest.raises(RuntimeError):
        backfill_collection(coll, "c", Embedder(), page_size=2, pause_seconds=0)
    assert coll.updates == []
    stats = backfill_collection(coll, "c", Embedder(), page_size=2, pause_seconds=0)
    assert stats["updated"] == 2
    assert [cid for ids, _, _ in coll.updates for cid in ids] == ["a", "d"]


def test_backfill_is_idempotent_and_coverage_counts_versions():
    coll = FakeCollection(_rows())
    backfill_collection(coll, "c", Embedder(), pause_seconds=0)
    second = backfill_collection(coll, "c", Embedder(), pause_seconds=0)
    assert second["updated"] == 0
    counts = summarize([r["meta"] for r in coll.rows])
    assert counts == {"total": 4, "outdated": 1, "llm_context": 0}
