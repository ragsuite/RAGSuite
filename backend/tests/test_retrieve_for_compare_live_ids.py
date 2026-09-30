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
        "Geschäftszeichen AZ00001 Standortsuche Agency revision document content.",
        "Duplicate Agency chunk about Standortsuche and ObjektID 829393.",
    ]
    metas = [
        {
            "title": "Incentives and guidelines policy for Registration of Homestay",
            "url": "https://gujarattourism.com/content/dam/policy.pdf",
            "crawl_source_id": live_id,
        },
        {
            "title": "Geschäftszeichen: AZ00001/9-2/2-2020#2",
            "url": "https://example-agency.de/fileadmin/user_upload/x.pdf",
            "crawl_source_id": deleted_id,
        },
        {
            "title": "Geschäftszeichen: AZ00001/9-2/2-2020#2",
            "url": "https://example-agency.de/fileadmin/user_upload/x.pdf",
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


def _compare_rag_with(contexts, metas):
    from app.services.rag.rag import RAG

    rag = RAG.__new__(RAG)
    rag._is_sensitive_query = lambda _q: False
    rag._redact_sensitive_text = lambda t: t
    rag._build_prompt = lambda *a, **k: "prompt"
    rag.retriever = SimpleNamespace(
        retrieve=MagicMock(
            return_value=(
                contexts,
                [str(i) for i in range(len(contexts))],
                metas,
                [0.1 + 0.01 * i for i in range(len(contexts))],
                {},
            )
        ),
        _extract_keywords=lambda q: ["ragsuite"],
    )
    return rag


def test_retrieve_for_compare_keeps_crawl_chunks_with_page_document_id():
    """Crawler chunks carry a per-page document_id; the live crawl source id must still match."""
    live_source = "cccccccc-cccc-cccc-cccc-cccccccccccc"
    rag = _compare_rag_with(
        [
            "RAGSuite is a retrieval augmented generation platform.",
            "RAGSuite pricing and plans for teams.",
        ],
        [
            {
                "url": "https://ragsuite.de/",
                "document_id": "page-1111",
                "crawl_source_id": live_source,
                "source_file": f"crawl_source_{live_source}",
            },
            {
                "url": "https://ragsuite.de/pricing",
                "document_id": "page-2222",
                "source_file": f"crawl_source_{live_source}",
            },
        ],
    )

    out = rag.retrieve_for_compare("what is ragsuite?", top_k=5, live_item_ids={live_source})

    assert out.get("error") is None
    urls = {m["url"] for m in out.get("raw_contexts_metadatas") or []}
    assert urls == {"https://ragsuite.de/", "https://ragsuite.de/pricing"}


def test_retrieve_for_compare_drops_page_chunks_of_deleted_crawl_source():
    deleted_source = "dddddddd-dddd-dddd-dddd-dddddddddddd"
    rag = _compare_rag_with(
        ["RAGSuite old crawl content."],
        [
            {
                "url": "https://old.example/",
                "document_id": "page-3333",
                "crawl_source_id": deleted_source,
                "source_file": f"crawl_source_{deleted_source}",
            }
        ],
    )

    out = rag.retrieve_for_compare(
        "what is ragsuite?", top_k=5, live_item_ids={"some-other-live-id"}
    )

    assert out.get("error") == "no_contexts"
