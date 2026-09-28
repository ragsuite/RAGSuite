"""Text and Q&A pair sources: extraction, reindex paths, validation, and citation suppression."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.platform.module_bootstrap import ensure_ragsuite_modules_path
from app.routes.rag import (
    RAG_OUT_OF_CONTEXT_MSG,
    _build_chat_sources_from_raw_contexts,
    _finalize_chat_answer_for_user,
)
from app.services.chat_answer_links import (
    citations_from_context_metadatas,
    collect_http_urls_from_sources_and_metadatas,
    source_url_line_for_context,
)
from app.services.job_queue import _with_recoverable_suffix
from app.services.rag.utils_rag import extract_text_from_file
from app.services.reindex_service import reindex_temp_suffix_for_uploaded_doc
from app.services.search_sources import build_search_sources_from_contexts
from app.services.source_display_policy import (
    chunk_passes_source_relevance,
    contexts_include_textual_sources,
)
from app.services.textual_sources import (
    QA_EXT,
    QA_MIME,
    TEXT_EXT,
    TEXT_MIME,
    is_non_citable_meta,
    parse_qa_pairs,
    serialize_qa_pairs,
    staging_ext_for_mime,
)

ensure_ragsuite_modules_path()

from ragsuite_modules.ai_assistant.backend.docs_answer import (  # noqa: E402
    _citation_items_from_retrieval_meta,
)
from ragsuite_modules.documents.backend.textual_sources import (  # noqa: E402
    QaSourceIn,
    TextSourceIn,
    qa_payload,
    text_payload,
)

TEXT_META = {"title": "Refund policy", "url": "", "source_type": "text", "document_id": "11111111-1111-1111-1111-111111111111"}
QA_META = {"title": "Shipping", "url": "", "source_type": "qa", "document_id": "22222222-2222-2222-2222-222222222222"}
WEB_META = {"title": "Widgets page", "url": "https://example.com/widgets", "document_id": "web-1"}


@pytest.fixture(autouse=True)
def _source_floors_off(monkeypatch):
    monkeypatch.setenv("CHAT_SOURCES_MIN_CONFIDENCE_PCT", "0")
    monkeypatch.setenv("DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT", "0")


# --- extraction -----------------------------------------------------------------


def test_extract_text_source_tags_chunks_without_url(tmp_path):
    path = tmp_path / f"doc_notes{TEXT_EXT}"
    path.write_text("Refunds are issued within 14 days. Visit https://example.com for more.", encoding="utf-8")
    texts, metas = extract_text_from_file(str(path))
    assert texts and len(texts) == len(metas)
    assert all(m["source_type"] == "text" and m["url"] == "" for m in metas)


def test_extract_qa_source_emits_one_chunk_per_pair(tmp_path):
    path = tmp_path / f"doc_faq{QA_EXT}"
    path.write_bytes(
        serialize_qa_pairs(
            [
                {"question": "How long is shipping?", "answer": "3-5 business days."},
                {"question": "Do you ship abroad?", "answer": "Yes, to the EU."},
                {"question": "  ", "answer": "dropped"},
            ]
        )
    )
    texts, metas = extract_text_from_file(str(path))
    assert texts == [
        "Question: How long is shipping?\nAnswer: 3-5 business days.",
        "Question: Do you ship abroad?\nAnswer: Yes, to the EU.",
    ]
    assert [m["source_type"] for m in metas] == ["qa", "qa"]
    assert [m["chunk_index"] for m in metas] == [0, 1]


def test_parse_qa_pairs_rejects_invalid_json():
    assert parse_qa_pairs(b"not json") == []
    assert parse_qa_pairs(None) == []


# --- reindex / recovery paths -----------------------------------------------------


def test_reindex_suffix_prefers_textual_mime_over_title():
    doc = SimpleNamespace(title="notes.txt", type=TEXT_MIME)
    assert reindex_temp_suffix_for_uploaded_doc(doc, b"hello") == TEXT_EXT
    qa_doc = SimpleNamespace(title="FAQ", type=QA_MIME)
    assert reindex_temp_suffix_for_uploaded_doc(qa_doc, b"{}") == QA_EXT
    assert staging_ext_for_mime("text/plain") is None


def test_recovery_staging_name_gets_extractor_suffix():
    doc = SimpleNamespace(title="Return policy", type=TEXT_MIME)
    assert _with_recoverable_suffix("Return_policy", doc, b"text").endswith(TEXT_EXT)
    pdf = SimpleNamespace(title="guide.pdf", type="application/pdf")
    assert _with_recoverable_suffix("guide.pdf", pdf, b"%PDF-1.4") == "guide.pdf"


# --- request validation -------------------------------------------------------------


def test_text_source_requires_content():
    with pytest.raises(ValidationError):
        TextSourceIn(title="Policy", content="   ")
    body = TextSourceIn(title=" Policy ", content=" Refunds in 14 days ", description="  ")
    assert body.title == "Policy" and body.content == "Refunds in 14 days"
    assert body.description is None
    payload = text_payload(body)
    assert payload.mime == TEXT_MIME and payload.content == b"Refunds in 14 days"


def test_qa_source_requires_complete_pairs():
    with pytest.raises(ValidationError):
        QaSourceIn(title="FAQ", pairs=[])
    with pytest.raises(ValidationError):
        QaSourceIn(title="FAQ", pairs=[{"question": "Q?", "answer": " "}])
    body = QaSourceIn(title="FAQ", pairs=[{"question": " Q? ", "answer": " A. "}])
    payload = qa_payload(body)
    assert payload.mime == QA_MIME
    assert parse_qa_pairs(payload.content) == [{"question": "Q?", "answer": "A."}]


# --- citation suppression -------------------------------------------------------------


def test_textual_chunks_never_pass_source_relevance():
    assert is_non_citable_meta(TEXT_META) and is_non_citable_meta(QA_META)
    assert not is_non_citable_meta(WEB_META)
    assert chunk_passes_source_relevance("Refund policy text", TEXT_META, enabled=False) is False
    assert chunk_passes_source_relevance("Widgets page", WEB_META, enabled=False) is True


def test_search_sources_drop_textual_chunks_but_keep_web():
    contexts = ["Refunds for widgets take 14 days.", "Widgets shipping takes 3 days.", "Widgets are great."]
    metas = [TEXT_META, QA_META, WEB_META]
    sources = build_search_sources_from_contexts(
        contexts, metas, [90, 85, 80], top_k=5, answer="Widgets info.", user_query="widgets"
    )
    assert [s["url"] for s in sources] == ["https://example.com/widgets"]

    only_textual = build_search_sources_from_contexts(
        contexts[:2], metas[:2], [90, 85], top_k=5, answer="Widgets info.", user_query="widgets"
    )
    assert only_textual == []


def test_chat_sources_drop_textual_chunks():
    sources = _build_chat_sources_from_raw_contexts(
        ["Widgets refunds take 14 days.", "Widgets page content."],
        [TEXT_META, WEB_META],
        user_query_for_overlap="widgets",
    )
    assert sources and [s["url"] for s in sources] == ["https://example.com/widgets"]
    assert _build_chat_sources_from_raw_contexts(
        ["Widgets refunds take 14 days."], [TEXT_META], user_query_for_overlap="widgets"
    ) is None


def test_finalize_keeps_answer_grounded_only_in_textual_sources():
    answer = "Refunds are issued within 14 days."
    assert contexts_include_textual_sources([TEXT_META])
    out = _finalize_chat_answer_for_user(answer, None, user_query="refund?", context_metadatas=[TEXT_META])
    assert out == answer
    assert "http" not in (out or "")
    refused = _finalize_chat_answer_for_user(answer, None, user_query="refund?", context_metadatas=[])
    assert refused == RAG_OUT_OF_CONTEXT_MSG


def test_answer_link_helpers_skip_textual_metadata():
    leaky = dict(TEXT_META, url="https://leak.example.com")
    assert citations_from_context_metadatas([leaky]) == []
    assert collect_http_urls_from_sources_and_metadatas([], [leaky]) == []
    assert source_url_line_for_context(leaky) == ""
    assert source_url_line_for_context(WEB_META).startswith("Source URL:")


def test_ai_assistant_citations_skip_textual_metadata():
    items = _citation_items_from_retrieval_meta({"raw_contexts_metadatas": [TEXT_META, QA_META, WEB_META]})
    assert [i["url"] for i in items] == ["https://example.com/widgets"]
