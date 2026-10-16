"""PgCollection / VectorDB against a real pgvector database (Chroma-compatible behaviour)."""
from __future__ import annotations

import numpy as np
import pytest
from sqlalchemy import text

from tests.pgvector_fixtures import pgvector_database, requires_pgvector, vector_store  # noqa: F401

pytestmark = requires_pgvector


def _vectors(n: int, dim: int, seed: int = 7) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal((n, dim)).astype(np.float32)


def _collection(name: str = "coll", metric: str = "cosine"):
    from app.services.rag.vector_store.collection import PgCollection
    from app.services.rag.vector_store.engine import write_tx
    from app.services.rag.vector_store import schema

    with write_tx() as conn:
        schema.register(conn, name, metric)
    return PgCollection(name, metric=metric)


def _seed(coll, vecs, *, project="p1", docs_per=10):
    ids = [f"id{i}" for i in range(len(vecs))]
    metas = [
        {"project_id": project, "document_id": f"d{i // docs_per}", "source_file": f"crawl_source_s{i % 3}_x",
         "user_id": 1, "chunk_index": i, "lang": "en" if i % 2 else "de", "flag": bool(i % 2), "score": i / 10}
        for i in range(len(vecs))
    ]
    coll.add(ids=ids, embeddings=vecs.tolist(), documents=[f"doc {i}" for i in range(len(vecs))], metadatas=metas)
    return ids, metas


def test_roundtrip_is_lossless(vector_store):
    coll = _collection()
    vecs = _vectors(25, 16)
    ids, metas = _seed(coll, vecs)
    got = coll.get(include=["embeddings", "metadatas", "documents"])
    assert got["ids"] == ids
    assert got["metadatas"] == metas
    assert got["documents"][3] == "doc 3"
    for want, have in zip(vecs, got["embeddings"]):
        assert np.asarray(have, dtype=np.float32).tobytes() == want.tobytes()
    assert coll.count() == 25
    assert coll.count(where={"project_id": "p1"}) == 25


def test_add_keeps_existing_rows_and_upsert_overwrites(vector_store):
    coll = _collection()
    vecs = _vectors(2, 4)
    coll.add(ids=["a"], embeddings=[vecs[0].tolist()], documents=["first"], metadatas=[{"k": 1}])
    coll.add(ids=["a"], embeddings=[vecs[1].tolist()], documents=["second"], metadatas=[{"k": 2}])
    assert coll.get(ids=["a"])["documents"] == ["first"]
    coll.upsert(ids=["a"], embeddings=[vecs[1].tolist()], documents=["second"], metadatas=[{"k": 2}])
    assert coll.get(ids=["a"])["documents"] == ["second"]


def test_update_merges_metadata_and_refreshes_typed_columns(vector_store):
    coll = _collection()
    _seed(coll, _vectors(3, 4))
    coll.update(ids=["id0"], metadatas=[{"document_id": "moved", "extra": "x"}])
    meta = coll.get(ids=["id0"])["metadatas"][0]
    assert meta["document_id"] == "moved" and meta["extra"] == "x" and meta["lang"] == "de"
    assert coll.get(where={"document_id": "moved"})["ids"] == ["id0"]


def test_text_is_cleaned_like_postgres_requires(vector_store):
    coll = _collection()
    coll.add(ids=["n"], embeddings=[[1.0, 0.0]], documents=["a\x00b"], metadatas=[{"t": "x\x00y"}])
    got = coll.get(ids=["n"])
    assert got["documents"] == ["ab"] and got["metadatas"] == [{"t": "xy"}]


@pytest.mark.parametrize("metric", ["cosine", "l2", "ip"])
def test_query_distances_match_chroma_definitions(vector_store, metric):
    coll = _collection(f"m_{metric}", metric)
    vecs = _vectors(60, 8)
    _seed(coll, vecs)
    q = _vectors(1, 8, seed=99)[0]
    res = coll.query(query_embeddings=[q.tolist()], n_results=5)
    v, qq = vecs.astype(np.float64), q.astype(np.float64)
    if metric == "cosine":
        expected = 1 - (v @ qq) / (np.linalg.norm(v, axis=1) * np.linalg.norm(qq))
    elif metric == "l2":
        expected = ((v - qq) ** 2).sum(axis=1)
    else:
        expected = 1 - v @ qq
    order = np.argsort(expected, kind="stable")[:5]
    assert res["ids"][0] == [f"id{i}" for i in order]
    assert np.allclose(res["distances"][0], expected[order], atol=1e-4)


def test_filtered_query_returns_full_top_k_of_matching_rows(vector_store):
    coll = _collection()
    vecs = _vectors(400, 8)
    _seed(coll, vecs)
    q = _vectors(1, 8, seed=5)[0].tolist()
    res = coll.query(query_embeddings=[q], n_results=10, where={"$and": [{"lang": "en"}, {"document_id": {"$in": ["d1", "d2", "d3"]}}]})
    assert len(res["ids"][0]) == 10
    assert all(m["lang"] == "en" and m["document_id"] in {"d1", "d2", "d3"} for m in res["metadatas"][0])
    res = coll.query(query_embeddings=[q], n_results=5, where={"source_file": {"$nin": ["crawl_source_s0_x"]}})
    assert all(m["source_file"] != "crawl_source_s0_x" for m in res["metadatas"][0])
    assert coll.count(where={"flag": True}) == 200
    assert coll.count(where={"score": {"$gte": 39.0}}) == 10


def test_high_dimension_collections_use_halfvec_index_and_exact_ranking(vector_store):
    coll = _collection("big")
    vecs = _vectors(40, 2304)
    _seed(coll, vecs)
    from app.services.rag.vector_store.engine import read_tx

    with read_tx() as conn:
        info = coll.info_for_read(conn)
    assert info.halfvec and info.index_kind == "hnsw_halfvec"
    res = coll.query(query_embeddings=[vecs[7].tolist()], n_results=3)
    assert res["ids"][0][0] == "id7"
    assert res["distances"][0][0] == pytest.approx(0.0, abs=1e-5)


def test_dimension_mismatch_is_rejected(vector_store):
    coll = _collection()
    coll.add(ids=["a"], embeddings=[[1.0, 0.0, 0.0]])
    with pytest.raises(ValueError):
        coll.add(ids=["b"], embeddings=[[1.0, 0.0]])
    with pytest.raises(ValueError):
        coll.query(query_embeddings=[[1.0, 0.0]], n_results=1)


def test_paging_and_deletes(vector_store):
    coll = _collection()
    ids, _ = _seed(coll, _vectors(30, 4))
    assert coll.get(limit=5, offset=10)["ids"] == ids[10:15]
    assert coll.delete(ids=["id0", "id1"]) == 2
    assert coll.delete(where={"document_id": "d1"}) == 10
    removed = coll.delete_source_prefix("crawl_source_s1")
    assert removed and all(i not in removed for i in ["id0", "id1"])
    assert coll.count() == 30 - 2 - 10 - len(removed)
    # LIKE wildcards in the prefix are literal.
    assert coll.delete_source_prefix("crawl%") == []
    with pytest.raises(ValueError):
        coll.delete()


def test_replace_document_swaps_chunks_atomically(vector_store):
    from app.services.rag.vector_store.client import VectorDB

    vdb = VectorDB()
    vecs = _vectors(6, 4)
    vdb.replace_document(["a", "b", "c"], vecs[:3].tolist(), document_id="doc", source_file="f.txt",
                         project_id="p", user_id=1, collection_name="rep")
    vdb.replace_document(["keep"], vecs[3:4].tolist(), document_id="other", source_file="g.txt",
                         project_id="p", user_id=1, collection_name="rep")
    vdb.replace_document(["x", "y"], vecs[4:6].tolist(), document_id="doc", source_file="f.txt",
                         project_id="p", user_id=1, collection_name="rep")
    coll = vdb.get_collection("rep")
    assert sorted(coll.get(where={"document_id": "doc"})["documents"]) == ["x", "y"]
    assert coll.get(where={"document_id": "other"})["documents"] == ["keep"]
    docs, doc_ids, _metas, _d = vdb.query(vecs[4].tolist(), top_k=1, project_id="p", collection_name="rep")
    assert docs == ["x"] and doc_ids == ["doc"]
    assert vdb.count_filtered_exact(project_id="p", collection_name="rep") == 3


def test_health_reports_and_repairs_missing_index(vector_store):
    from app.services.rag.vector_store.engine import write_tx
    from app.services.rag.vector_store.health import repair_vector_indexes, vector_store_status

    coll = _collection("h")
    _seed(coll, _vectors(10, 4))
    assert vector_store_status(["h"])["healthy"] is True
    with write_tx() as conn:
        info = coll.info_for_read(conn)
        conn.execute(text(f"DROP INDEX ragvec.{info.table}_hnsw"))
    status = vector_store_status(["h"])
    assert status["healthy"] is False and status["collections"][0]["status"] == "index_missing"
    assert repair_vector_indexes(["h"])["collections_repaired"] == 1
    assert vector_store_status(["h"])["healthy"] is True
