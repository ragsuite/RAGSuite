"""Hard source scope: one distinctly named source limits every retrieval list."""
import uuid
from unittest.mock import MagicMock

import pytest

from app.services.rag import hard_scope
from app.services.rag import lexical_schema
from app.services.rag import rag as rag_module
from app.services.rag import source_routing as sr
from app.services.rag.query_processing import process_query
from app.services.rag.rag import VectorDB, EmbedData, Retriever

PROJECT = str(uuid.uuid4())
SHOP = "11111111-1111-1111-1111-111111111111"
SHOP_DE = "22222222-2222-2222-2222-222222222222"
OILS = "33333333-3333-3333-3333-333333333333"
ELECTRO = "44444444-4444-4444-4444-444444444444"
PDF = "55555555-5555-5555-5555-555555555555"
QUERY_VEC = [1.0, 0.0, 0.0]


def _registry():
    return sr.build_registry(
        [
            (SHOP, "Shop EN", "https://bigshopper.example/"),
            (SHOP_DE, "Shop DE", "https://bigshopper.example/de/"),
            (OILS, "Lubro Oils", "https://lubro.example/"),
            (ELECTRO, "Electronics Catalogue", "https://zappit.example/"),
        ],
        [(PDF, "Annual-Sustainability-Report-2025.pdf")],
    )


@pytest.fixture(autouse=True)
def _fake_registry(monkeypatch):
    sr.invalidate()
    monkeypatch.setattr(sr, "_load_registry", lambda _uuid: _registry())
    monkeypatch.delenv("RAG_SOURCE_HARD_FILTER", raising=False)
    monkeypatch.delenv("RAG_SOURCE_ROUTING_ENABLED", raising=False)
    rag_module._collection_size_cache.clear()
    yield
    sr.invalidate()
    rag_module._collection_size_cache.clear()


def _scope(query):
    return hard_scope.hard_scope_ids(PROJECT, query, sr.match_source_ids(PROJECT, query))


class TestHardScopeIds:
    def test_host_name_is_hard(self):
        assert _scope("What does Lubro sell?") == [OILS]

    def test_same_host_sources_count_as_one(self):
        assert sorted(_scope("bigshopper return policy")) == sorted([SHOP, SHOP_DE])

    def test_document_title_is_hard(self):
        assert _scope("what is in the annual sustainability report") == [PDF]

    def test_name_only_match_stays_soft(self):
        # "electronics" comes from a source *name*, which is not distinctive.
        assert sr.match_source_ids(PROJECT, "best electronics deals") == [ELECTRO]
        assert _scope("best electronics deals") == []

    def test_two_sources_stay_soft(self):
        assert _scope("compare lubro and zappit") == []

    def test_disabled_by_env(self, monkeypatch):
        monkeypatch.setenv("RAG_SOURCE_HARD_FILTER", "0")
        assert _scope("What does Lubro sell?") == []

    def test_invalid_project(self):
        assert hard_scope.hard_scope_ids("not-a-uuid", "lubro", [OILS]) == []

    def test_filter_ranked(self):
        lists = (
            ["a", "b", "c"],
            ["1", "2", "3"],
            [{"document_id": OILS}, {"document_id": "x"}, {"source_file": f"crawl_source_{OILS}"}],
            [0.1, 0.2, 0.3],
        )
        docs, ids, metas, dists = hard_scope.filter_ranked(lists, {OILS})
        assert docs == ["a", "c"] and ids == ["1", "3"] and dists == [0.1, 0.3]


def test_lexical_search_sql_source_clause():
    sql = str(lexical_schema.search_sql("AND project_id = :project_id", lexical_schema.SOURCE_CLAUSE))
    assert "document_id IN" in sql and "source_file IN" in sql
    assert "document_id IN" not in str(lexical_schema.search_sql(""))


def _retriever(collection_count):
    vdb = MagicMock(spec=VectorDB)
    coll = MagicMock()
    coll.count.return_value = collection_count
    vdb.get_collection.return_value = coll
    embedder = MagicMock(spec=EmbedData)
    embedder.embed_model = MagicMock()
    embedder.embed_model.get_text_embedding.return_value = QUERY_VEC
    return Retriever(vdb=vdb, embedder=embedder, default_top_k=5), vdb, coll


def test_retrieve_hard_scope_uses_scoped_list_and_drops_other_sources(monkeypatch):
    retriever, vdb, _coll = _retriever(30000)
    oil_doc = "Lubro engine oil 5W-30."
    scoped_calls = []

    def _scoped(_vdb, _vec, source_ids, **_kw):
        scoped_calls.append(source_ids)
        return (
            [oil_doc, "Leaked other source"],
            ["o1", "x1"],
            [{"document_id": OILS, "url": "https://lubro.example/a"}, {"document_id": "zzz"}],
            [0.2, 0.1],
        )

    searched = {}

    def _search(*_a, **kw):
        searched.update(kw)
        return []

    monkeypatch.setattr(rag_module.scoped_query, "query_routed_sources", _scoped)
    monkeypatch.setattr(rag_module.lexical_index, "has_rows", lambda _c: True)
    monkeypatch.setattr(rag_module.lexical_index, "search", _search)

    docs, _ids, metas, _dists, meta = retriever.retrieve(
        "What engine oil does Lubro sell?", project_id=PROJECT, collection_name="c_hard"
    )

    vdb.query.assert_not_called()  # unscoped semantic query skipped
    assert scoped_calls == [[OILS]]
    assert docs == [oil_doc]
    assert all(sr.chunk_belongs_to(m, {OILS}) for m in metas)
    assert meta["hard_source_ids"] == [OILS]
    assert searched.get("source_ids") == [OILS]


def test_retrieve_hard_scope_falls_back_to_filtered_unscoped(monkeypatch):
    retriever, vdb, _coll = _retriever(30000)

    def _boom(*_a, **_k):
        raise RuntimeError("chroma filter error")

    vdb.query.return_value = (
        ["other site", "Lubro gear oil"],
        ["x", "o"],
        [{"document_id": "zzz"}, {"source_file": f"crawl_source_{OILS}"}],
        [0.1, 0.2],
    )
    monkeypatch.setattr(rag_module.scoped_query, "query_routed_sources", _boom)
    monkeypatch.setattr(rag_module.lexical_index, "has_rows", lambda _c: False)

    docs, *_rest, meta = retriever.retrieve("Lubro gear oil", project_id=PROJECT, collection_name="c_fb")
    assert docs == ["Lubro gear oil"]
    assert meta["hard_source_ids"] == [OILS]


def test_retrieve_scan_keyword_scoped(monkeypatch):
    retriever, vdb, coll = _retriever(100)
    monkeypatch.setattr(
        rag_module.scoped_query,
        "query_routed_sources",
        lambda *_a, **_k: (["Lubro oil"], ["o"], [{"document_id": OILS}], [0.2]),
    )
    coll.get.return_value = {"ids": [], "documents": [], "metadatas": []}
    retriever.retrieve("Lubro oil viscosity", project_id=PROJECT, collection_name="c_scan")
    where = coll.get.call_args.kwargs["where"]
    assert "$and" in where
    assert any("document_id" in str(c) or "source_file" in str(c) for c in where["$and"])


def test_soft_routing_unchanged_when_not_hard(monkeypatch):
    retriever, vdb, _coll = _retriever(30000)
    vdb.query.return_value = (["Zappit TV"], ["z"], [{"document_id": "other"}], [0.1])
    monkeypatch.setattr(
        rag_module.scoped_query, "query_routed_sources", lambda *_a, **_k: ([], [], [], [])
    )
    monkeypatch.setattr(rag_module.lexical_index, "has_rows", lambda _c: False)
    docs, *_rest, meta = retriever.retrieve("best electronics deals", project_id=PROJECT, collection_name="c_soft")
    vdb.query.assert_called_once()
    assert docs == ["Zappit TV"]
    assert meta["hard_source_ids"] == []


def test_constraint_boost_and_rerank_meta(monkeypatch):
    retriever, vdb, _coll = _retriever(30000)
    vdb.query.return_value = (
        ["Laptop X ₹89,990", "Laptop Y ₹45,990", "Laptop Z info"],
        ["a", "b", "c"],
        [{"document_id": "d", "url": f"https://s.example/{i}"} for i in range(3)],
        [0.10, 0.12, 0.14],
    )
    monkeypatch.setattr(rag_module.lexical_index, "has_rows", lambda _c: False)
    pq = process_query("laptops under ₹50,000")
    docs, *_rest, meta = retriever.retrieve(
        pq.retrieval_query, project_id=PROJECT, collection_name="c_boost", processed_query=pq, use_reranker=False
    )
    assert docs[0] == "Laptop Y ₹45,990"
    assert meta["constraint_boost"]["applied"] is True
    assert meta["rerank_decision"] == {"value": False, "reason": "disabled"}
