"""Large-collection retrieval: full-text index keyword branch, off mode, and source routing."""
from unittest.mock import MagicMock

import pytest

from app.services.rag import rag as rag_module
from app.services.rag.rag import ChromaVDB, EmbedData, Retriever

QUERY_VEC = [1.0, 0.0, 0.0]


@pytest.fixture(autouse=True)
def _clear_size_cache():
    rag_module._collection_size_cache.clear()
    yield
    rag_module._collection_size_cache.clear()


def _retriever(collection_count):
    vdb = MagicMock(spec=ChromaVDB)
    coll = MagicMock()
    coll.count.return_value = collection_count
    vdb.get_collection.return_value = coll
    embedder = MagicMock(spec=EmbedData)
    embedder.embed_model = MagicMock()
    embedder.embed_model.get_text_embedding.return_value = QUERY_VEC
    return Retriever(vdb=vdb, embedder=embedder, default_top_k=5), vdb, coll


def _semantic():
    docs = [f"Big site page {i} about TYPO3 hosting." for i in range(5)]
    metas = [{"document_id": "big", "url": f"https://big.de/{i}", "title": f"Big {i}"} for i in range(5)]
    return docs, [f"b{i}" for i in range(5)], metas, [0.10, 0.11, 0.12, 0.13, 0.14]


def test_large_collection_uses_full_text_index(monkeypatch):
    retriever, vdb, coll = _retriever(30000)
    vdb.query.return_value = _semantic()
    monkeypatch.setattr(rag_module.lexical_index, "has_rows", lambda _c: True)
    monkeypatch.setattr(rag_module.lexical_index, "search", lambda *_a, **_k: [("kw1", 0.9)])
    monkeypatch.setattr(rag_module.source_routing, "match_source_ids", lambda *_a: [])
    coll.get.return_value = {
        "ids": ["kw1"],
        "documents": ["Mohn Media refund policy for print catalogues."],
        "metadatas": [{"document_id": "mohn", "url": "https://mohn.de/refund", "title": "Refund policy"}],
        "embeddings": [[0.95, 0.05, 0.0]],
    }

    docs, _ids, metas, dists, meta = retriever.retrieve(
        "mohn refund policy", project_id="p", collection_name="coll_large"
    )

    assert meta["keyword_mode"] == "index"
    assert coll.get.call_args.kwargs["ids"] == ["kw1"]
    assert "Mohn Media refund policy for print catalogues." in docs
    kw_pos = docs.index("Mohn Media refund policy for print catalogues.")
    assert dists[kw_pos] < 0.02  # true cosine, not a keyword pseudo-distance


def test_large_collection_without_index_skips_keyword_scan(monkeypatch):
    retriever, vdb, coll = _retriever(30000)
    vdb.query.return_value = _semantic()
    monkeypatch.setattr(rag_module.lexical_index, "has_rows", lambda _c: False)
    search = MagicMock()
    monkeypatch.setattr(rag_module.lexical_index, "search", search)
    monkeypatch.setattr(rag_module.source_routing, "match_source_ids", lambda *_a: [])

    docs, *_rest, meta = retriever.retrieve("typo3 hosting", project_id="p", collection_name="coll_noidx")

    assert meta["keyword_mode"] == "off"
    coll.get.assert_not_called()
    search.assert_not_called()
    assert docs[0] == "Big site page 0 about TYPO3 hosting."


def test_named_small_source_is_ranked_first(monkeypatch):
    retriever, vdb, coll = _retriever(30000)
    small_doc = "NITSAN AI builds RAGSuite."

    def _scoped(_vdb, _vec, source_ids, **_kwargs):
        assert source_ids == ["small"]
        return [small_doc], ["s1"], [{"document_id": "small", "url": "https://nitsan.ai/"}], [0.30]

    vdb.query.return_value = _semantic()
    monkeypatch.setattr(rag_module.scoped_query, "query_routed_sources", _scoped)
    monkeypatch.setattr(rag_module.lexical_index, "has_rows", lambda _c: False)
    monkeypatch.setattr(rag_module.source_routing, "match_source_ids", lambda *_a: ["small"])

    docs, _ids, _metas, _dists, meta = retriever.retrieve(
        "What is NITSAN AI?", project_id="p", collection_name="coll_routed"
    )

    assert docs[0] == small_doc
    assert meta["routed_source_count"] == 1
    assert meta["confidence_score"] == 90  # best chunk, not the routed one


def test_slow_scoped_query_never_blocks_semantic(monkeypatch):
    import time

    retriever, vdb, _coll = _retriever(30000)
    vdb.query.return_value = _semantic()
    monkeypatch.setattr(rag_module, "SCOPED_QUERY_TIMEOUT_S", 0.05)
    monkeypatch.setattr(rag_module.lexical_index, "has_rows", lambda _c: False)
    monkeypatch.setattr(rag_module.source_routing, "match_source_ids", lambda *_a: ["small"])
    monkeypatch.setattr(
        rag_module.scoped_query, "query_routed_sources", lambda *_a, **_k: time.sleep(1) or ([], [], [], [])
    )
    started = time.perf_counter()
    docs, *_rest, meta = retriever.retrieve("What is NITSAN AI?", project_id="p", collection_name="coll_slow")
    assert time.perf_counter() - started < 0.9
    assert docs[0] == "Big site page 0 about TYPO3 hosting."
    assert meta["tier_used"] == 1


def _bilingual_semantic():
    docs = ["Hygiene stations by Mohn.", "Other vendor hygiene page.", "Hygieneschleusen von Mohn."]
    metas = [
        {"document_id": "en", "url": "https://www.mohn-gmbh.com/en/products/hygiene.html", "language": "en"},
        {"document_id": "ot", "url": "https://example.org/hygiene", "language": "en"},
        {"document_id": "de", "url": "https://www.mohn-gmbh.com/produkte/hygiene.html", "language": "de"},
    ]
    return docs, ["e1", "o1", "d1"], metas, [0.10, 0.11, 0.13]


@pytest.mark.parametrize(
    "query, preferred, expected_first, expected_lang",
    [
        ("Welche Hygieneschleusen bietet Mohn an?", None, "Hygieneschleusen von Mohn.", "de"),
        ("What hygiene stations does Mohn offer?", None, "Hygiene stations by Mohn.", "en"),
        ("Welche Hygieneschleusen bietet Mohn an?", "", "Hygiene stations by Mohn.", None),
    ],
)
def test_query_language_twin_ranked_first(monkeypatch, query, preferred, expected_first, expected_lang):
    retriever, vdb, _coll = _retriever(30000)
    vdb.query.return_value = _bilingual_semantic()
    monkeypatch.setattr(rag_module.lexical_index, "has_rows", lambda _c: False)
    monkeypatch.setattr(rag_module.source_routing, "match_source_ids", lambda *_a: [])

    docs, _ids, _metas, _dists, meta = retriever.retrieve(
        query, project_id="p", collection_name="coll_bi", preferred_language=preferred
    )

    assert docs[0] == expected_first
    assert docs[1] == "Other vendor hygiene page."  # other websites keep their slot
    assert len(docs) == 3
    assert meta["query_language"] == expected_lang
    assert meta["language_reordered"] is (expected_lang == "de")


def test_language_preference_never_changes_retrieved_set(monkeypatch):
    retriever, vdb, _coll = _retriever(30000)
    docs = ["Mohn Firmensitz Meinerzhagen.", "Mohn Impressum mit RAGSuite.", "Mohn headquarters page."]
    metas = [
        {"document_id": "d0", "url": "https://www.mohn-gmbh.com/kontakt.html", "language": "de"},
        {"document_id": "d1", "url": "https://www.mohn-gmbh.com/impressum.html", "language": "de"},
        {"document_id": "e0", "url": "https://www.mohn-gmbh.com/en/contact.html", "language": "en"},
    ]
    vdb.query.return_value = (docs, ["d0", "d1", "e0"], metas, [0.10, 0.11, 0.12])
    monkeypatch.setattr(rag_module.lexical_index, "has_rows", lambda _c: False)
    monkeypatch.setattr(rag_module.source_routing, "match_source_ids", lambda *_a: [])

    out, *_rest, meta = retriever.retrieve(
        "Where is Mohn headquartered?", top_k=2, project_id="p", collection_name="coll_k2"
    )

    assert out == docs[:2]
    assert meta["query_language"] == "en"
    assert meta["language_reordered"] is False


def test_routing_skipped_for_document_scoped_queries(monkeypatch):
    retriever, vdb, _coll = _retriever(10)
    vdb.query.return_value = _semantic()
    router = MagicMock(return_value=["small"])
    monkeypatch.setattr(rag_module.source_routing, "match_source_ids", router)
    retriever.retrieve("What is NITSAN AI?", project_id="p", document_id="doc-1", collection_name="c")
    router.assert_not_called()
