"""Answer-grounded Sources: cited passages win; hardened heuristics for multi-site projects."""
import uuid

from app.routes.rag import _chat_sources_for_response
from app.services.search_sources import build_search_sources_from_contexts
from app.services.source_display_policy import (
    chunk_passes_source_relevance,
    contexts_loosely_ground_answer,
    should_omit_sources_for_answer,
)

NITSANTECH_META = {
    "url": "https://www.nitsantech.de/en/about",
    "title": "About NITSAN",
    "source_type": "crawl",
    "source_file": "crawl_source_nt.html",
    "crawl_source_id": "nt",
}
NITSAN_AI_META = {
    "url": "https://nitsan.ai/",
    "title": "NITSAN AI",
    "source_type": "crawl",
    "source_file": "crawl_source_ai.html",
    "crawl_source_id": "ai",
}
CONTEXTS = [
    "NITSAN is a TYPO3 agency with business offices in Germany and India.",
    "NITSAN AI builds RAGSuite, a retrieval augmented generation platform.",
]
METAS = [NITSANTECH_META, NITSAN_AI_META]
ANSWER = "RAGSuite is NITSAN AI's retrieval augmented generation platform."


def test_chat_cited_passages_select_exact_sources(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    out = _chat_sources_for_response(
        ANSWER, CONTEXTS, METAS, None,
        answer_refined_for_policy=ANSWER,
        user_query_for_overlap="What is RAGSuite AI?",
        live_item_ids={"nt", "ai"},
        cited_metadatas=[NITSAN_AI_META],
    )
    assert out == [{"title": "NITSAN AI", "url": "https://nitsan.ai/"}]


def test_chat_cited_none_hides_sources(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    out = _chat_sources_for_response(
        ANSWER, CONTEXTS, METAS, None,
        answer_refined_for_policy=ANSWER,
        user_query_for_overlap="What is NITSAN?",
        cited_metadatas=[],
    )
    assert out is None


def test_chat_cited_pdf_uses_document_content_url():
    doc_id = str(uuid.uuid4())
    pdf_meta = {
        "url": "",
        "title": "Handbook.pdf",
        "source_file": f"{doc_id}_Handbook.pdf",
        "document_id": doc_id,
    }
    out = _chat_sources_for_response(
        "The handbook lists 30 vacation days.", ["vacation text"], [pdf_meta], None,
        cited_metadatas=[pdf_meta],
    )
    assert out == [{"title": "Handbook.pdf", "url": f"/api/v1/documents/{doc_id}/content"}]


def test_chat_cited_still_respects_refusal_policy():
    out = _chat_sources_for_response(
        "This is out of the context of the provided documents.", CONTEXTS, METAS, None,
        cited_metadatas=[NITSAN_AI_META],
    )
    assert out is None


def test_chat_cited_falls_back_when_live_ids_stale():
    out = _chat_sources_for_response(
        ANSWER, CONTEXTS, METAS, None,
        live_item_ids={"other"},
        cited_metadatas=[NITSAN_AI_META],
    )
    assert out == [{"title": "NITSAN AI", "url": "https://nitsan.ai/"}]


def test_search_cited_parity(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "90")
    sources = build_search_sources_from_contexts(
        CONTEXTS, METAS, [20, 95], top_k=5,
        answer=ANSWER, user_query="What is RAGSuite AI?",
        cited_metadatas=[NITSAN_AI_META],
    )
    assert [s["url"] for s in sources] == ["https://nitsan.ai/"]
    assert build_search_sources_from_contexts(
        CONTEXTS, METAS, [95, 95], top_k=5, answer=ANSWER, user_query="x", cited_metadatas=[]
    ) == []


def test_generic_anchor_does_not_qualify_other_site(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "1")
    query = "What is the business name of T3Planet as described on the website?"
    assert not chunk_passes_source_relevance(CONTEXTS[0], NITSANTECH_META, user_query=query)
    t3_meta = {"url": "https://t3planet.de/en", "title": "T3Planet"}
    assert chunk_passes_source_relevance("T3Planet marketplace", t3_meta, user_query=query)


def test_generic_only_query_keeps_generic_anchors(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "1")
    assert chunk_passes_source_relevance(
        "Our services include hosting.", {"url": "https://x.de"}, user_query="what services?"
    )


def test_long_answer_opening_with_refusal_omits_sources():
    answer = (
        "I don't have enough information to state the business name of Mohn. "
        + "The documents describe printing, catalogues and media production in detail. " * 6
    )
    assert len(answer) > 320
    assert should_omit_sources_for_answer(answer)


def test_long_hedged_substantive_answer_keeps_sources():
    answer = (
        "T3Planet offers TYPO3 templates and extensions. "
        + "Pricing is transparent and support is included; some details are not mentioned in the docs. " * 5
    )
    assert not should_omit_sources_for_answer(answer)


def test_loose_grounding_needs_two_shared_tokens():
    metas = [{"url": "https://nitsantech.de"}]
    assert not contexts_loosely_ground_answer(
        "Mohn information about printing presses", ["NITSAN information pages"], metas
    )
    assert contexts_loosely_ground_answer(
        "NITSAN builds TYPO3 websites", ["NITSAN builds TYPO3 projects"], metas
    )


MOHN_DE_META = {
    "url": "https://www.mohn-gmbh.com/produkte/hygieneschleusen.html",
    "title": "Hygieneschleusen",
    "source_type": "crawl",
    "language": "de",
}
MOHN_EN_META = {
    "url": "https://www.mohn-gmbh.com/en/products/hygiene-stations.html",
    "title": "Hygiene stations",
    "source_type": "crawl",
    "language": "en",
}
OTHER_EN_META = {"url": "https://example.org/hygiene", "title": "Other vendor", "source_type": "crawl", "language": "en"}
HYGIENE_ANSWER = "Mohn bietet Hygieneschleusen mit Handdesinfektion an."


def test_chat_cited_hides_same_site_other_language_twin():
    out = _chat_sources_for_response(
        HYGIENE_ANSWER, ["", "", ""], [MOHN_EN_META, MOHN_DE_META, OTHER_EN_META],
        {"query_language": "de"},
        answer_refined_for_policy=HYGIENE_ANSWER,
        cited_metadatas=[MOHN_EN_META, MOHN_DE_META, OTHER_EN_META],
    )
    assert [s["url"] for s in out] == [MOHN_DE_META["url"], OTHER_EN_META["url"]]


def test_chat_cited_without_query_language_is_unchanged():
    out = _chat_sources_for_response(
        HYGIENE_ANSWER, ["", ""], [MOHN_EN_META, MOHN_DE_META], None,
        answer_refined_for_policy=HYGIENE_ANSWER,
        cited_metadatas=[MOHN_EN_META, MOHN_DE_META],
    )
    assert [s["url"] for s in out] == [MOHN_EN_META["url"], MOHN_DE_META["url"]]


def test_chat_cited_english_only_site_kept_for_german_question():
    out = _chat_sources_for_response(
        HYGIENE_ANSWER, [""], [OTHER_EN_META], {"query_language": "de"},
        answer_refined_for_policy=HYGIENE_ANSWER,
        cited_metadatas=[OTHER_EN_META],
    )
    assert [s["url"] for s in out] == [OTHER_EN_META["url"]]


def test_search_cited_hides_same_site_other_language_twin():
    sources = build_search_sources_from_contexts(
        ["", ""], [MOHN_EN_META, MOHN_DE_META], None,
        top_k=5, answer=HYGIENE_ANSWER,
        cited_metadatas=[MOHN_EN_META, MOHN_DE_META],
        preferred_language="de",
    )
    assert [s["url"] for s in sources] == [MOHN_DE_META["url"]]


def test_search_heuristic_prefers_query_language(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    contexts = [
        "Mohn hygiene stations with hand disinfection.",
        "Mohn Hygieneschleusen mit Handdesinfektion.",
    ]
    sources = build_search_sources_from_contexts(
        contexts, [MOHN_EN_META, MOHN_DE_META], [90, 85],
        top_k=5, answer=HYGIENE_ANSWER, user_query="Mohn Hygieneschleusen",
        preferred_language="de",
    )
    assert [s["url"] for s in sources] == [MOHN_DE_META["url"]]
