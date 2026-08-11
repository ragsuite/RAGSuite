"""Unit tests for chat source suppression (OOC / LLM error / optional confidence floor)."""

import pytest

pytestmark = pytest.mark.usefixtures("_legacy_source_score_floors_off")


@pytest.fixture
def _legacy_source_score_floors_off(monkeypatch):
    """Unit tests opt in to score floors; keep floors off unless a test overrides."""
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")


from app.routes.rag import (
    RAG_OUT_OF_CONTEXT_MSG,
    RAG_OUT_OF_CONTEXT_PHRASE,
    RAG_OOC_SENTINEL,
    RAG_PRIVACY_BLOCK_MSG,
    _build_chat_sources_from_raw_contexts,
    _chat_sources_for_response,
    _chat_sources_suppressed_by_answer,
)


def test_suppressed_on_canonical_ooc_phrase():
    raw = f"Prefix. {RAG_OUT_OF_CONTEXT_MSG}"
    assert _chat_sources_suppressed_by_answer(raw) is True


def test_suppressed_on_phrase_only():
    assert _chat_sources_suppressed_by_answer(f"Some text {RAG_OUT_OF_CONTEXT_PHRASE} end") is True


def test_suppressed_on_llm_failed():
    assert _chat_sources_suppressed_by_answer("LLM failed to respond. Check server logs.") is True


def test_suppressed_on_generic_out_of_context_substring():
    assert _chat_sources_suppressed_by_answer("Sorry, that is out of the context.") is True


def test_not_suppressed_normal_answer():
    assert _chat_sources_suppressed_by_answer("Here is the answer based on the docs.") is False


def test_empty_string_not_treated_as_refusal_by_suppressed_helper():
    assert _chat_sources_suppressed_by_answer("") is False


def test_suppressed_on_ooc_sentinel():
    assert _chat_sources_suppressed_by_answer(f"Prefix {RAG_OOC_SENTINEL} suffix") is True


def test_suppressed_on_privacy_block_exact():
    assert _chat_sources_suppressed_by_answer(RAG_PRIVACY_BLOCK_MSG) is True


def test_suppressed_on_not_enough_information():
    assert _chat_sources_suppressed_by_answer("I don't have enough information.") is True


def test_suppressed_on_german_insufficient_info():
    assert _chat_sources_suppressed_by_answer(
        "Es tut mir leid, aber ich kann auf der Grundlage der verfügbaren "
        "Informationen keine Antwort geben."
    ) is True


def test_sources_none_when_not_enough_information(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    contexts = ["TYPO3 extension handbook chunk text."]
    metas = [
        {
            "url": "https://nitsantech.de/handbook",
            "title": "TYPO3 Testing and Quality Assurance Handbook",
            "source_file": "handbook.html",
        }
    ]
    answer = "I don't have enough information."
    out = _chat_sources_for_response(
        answer,
        contexts,
        metas,
        None,
        answer_refined_for_policy=answer,
    )
    assert out is None


def test_suppressed_when_answer_denies_document_coverage():
    finsense = (
        "The DOCUMENTS and CONVERSATION HISTORY do not mention FinSense. "
        "The term FinSense is not referenced in the provided materials."
    )
    assert _chat_sources_suppressed_by_answer(finsense) is True


def test_not_suppressed_when_docs_are_cited():
    assert _chat_sources_suppressed_by_answer(
        "FinSense is described in section 2 of the annual report."
    ) is False


def test_sources_none_when_answer_not_in_docs(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    contexts = ["German legal NER dataset chunk text from indexed PDF."]
    metas = [
        {
            "url": "file://legal.pdf",
            "title": "A Dataset of German Legal Documents for Named Enti.pdf",
            "source_file": "legal.pdf",
            "document_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        }
    ]
    answer = (
        "The DOCUMENTS do not mention FinSense. "
        "The term is not referenced in the provided materials."
    )
    out = _chat_sources_for_response(
        answer,
        contexts,
        metas,
        None,
        answer_refined_for_policy=answer,
    )
    assert out is None


def test_sources_none_when_empty_answer():
    contexts = ["chunk"]
    metas = [{"url": "https://example.com/a", "title": "A", "source_file": "a.html"}]
    assert _chat_sources_for_response("", contexts, metas, None) is None
    assert _chat_sources_for_response(None, contexts, metas, None, answer_refined_for_policy="") is None


def test_sources_when_raw_empty_but_refined_present():
    contexts = ["This paragraph contains the grounded answer from the knowledge base."]
    metas = [{"url": "https://example.com/a", "title": "A", "source_file": "a.html"}]
    out = _chat_sources_for_response(
        None,
        contexts,
        metas,
        None,
        answer_refined_for_policy="Here is the grounded answer.",
    )
    assert out == [{"title": "A", "url": "https://example.com/a"}]


def test_sources_none_when_suppressed():
    contexts = ["chunk about solar"]
    metas = [{"url": "https://example.com/a", "title": "A", "source_file": "a.html"}]
    out = _chat_sources_for_response(RAG_OUT_OF_CONTEXT_MSG, contexts, metas, {"confidence_score": 99})
    assert out is None


def test_sources_built_when_not_suppressed():
    contexts = ["Solar panels convert light to electricity using photovoltaic cells."]
    metas = [{"url": "https://example.com/a", "title": "A", "source_file": "a.html"}]
    out = _chat_sources_for_response(
        "Solar panels convert light to electricity.",
        contexts,
        metas,
        {"confidence_score": 80},
        user_query_for_overlap="what are solar panels",
    )
    assert out == [{"title": "A", "url": "https://example.com/a"}]


def test_pdf_source_uses_document_content_url():
    doc_uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    contexts = ["Answer section citing the Annual Report PDF with extracted text from pdf chunk."]
    metas = [
        {
            "url": "file://report.pdf",
            "title": "Annual Report",
            "source_file": f"{doc_uuid}_report.pdf",
            "document_id": doc_uuid,
        }
    ]
    out = _chat_sources_for_response("Answer from the PDF.", contexts, metas, None)
    assert out == [
        {
            "title": "Annual Report",
            "url": f"/api/v1/documents/{doc_uuid}/content",
        }
    ]


def test_pdf_fallback_to_https_when_no_document_id():
    contexts = ["Answer references this Paper document for supporting evidence."]
    metas = [
        {
            "url": "https://cdn.example.com/paper.pdf",
            "title": "Paper",
            "source_file": "paper.pdf",
            "document_id": "",
        }
    ]
    out = _chat_sources_for_response("Answer.", contexts, metas, None)
    assert out == [{"title": "Paper", "url": "https://cdn.example.com/paper.pdf"}]


def test_pdf_fallback_to_https_when_document_id_not_trusted_by_source_file():
    doc_uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    contexts = ["Answer references release notes hosted on docs website."]
    metas = [
        {
            "url": f"https://docs.example.com/releases/{doc_uuid}/notes.pdf",
            "title": "Release notes PDF",
            "source_file": "crawl_page.pdf",
            "document_id": doc_uuid,
        }
    ]
    out = _chat_sources_for_response("Answer.", contexts, metas, None)
    assert out == [
        {
            "title": "Release notes PDF",
            "url": f"https://docs.example.com/releases/{doc_uuid}/notes.pdf",
        }
    ]


def test_confidence_floor_no_longer_blanks_overlap_qualified_sources(monkeypatch):
    """Low aggregate confidence must not hide sources that pass query/answer overlap."""
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "50")
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    contexts = ["The definitive answer appears in this paragraph."]
    metas = [{"url": "https://b.com", "title": "B", "source_file": "b.html"}]
    out = _chat_sources_for_response("Answer.", contexts, metas, {"confidence_score": 40})
    assert out == [{"title": "B", "url": "https://b.com"}]


def test_confidence_floor_passes_when_high_enough(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "50")
    contexts = ["The definitive answer appears in this paragraph."]
    metas = [{"url": "https://b.com", "title": "B", "source_file": "b.html"}]
    out = _chat_sources_for_response("Answer.", contexts, metas, {"confidence_score": 60})
    assert out == [{"title": "B", "url": "https://b.com"}]


def test_confidence_floor_from_env_no_longer_blanks_overlap_sources(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "70")
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    contexts = ["The definitive answer appears in this paragraph."]
    metas = [{"url": "https://b.com", "title": "B", "source_file": "b.html"}]
    out = _chat_sources_for_response("Answer.", contexts, metas, {"confidence_score": 5})
    assert out == [{"title": "B", "url": "https://b.com"}]


def test_confidence_floor_off_when_env_unset(monkeypatch):
    monkeypatch.delenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", raising=False)
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    contexts = ["The definitive answer appears in this paragraph."]
    metas = [{"url": "https://b.com", "title": "B", "source_file": "b.html"}]
    out = _chat_sources_for_response("Answer.", contexts, metas, {"confidence_score": 5})
    assert out == [{"title": "B", "url": "https://b.com"}]


def test_display_chunk_similarity_floor_filters(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "50")
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    contexts = ["a", "b"]
    metas = [
        {"url": "https://a.com", "title": "A", "source_file": "a.html"},
        {"url": "https://b.com", "title": "B", "source_file": "b.html"},
    ]
    out = _build_chat_sources_from_raw_contexts(contexts, metas, chunk_similarity_pct=[40, 80])
    assert out == [{"title": "B", "url": "https://b.com"}]


def test_display_chunk_floor_allows_when_similarity_list_missing(monkeypatch):
    """Missing scores must not wipe Sources while the answer used those chunks."""
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "99")
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    contexts = ["a", "b"]
    metas = [
        {"url": "https://a.com", "title": "A", "source_file": "a.html"},
        {"url": "https://b.com", "title": "B", "source_file": "b.html"},
    ]
    out = _build_chat_sources_from_raw_contexts(contexts, metas, chunk_similarity_pct=None)
    assert out == [
        {"title": "A", "url": "https://a.com"},
        {"title": "B", "url": "https://b.com"},
    ]


def test_similarity_floor_recovery_keeps_overlap_sources(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "90")
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    contexts = ["Gorleben mine repository details for radioactive waste."]
    metas = [{"url": "https://bge.example/gorleben", "title": "Gorleben", "source_file": "g.html"}]
    out = _chat_sources_for_response(
        "Gorleben is a former repository site.",
        contexts,
        metas,
        {"confidence_score": 80},
        chunk_similarity_pct=[40],
        user_query_for_overlap="What is Gorleben?",
    )
    assert out == [{"title": "Gorleben", "url": "https://bge.example/gorleben"}]


def test_display_chunk_floor_partial_similarity_list_keeps_unscored_after_overlap(monkeypatch):
    """Indices without an explicit score are not wiped (overlap remains the gate)."""
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "1")
    contexts = ["a", "b", "c"]
    metas = [
        {"url": "https://a.com", "title": "A", "source_file": "a.html"},
        {"url": "https://b.com", "title": "B", "source_file": "b.html"},
        {"url": "https://c.com", "title": "C", "source_file": "c.html"},
    ]
    out = _build_chat_sources_from_raw_contexts(contexts, metas, chunk_similarity_pct=[100])
    assert out == [
        {"title": "A", "url": "https://a.com"},
        {"title": "B", "url": "https://b.com"},
        {"title": "C", "url": "https://c.com"},
    ]


def test_chat_sources_overlap_drops_unrelated_chunk(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    contexts = ["Banana farming export statistics for tropical regions."]
    metas = [{"url": "https://banana.example", "title": "Bananas", "source_file": "b.html"}]
    out = _chat_sources_for_response(
        "Solar panels convert sunlight into electricity using photovoltaic cells.",
        contexts,
        metas,
        None,
    )
    assert out is None


def test_chat_sources_overlap_uses_user_query_when_answer_unusable(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    contexts = ["Widget pricing depends on regional inventory levels."]
    metas = [{"url": "https://widgets.example", "title": "Widgets", "source_file": "w.html"}]
    out = _chat_sources_for_response(
        "OK.",
        contexts,
        metas,
        None,
        answer_refined_for_policy="OK.",
        user_query_for_overlap="Tell me about Widget pricing regional inventory",
    )
    assert out == [{"title": "Widgets", "url": "https://widgets.example"}]


def test_chat_sources_overlap_off_restores_legacy(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    contexts = ["Unrelated lorem ipsum text."]
    metas = [{"url": "https://legacy.example", "title": "Legacy", "source_file": "l.html"}]
    out = _chat_sources_for_response(
        "Solar energy overview.",
        contexts,
        metas,
        None,
    )
    assert out == [{"title": "Legacy", "url": "https://legacy.example"}]
    from app.services.rag.rag import raw_chunk_similarity_pct_from_distances

    assert raw_chunk_similarity_pct_from_distances([0.0, 1.0, 0.5]) == [100, 0, 50]


def test_chat_sources_only_first_rag_max_contexts(monkeypatch):
    monkeypatch.setenv("RAG_MAX_CONTEXTS", "1")
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    contexts = ["The first answer block summarizes topic A.", "Unrelated second chunk without overlap."]
    metas = [
        {"url": "https://first.com", "title": "First", "source_file": "a.html"},
        {"url": "https://second.com", "title": "Second", "source_file": "b.html"},
    ]
    out = _chat_sources_for_response("Answer.", contexts, metas, None)
    assert out == [{"title": "First", "url": "https://first.com"}]


def test_chat_sources_prefers_query_url_over_earlier_pdf(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    page_url = "https://example.com/ai-solutions"
    contexts = [
        "AI ML question paper formatted with exam topics and sample answers.",
        "Our AI solutions offer scalability collaboration and real-world precision for teams.",
    ]
    metas = [
        {
            "url": "file://AI ML Question Paper Formatted.pdf",
            "title": "AI ML Question Paper Formatted.pdf",
            "source_file": "paper.pdf",
            "document_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
        {
            "url": page_url,
            "title": "AI Solutions",
            "source_file": "crawl_source_123",
            "source_type": "crawl",
        },
    ]
    out = _chat_sources_for_response(
        "Scalability and collaboration for engineers and data scientists.",
        contexts,
        metas,
        None,
        chunk_similarity_pct=[90, 70],
        answer_refined_for_policy="Scalability and collaboration for engineers and data scientists.",
        user_query_for_overlap=f"Summarize {page_url}",
    )
    assert out == [{"title": "AI Solutions", "url": page_url}]


def test_chat_sources_picks_highest_similarity_without_query_url(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    contexts = [
        "Weaker chunk about unrelated banana exports in tropical regions.",
        "Stronger chunk about solar photovoltaic cells converting sunlight into electricity.",
    ]
    metas = [
        {"url": "https://weak.example", "title": "Weak", "source_file": "a.html"},
        {"url": "https://strong.example", "title": "Strong", "source_file": "b.html"},
    ]
    out = _chat_sources_for_response(
        "Solar panels convert sunlight into electricity using photovoltaic cells.",
        contexts,
        metas,
        None,
        chunk_similarity_pct=[55, 92],
        answer_refined_for_policy="Solar panels convert sunlight into electricity using photovoltaic cells.",
    )
    assert out == [{"title": "Strong", "url": "https://strong.example"}]


def test_chat_sources_stops_when_scores_drop(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    monkeypatch.setenv("CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP", "0")
    contexts = [
        "Primary chunk about online voting system authentication ballots.",
        "Secondary weak chunk about online voting system footnotes.",
        "Tertiary noise chunk online voting system footer copyright.",
    ]
    metas = [
        {"url": "https://a.example/voting", "title": "A", "source_file": "a.html"},
        {"url": "https://b.example/voting", "title": "B", "source_file": "b.html"},
        {"url": "https://c.example/voting", "title": "C", "source_file": "c.html"},
    ]
    out = _chat_sources_for_response(
        "Online voting system authentication.",
        contexts,
        metas,
        None,
        chunk_similarity_pct=[95, 40, 22],
        answer_refined_for_policy="Online voting system authentication.",
        user_query_for_overlap="online voting system",
        top_k=5,
    )
    assert out is not None
    assert len(out) == 1
    assert out[0]["url"] == "https://a.example/voting"


def test_sources_skip_deleted_document_ids(monkeypatch):
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")
    live_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    deleted_id = "11111111-2222-3333-4444-555555555555"
    contexts = [
        "Chunk from deleted MailMentor Scope of Work document still in vector store.",
        "Chunk from live AI ML Paper document with grounded answer text.",
    ]
    metas = [
        {
            "url": "file://deleted.pdf",
            "title": "MailMentor Scope of Work.pdf",
            "source_file": f"{deleted_id}_mail.pdf",
            "document_id": deleted_id,
        },
        {
            "url": "file://live.pdf",
            "title": "AI ML Paper.pdf",
            "source_file": f"{live_id}_paper.pdf",
            "document_id": live_id,
        },
    ]
    out = _chat_sources_for_response(
        "Answer from the live AI ML Paper document with grounded answer text.",
        contexts,
        metas,
        None,
        answer_refined_for_policy="Answer from the live AI ML Paper document with grounded answer text.",
        live_item_ids={live_id},
    )
    assert out == [
        {
            "title": "AI ML Paper.pdf",
            "url": f"/api/v1/documents/{live_id}/content",
        }
    ]
