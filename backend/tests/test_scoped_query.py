"""Scoped retrieval inside named sources: local ranking for small sources, HNSW for large."""
from unittest.mock import MagicMock

import pytest

from app.services.rag import scoped_query as sq
from app.services.rag import source_routing as sr


@pytest.fixture(autouse=True)
def _no_registry(monkeypatch):
    sr.invalidate()
    monkeypatch.setattr(sr, "_load_registry", lambda _uuid: ({}, {}))
    yield
    sr.invalidate()


def _vdb(collection):
    vdb = MagicMock()
    vdb.get_collection.return_value = collection
    return vdb


def test_small_source_ranked_locally_without_filtered_hnsw():
    coll = MagicMock()
    coll.get.side_effect = [
        {"ids": ["a", "b"]},
        {
            "documents": ["far chunk", "close chunk"],
            "metadatas": [{"document_id": "pdf"}, {"document_id": "pdf"}],
            "embeddings": [[0.0, 1.0], [1.0, 0.1]],
        },
    ]
    docs, ids, _metas, dists = sq.query_routed_sources(
        _vdb(coll), [1.0, 0.0], ["pdf"], top_k=5, user_id=1, project_id=None, collection_name="c"
    )
    assert docs == ["close chunk", "far chunk"]
    assert ids == ["pdf", "pdf"]
    assert dists[0] < dists[1]
    coll.query.assert_not_called()
    where = coll.get.call_args_list[0].kwargs["where"]
    assert where["$and"][1] == {"user_id": 1}


def test_large_source_uses_filtered_vector_query(monkeypatch):
    monkeypatch.setenv("RAG_SCOPED_LOCAL_RANK_MAX", "2")
    coll = MagicMock()
    coll.get.return_value = {"ids": ["a", "b", "c"]}
    coll.query.return_value = {
        "documents": [["x"]], "metadatas": [[{"document_id": "big"}]], "distances": [[0.2]]
    }
    docs, ids, _metas, dists = sq.query_routed_sources(
        _vdb(coll), [1.0, 0.0], ["big"], top_k=5, user_id=None, project_id=None, collection_name="c"
    )
    assert (docs, ids, dists) == (["x"], ["big"], [0.2])
    coll.query.assert_called_once()


def test_no_matching_chunks_returns_empty():
    coll = MagicMock()
    coll.get.return_value = {"ids": []}
    assert sq.query_routed_sources(
        _vdb(coll), [1.0], ["none"], top_k=5, user_id=None, project_id=None, collection_name="c"
    ) == ([], [], [], [])
    assert sq.query_routed_sources(
        _vdb(coll), [1.0], [], top_k=5, user_id=None, project_id=None, collection_name="c"
    ) == ([], [], [], [])


def test_chroma_where_uses_registry_kinds(monkeypatch):
    import uuid

    project = str(uuid.uuid4())
    crawl_id, doc_id = "a" * 8 + "-0000-0000-0000-" + "0" * 12, "b" * 8 + "-0000-0000-0000-" + "0" * 12
    sr.invalidate()
    monkeypatch.setattr(
        sr, "_load_registry", lambda _uuid: ({}, {crawl_id: "mohn-gmbh.com", doc_id: f"doc:{doc_id}"})
    )
    assert sr.chroma_where([crawl_id], project_id=project) == {
        "source_file": {"$in": [f"crawl_source_{crawl_id}"]}
    }
    assert sr.chroma_where([doc_id], project_id=project) == {"document_id": {"$in": [doc_id]}}
    both = sr.chroma_where([crawl_id, doc_id], project_id=project)
    assert set(both) == {"$or"}
