"""Compare retrieval must drop chunks whose document/crawl source was deleted."""
from types import SimpleNamespace
from unittest.mock import MagicMock


def test_retrieve_for_compare_filters_deleted_crawl_source():
    from app.services.rag.rag import RAG

    rag = RAG.__new__(RAG)
    rag._is_sensitive_query = lambda _q: False
    rag._redact_sensitive_text = lambda t: t
    rag._build_prompt = lambda *a, **k: "prompt"

    live_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    deleted_id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    contexts = [
        "Homestay registration incentives and guidelines for Gujarat Tourism.",
        "Geschäftszeichen SG02103 Standortsuche BGE revision document content.",
        "Duplicate BGE chunk about Standortsuche and ObjektID 829393.",
    ]
    metas = [
        {
            "title": "Incentives and guidelines policy for Registration of Homestay",
            "url": "https://gujarattourism.com/content/dam/policy.pdf",
            "crawl_source_id": live_id,
        },
        {
            "title": "Geschäftszeichen: SG02103/9-2/2-2020#2",
            "url": "https://bge.de/fileadmin/user_upload/x.pdf",
            "crawl_source_id": deleted_id,
        },
        {
            "title": "Geschäftszeichen: SG02103/9-2/2-2020#2",
            "url": "https://bge.de/fileadmin/user_upload/x.pdf",
            "crawl_source_id": deleted_id,
        },
    ]
    distances = [0.1, 0.15, 0.16]

    rag.retriever = SimpleNamespace(
        retrieve=MagicMock(
            return_value=(contexts, ["id1", "id2", "id3"], metas, distances, {"ok": True})
        ),
        _extract_keywords=lambda q: ["homestay", "gujarat", "tourism"],
    )

    out = rag.retrieve_for_compare(
        "homestay registration gujarat",
        top_k=5,
        live_item_ids={live_id},
    )

    assert out.get("error") is None
    raw = out.get("raw_contexts_metadatas") or []
    assert len(raw) == 1
    assert raw[0]["crawl_source_id"] == live_id
    assert "gujarattourism" in (raw[0].get("url") or "")


def test_retrieve_for_compare_no_live_filter_keeps_all():
    from app.services.rag.rag import RAG

    rag = RAG.__new__(RAG)
    rag._is_sensitive_query = lambda _q: False
    rag._redact_sensitive_text = lambda t: t
    rag._build_prompt = lambda *a, **k: "prompt"

    contexts = ["Chunk A about alpha topic.", "Chunk B about beta topic."]
    metas = [
        {"title": "A", "url": "https://a.example/x", "crawl_source_id": "src-a"},
        {"title": "B", "url": "https://b.example/y", "crawl_source_id": "src-b"},
    ]
    rag.retriever = SimpleNamespace(
        retrieve=MagicMock(
            return_value=(contexts, ["1", "2"], metas, [0.1, 0.2], {})
        ),
        _extract_keywords=lambda q: ["alpha", "beta"],
    )

    out = rag.retrieve_for_compare("alpha beta", top_k=5, live_item_ids=None)
    assert len(out.get("raw_contexts_metadatas") or []) == 2
