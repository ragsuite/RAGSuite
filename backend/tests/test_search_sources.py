"""Tests for search source card assembly."""
import os

from app.services.search_sources import build_search_sources_from_contexts
from app.services.source_display_titles import clean_doc_title


def test_build_search_sources_respects_top_k():
    contexts = [
        "Alpha document discusses widgets in detail.",
        "Beta document discusses gadgets in detail.",
        "Gamma document discusses tools in detail.",
    ]
    metadatas = [
        {"title": "Alpha.pdf", "url": "https://example.com/a", "document_id": "doc-a"},
        {"title": "Beta.pdf", "url": "https://example.com/b", "document_id": "doc-b"},
        {"title": "Gamma.pdf", "url": "https://example.com/c", "document_id": "doc-c"},
    ]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [80, 75, 70],
        top_k=2,
        answer="Alpha widgets and Beta gadgets are discussed in the documentation.",
        user_query="widgets gadgets",
        live_item_ids={"doc-a", "doc-b", "doc-c"},
    )
    assert len(sources) == 2
    assert sources[0]["title"] == "Alpha"
    assert sources[0]["url"] == "https://example.com/a"


def test_build_search_sources_empty_contexts():
    assert build_search_sources_from_contexts([], [], None, top_k=5) == []


def test_build_search_sources_omits_on_out_of_context_answer():
    sources = build_search_sources_from_contexts(
        ["Some context about widgets."],
        [{"title": "Doc", "url": "https://example.com/x"}],
        [90],
        top_k=5,
        answer="This is out of the context of the provided documents.",
        user_query="widgets",
    )
    assert sources == []


def test_build_search_sources_no_repeat_to_fill(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    contexts = ["Only one relevant chunk about pricing."]
    metadatas = [{"title": "Pricing.pdf", "url": "https://example.com/p"}]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [80],
        top_k=5,
        answer="Pricing details are explained in the documentation.",
        user_query="pricing",
    )
    assert len(sources) == 1


def test_build_search_sources_strips_uuid_prefix_from_title():
    uuid_prefix = "4b65a349-236c-4152-978b-6d6c49f16e99"
    contexts = ["BMW M5 engine and tyre options are listed in the brochure."]
    metadatas = [
        {
            "title": f"{uuid_prefix}_BMW M5 2023 UK.pdf",
            "url": "https://example.com/bmw",
            "source_file": f"/data/{uuid_prefix}_BMW M5 2023 UK.pdf",
            "document_id": "doc-bmw",
        },
    ]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [90],
        top_k=5,
        answer="The BMW M5 brochure lists engine and tyre options.",
        user_query="BMW M5",
        live_item_ids={"doc-bmw"},
    )
    assert len(sources) == 1
    assert sources[0]["title"] == "BMW M5 2023 UK"


def test_clean_doc_title_strips_spaced_uuid_prefix():
    raw = "4b65a349 236c 4152 978b 6d6c49f16e99 BMW M5 2023 UK"
    assert clean_doc_title(raw) == "BMW M5 2023 UK"


def test_build_search_sources_pdf_uses_document_content_url():
    doc_uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    contexts = ["BMW M5 engine and tyre options are listed in the brochure."]
    metadatas = [
        {
            "title": "BMW M5 2023 UK.pdf",
            "url": "file://bmw.pdf",
            "source_file": f"{doc_uuid}_BMW M5 2023 UK.pdf",
            "document_id": doc_uuid,
        },
    ]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [90],
        top_k=5,
        answer="The BMW M5 brochure lists engine and tyre options.",
        user_query="BMW M5",
        live_item_ids={doc_uuid},
    )
    assert len(sources) == 1
    assert sources[0]["title"] == "BMW M5 2023 UK"
    assert sources[0]["url"] == f"/api/v1/documents/{doc_uuid}/content"
    assert sources[0]["snippet"] == ""


def test_build_search_sources_omits_on_custom_no_info_answer():
    custom_msg = (
        "I couldn't find this information in the available knowledge base. "
        "Please contact the RagSuite team for further assistance."
    )
    sources = build_search_sources_from_contexts(
        ["Some context about unrelated books."],
        [{"title": "Book.pdf", "url": "https://example.com/book", "document_id": "doc-1"}],
        [90],
        top_k=5,
        answer=custom_msg,
        user_query="quantum physics pricing",
        live_item_ids={"doc-1"},
    )
    assert sources == []


def test_build_search_sources_omits_when_answer_matches_prompt_fallback():
    system_prompt = (
        "Only when no relevant information is found, respond with:\n"
        "'I could not find this information in the available knowledge base.'"
    )
    answer = "I could not find this information in the available knowledge base."
    sources = build_search_sources_from_contexts(
        ["Chunk about literature."],
        [{"title": "Book.pdf", "url": "https://example.com/book", "document_id": "doc-1"}],
        [88],
        top_k=5,
        answer=answer,
        user_query="unrelated topic",
        live_item_ids={"doc-1"},
        system_prompt=system_prompt,
    )
    assert sources == []


def test_build_search_sources_keeps_sources_for_normal_answer(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    sources = build_search_sources_from_contexts(
        ["BMW M5 engine specs and power output are listed here."],
        [{"title": "BMW.pdf", "url": "https://example.com/bmw", "document_id": "doc-bmw"}],
        [90],
        top_k=5,
        answer="The BMW M5 engine produces 625hp according to the brochure.",
        user_query="BMW M5 engine",
        live_item_ids={"doc-bmw"},
    )
    assert len(sources) == 1


def test_build_search_sources_dedupes_same_pdf_multiple_chunks(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    doc_uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    contexts = [
        "M5 COMPETITION THE FEATURED MODEL engine specs and power output.",
        "Aluminium Carbon structure M seat belts Seat heating interior features.",
        "Optional packages ULTIMATE PACK BMW luxury features listed here.",
    ]
    metadatas = [
        {
            "title": "BMW-M5-2023-UK.pdf",
            "url": "file://bmw.pdf",
            "source_file": f"{doc_uuid}_BMW-M5-2023-UK.pdf",
            "document_id": doc_uuid,
        },
        {
            "title": "BMW-M5-2023-UK.pdf",
            "url": "file://bmw.pdf",
            "source_file": f"{doc_uuid}_BMW-M5-2023-UK.pdf",
            "document_id": doc_uuid,
        },
        {
            "title": "BMW-M5-2023-UK.pdf",
            "url": "file://bmw.pdf",
            "source_file": f"{doc_uuid}_BMW-M5-2023-UK.pdf",
            "document_id": doc_uuid,
        },
    ]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [90, 85, 80],
        top_k=5,
        answer="BMW M5 engine interior packages optional upgrades",
        user_query="BMW M5",
        live_item_ids={doc_uuid},
    )
    assert len(sources) == 1
    assert sources[0]["title"] == "BMW-M5-2023-UK"
    assert sources[0]["snippet"] == ""


def test_build_search_sources_dedupes_api_url_vs_https_fallback(monkeypatch):
    """Chunk with document_id + chunk with only https URL but same file UUID → one source."""
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    doc_uuid = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
    contexts = [
        "M5 COMPETITION engine specs from chunk one.",
        "M5 COMPETITION engine specs from chunk two.",
    ]
    metadatas = [
        {
            "title": "BMW-M5-2023-UK.pdf",
            "source_file": f"{doc_uuid}_BMW-M5-2023-UK.pdf",
            "document_id": doc_uuid,
        },
        {
            "title": "BMW-M5-2023-UK.pdf",
            "url": "https://cdn.example.com/bmw-m5-2023-uk.pdf",
            "source_file": f"{doc_uuid}_BMW-M5-2023-UK.pdf",
        },
    ]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [92, 90],
        top_k=5,
        answer="BMW M5 COMPETITION engine specs",
        user_query="BMW M5",
        live_item_ids={doc_uuid},
    )
    assert len(sources) == 1
    assert sources[0]["title"] == "BMW-M5-2023-UK"
    assert sources[0]["url"] == f"/api/v1/documents/{doc_uuid}/content"


def test_build_search_sources_dedupes_same_url_different_meta_url(monkeypatch):
    """Same PDF via document_id path and https fallback → one source (chat-style)."""
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    doc_uuid = "cccccccc-cccc-cccc-cccc-cccccccccccc"
    contexts = [
        "M5 COMPETITION engine specs and power output.",
        "M5 COMPETITION engine specs repeated in another chunk.",
    ]
    metadatas = [
        {
            "title": "BMW-M5-2023-UK.pdf",
            "url": "https://example.com/bmw.pdf",
            "source_file": f"{doc_uuid}_BMW-M5-2023-UK.pdf",
            "document_id": doc_uuid,
        },
        {
            "title": "BMW-M5-2023-UK.pdf",
            "url": "https://example.com/bmw.pdf",
            "source_file": f"{doc_uuid}_BMW-M5-2023-UK.pdf",
            "document_id": doc_uuid,
        },
    ]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [90, 88],
        top_k=5,
        answer="BMW M5 engine specs",
        user_query="BMW M5",
        live_item_ids={doc_uuid},
    )
    assert len(sources) == 1
    assert sources[0]["url"] == f"/api/v1/documents/{doc_uuid}/content"


def test_build_search_sources_does_not_merge_different_documents(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    contexts = [
        "Alpha document discusses widgets in detail.",
        "Beta document discusses gadgets in detail.",
    ]
    metadatas = [
        {"title": "Alpha.pdf", "url": "https://example.com/a", "document_id": "doc-a"},
        {"title": "Beta.pdf", "url": "https://example.com/b", "document_id": "doc-b"},
    ]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [90, 88],
        top_k=5,
        answer="Alpha widgets and Beta gadgets",
        user_query="widgets gadgets",
        live_item_ids={"doc-a", "doc-b"},
    )
    assert len(sources) == 2
    assert {s["title"] for s in sources} == {"Alpha", "Beta"}


def test_build_search_sources_does_not_convert_web_url_with_uuid_to_document_path(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    embedded_uuid = "275edf4c-516c-4b73-a18e-d3a99f9678fb"
    contexts = ["Release notes are available on the website."]
    metadatas = [
        {
            "title": "Release Notes",
            "url": f"https://docs.example.com/releases/{embedded_uuid}",
            "source_file": "crawl_page.html",
        }
    ]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [91],
        top_k=5,
        answer="Release notes are on the docs site.",
        user_query="release notes",
    )
    assert len(sources) == 1
    assert sources[0]["url"] == f"https://docs.example.com/releases/{embedded_uuid}"


def test_build_search_sources_crawl_source_uuid_not_treated_as_uploaded_document(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    crawl_source_uuid = "275edf4c-516c-4b73-a18e-d3a99f9678fb"
    contexts = ["Trial license details from website docs."]
    metadatas = [
        {
            "title": "Extending Trial License",
            "url": "https://docs.t3planet.de/en/latest/License/ExtendTrial/Index.html#demo",
            "source_type": "crawl",
            "source_file": f"crawl_source_{crawl_source_uuid}",
            "document_id": crawl_source_uuid,
        }
    ]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [91],
        top_k=5,
        answer="Trial license details from docs site.",
        user_query="trial license",
        live_item_ids={crawl_source_uuid},
    )
    assert len(sources) == 1
    assert (
        sources[0]["url"]
        == "https://docs.t3planet.de/en/latest/License/ExtendTrial/Index.html#demo"
    )


def test_build_search_sources_dedupes_same_page_different_anchor_fragments(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    crawl_source_uuid = "275edf4c-516c-4b73-a18e-d3a99f9678fb"
    contexts = [
        "Help and support documentation section one.",
        "Help and support documentation section two.",
    ]
    metadatas = [
        {
            "title": "Help & Support",
            "url": "https://docs.t3planet.de/en/latest/Help/Index.html#faq",
            "source_type": "crawl",
            "source_file": f"crawl_source_{crawl_source_uuid}",
            "document_id": crawl_source_uuid,
        },
        {
            "title": "Help & Support",
            "url": "https://docs.t3planet.de/en/latest/Help/Index.html#contact",
            "source_type": "crawl",
            "source_file": f"crawl_source_{crawl_source_uuid}",
            "document_id": crawl_source_uuid,
        },
    ]
    sources = build_search_sources_from_contexts(
        contexts,
        metadatas,
        [93, 90],
        top_k=5,
        answer="Help and support docs include FAQ and contact sections.",
        user_query="help support docs",
        live_item_ids={crawl_source_uuid},
    )
    assert len(sources) == 1
    assert sources[0]["url"] == "https://docs.t3planet.de/en/latest/Help/Index.html#faq"
