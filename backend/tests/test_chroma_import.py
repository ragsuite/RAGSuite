"""Legacy Chroma -> pgvector import: lossless, verified, resumable, never destructive."""
from __future__ import annotations

import numpy as np
import pytest
from sqlalchemy import text

from tests.pgvector_fixtures import pgvector_database, requires_pgvector, vector_store  # noqa: F401

chromadb = pytest.importorskip("chromadb")
pytestmark = requires_pgvector

BIG = 1203  # spans several import pages


def _build_chroma(path):
    from chromadb.config import Settings

    client = chromadb.PersistentClient(path=str(path), settings=Settings(anonymized_telemetry=False))
    rng = np.random.default_rng(3)
    big = client.create_collection("big", metadata={"hnsw:space": "cosine"})
    vecs = rng.standard_normal((BIG, 8)).astype(np.float32)
    for start in range(0, BIG, 400):
        end = min(BIG, start + 400)
        big.add(
            ids=[f"c{i}" for i in range(start, end)],
            embeddings=vecs[start:end].tolist(),
            documents=[f"chunk {i} ünïcode" for i in range(start, end)],
            metadatas=[{"project_id": "p", "document_id": f"d{i // 50}", "user_id": 1, "chunk_index": i,
                        "ratio": i / 7, "flag": i % 2 == 0} for i in range(start, end)],
        )
    small = client.create_collection("l2coll")  # Chroma's default metric is l2
    small.add(ids=["a", "b", "c"], embeddings=rng.standard_normal((3, 4)).astype(np.float32).tolist(),
              documents=["x", "y", "z"], metadatas=[{"k": 1}, {"k": "two"}, {"k": 3.5}])
    client.create_collection("empty")
    return big


@pytest.fixture()
def legacy_store(vector_store, tmp_path, monkeypatch):
    big = _build_chroma(tmp_path)
    monkeypatch.setenv("CHROMA_IMPORT_PATH", str(tmp_path))
    monkeypatch.delenv("CHROMA_PERSIST_PATH", raising=False)
    monkeypatch.setattr("app.services.rag.vector_store.chroma_import._PAGE_PAUSE_SECONDS", 0)
    return big


def _imp():
    from app.services.rag.vector_store import chroma_import

    return chroma_import


def _marker():
    imp = _imp()
    return imp._state(imp.ALL_DONE)


def _coll(name, metric="cosine"):
    from app.services.rag.vector_store.collection import PgCollection

    return PgCollection(name, metric=metric)


def _corrupt(name, chunk_id):
    from app.services.rag.vector_store import schema
    from app.services.rag.vector_store.engine import write_tx

    with write_tx() as conn:
        info = schema.load_info(conn, name)
        conn.execute(text(f"UPDATE {info.qualified} SET document = 'tampered' WHERE chunk_id = :c"), {"c": chunk_id})


def test_auto_import_is_lossless_verified_and_idempotent(legacy_store, capsys):
    imp = _imp()
    assert imp.main(["--auto"]) == 0
    marker = _marker()
    assert marker.status == "complete" and marker.verified and marker.source_count == BIG + 3

    big = _coll("big")
    assert big.count() == BIG
    got = big.get(ids=["c0", "c777"], include=["embeddings", "documents", "metadatas"])
    # Byte-identical to what Chroma stores (its own float32 values are the source of truth).
    source = legacy_store.get(ids=["c0", "c777"], include=["embeddings"])["embeddings"]
    for have, want in zip(got["embeddings"], source):
        assert np.asarray(have, dtype=np.float32).tobytes() == np.asarray(want, dtype=np.float32).tobytes()
    assert got["documents"][1] == "chunk 777 ünïcode"
    assert got["metadatas"][1]["ratio"] == 777 / 7 and got["metadatas"][1]["flag"] is False

    from app.services.rag.vector_store import schema
    from app.services.rag.vector_store.engine import read_tx

    with read_tx() as conn:
        assert schema.load_info(conn, "big").index_kind == "hnsw"
        assert schema.load_info(conn, "l2coll").metric == "l2"
        assert "empty" in schema.list_names(conn)
    assert _coll("l2coll", "l2").get(where={"k": "two"})["ids"] == ["b"]

    assert imp.main(["--verify"]) == 0
    capsys.readouterr()
    assert imp.main(["--auto"]) == 0
    assert "already migrated" in capsys.readouterr().out


def test_no_legacy_store_is_a_noop(vector_store, monkeypatch):
    imp = _imp()
    monkeypatch.setattr(imp, "find_source_path", lambda: None)
    assert imp.main(["--auto"]) == 0
    assert _marker() is None


def test_resumes_after_a_crash_mid_copy(legacy_store, monkeypatch):
    imp = _imp()
    pauses = {"n": 0}

    def crash_after_two_pages(_seconds):
        # Collections import smallest first: l2coll's single page pauses once, then big's pages.
        pauses["n"] += 1
        if pauses["n"] == 3:
            raise RuntimeError("simulated crash")

    monkeypatch.setattr(imp.time, "sleep", crash_after_two_pages)
    assert imp.main(["--auto"]) == 1
    state = imp._state("big")
    assert state.status == "copying" and state.next_offset == 2 * imp.IMPORT_PAGE_SIZE
    assert _marker() is None

    monkeypatch.setattr(imp.time, "sleep", lambda _s: None)
    assert imp.main(["--auto"]) == 0
    assert _coll("big").count() == BIG
    assert _marker().status == "complete"


def test_resumes_after_a_crash_before_indexing(legacy_store, monkeypatch):
    imp = _imp()
    real_build = imp._build_index
    monkeypatch.setattr(imp, "_build_index", lambda name: (_ for _ in ()).throw(RuntimeError("boom")))
    assert imp.main(["--auto"]) == 1
    monkeypatch.setattr(imp, "_build_index", real_build)
    assert imp.main(["--auto"]) == 0
    assert _coll("big").count() == BIG


def _fail_once(monkeypatch, imp, name):
    real_verify = imp.verify_collection

    def failing(coll):
        result = real_verify(coll)
        if coll.name == name:
            result.vector_mismatch = 1
        return result

    monkeypatch.setattr(imp, "verify_collection", failing)
    assert imp.main(["--auto"]) == 1
    assert imp._state(name).status == "failed" and _marker().status == "failed"
    monkeypatch.setattr(imp, "verify_collection", real_verify)


def test_failed_verification_recopies_from_chroma(legacy_store, monkeypatch):
    imp = _imp()
    _fail_once(monkeypatch, imp, "big")
    _corrupt("big", "c5")
    assert imp.main(["--auto"]) == 0
    assert _coll("big").get(ids=["c5"])["documents"] == ["chunk 5 ünïcode"]
    assert _marker().status == "complete"


def test_never_drops_rows_chroma_does_not_have(legacy_store, monkeypatch):
    imp = _imp()
    _fail_once(monkeypatch, imp, "big")
    _coll("big").add(ids=["written-later"], embeddings=[[0.5] * 8], documents=["new"])
    assert imp.main(["--auto"]) == 1
    assert _coll("big").get(ids=["written-later"])["documents"] == ["new"]


def test_verification_detects_tampering(legacy_store):
    imp = _imp()
    assert imp.main(["--auto"]) == 0
    _corrupt("big", "c9")
    from app.services.rag.vector_store.chroma_source import ChromaSource, find_source_path

    result = imp.verify_collection(ChromaSource(find_source_path()).collection("big"))
    assert not result.ok and result.document_mismatch == 1
    assert imp.main(["--verify"]) == 1
