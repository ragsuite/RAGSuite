"""Rich text (editor HTML): sanitizing, plain-text conversion, FAQ limits/streaming, textual sources."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.platform.module_bootstrap import ensure_ragsuite_modules_path
from app.schemas import ChatbotFaqQuestionUpdate, PredefinedQuestion
from app.services.chatbot_faq import normalize_faq_questions
from app.services.faq_common import (
    FAQ_ANSWER_MAX_LENGTH,
    chunk_faq_answer,
    faq_answer_for_history,
    normalize_faq_answer,
)
from app.services.rag.utils_rag import extract_text_from_file
from app.services.rich_text import (
    editor_html_to_text,
    is_editor_html,
    is_rich_html,
    normalize_rich_text,
    rich_html_to_text,
    rich_text_length,
    sanitize_rich_html,
)
from app.services.search_faq import normalize_search_faq_questions
from app.services.textual_sources import QA_EXT, TEXT_EXT, format_qa_chunk, serialize_qa_pairs

ensure_ragsuite_modules_path()

from ragsuite_modules.documents.backend.textual_sources import QaSourceIn, TextSourceIn  # noqa: E402

RICH = (
    '<h2 style="text-align:center">Plans</h2>'
    '<p class="rs-lead rs-indent-1">Pick <strong>one</strong>&nbsp;today.</p>'
    '<ul><li><p>CE</p><ol start="2"><li><p>Free</p></li></ol></li><li><p>EE</p></li></ul>'
    "<blockquote><p>Quote</p></blockquote><hr>"
    "<table><tbody><tr><th><p>Plan</p></th><th><p>Price</p></th></tr>"
    "<tr><td><p>CE</p></td><td><p>0</p></td></tr></tbody></table>"
)


# --- sanitizer --------------------------------------------------------------------


def test_sanitizer_strips_scripts_handlers_and_unsafe_urls():
    dirty = (
        '<p onclick="steal()" style="color:red;text-align:right" class="rs-muted evil">Hi'
        '<script>alert(1)</script><img src=x onerror="alert(1)">'
        '<a href="javascript:alert(1)">bad</a><a href="https://ok.io" target="_blank">ok</a>'
        '<a href="/docs" target="_top">rel</a></p><iframe src="https://x"></iframe>'
    )
    clean = sanitize_rich_html(dirty)
    for forbidden in ("onclick", "script", "onerror", "<img", "javascript:", "iframe", "color:red", "evil", "_top"):
        assert forbidden not in clean
    assert 'style="text-align:right"' in clean and 'class="rs-muted"' in clean
    assert '<a href="https://ok.io" target="_blank" rel="noopener noreferrer">ok</a>' in clean


def test_sanitizer_keeps_editor_markup_and_is_idempotent():
    clean = sanitize_rich_html(RICH)
    assert clean == sanitize_rich_html(clean)
    for kept in ("<h2", "<strong>", "<ol start=\"2\">", "<blockquote>", "<hr>", "<th>", 'class="rs-lead rs-indent-1"'):
        assert kept in clean


def test_rich_detection_and_visible_length():
    assert is_rich_html("<p>x</p>") and not is_rich_html("List<string> and a < b")
    assert is_editor_html("<p>x</p>") and not is_editor_html("Use <b>bold</b> here")
    assert rich_text_length("<p>co&shy;op&nbsp;<strong>x</strong></p>") == len("coop x")
    assert rich_text_length("plain  text") == len("plain text")
    assert normalize_rich_text("<p><br></p>") == ""
    assert normalize_rich_text("  plain <3 text ") == "plain <3 text"


def test_rich_html_to_text_keeps_structure():
    text = rich_html_to_text(RICH)
    assert text == (
        "Plans\n\nPick one today.\n\n- CE\n  2. Free\n- EE\n\n> Quote\n\nPlan | Price\nCE | 0"
    )
    assert rich_html_to_text("Plain stays") == "Plain stays"


# --- FAQ ----------------------------------------------------------------------------


def test_normalize_faq_answer_handles_plain_and_rich():
    assert normalize_faq_answer("x" * 5000) == "x" * FAQ_ANSWER_MAX_LENGTH
    assert normalize_faq_answer('<p onclick="x">Hi</p>') == "<p>Hi</p>"
    long_rich = "<p>" + "<strong>a</strong>" * (FAQ_ANSWER_MAX_LENGTH + 10) + "</p>"
    degraded = normalize_faq_answer(long_rich)
    assert "<" not in degraded and len(degraded) == FAQ_ANSWER_MAX_LENGTH


def test_faq_normalizers_sanitize_rich_answers_only():
    chat = normalize_faq_questions([{"id": "a", "text": "Q", "answer": "<p>A<script>x</script></p>"}])
    assert chat[0]["answer"] == "<p>A</p>"
    search = normalize_search_faq_questions([{"id": "s", "question": "Q", "answer": " plain answer "}])
    assert search[0]["answer"] == "plain answer"


@pytest.mark.parametrize("text", [RICH, "<p>a <em>b</em></p>\n<p>c</p>", "plain words only", "<p>x</p>"])
def test_chunk_faq_answer_never_splits_tags(text):
    chunks = chunk_faq_answer(text, max_chunks=5)
    assert "".join(chunks) == text
    assert len(chunks) <= 5
    for chunk in chunks:
        assert chunk.count("<") == chunk.count(">")


def test_faq_history_is_plain_text():
    assert faq_answer_for_history("<p>Hello <strong>there</strong></p>") == "Hello there"
    assert faq_answer_for_history("Plain") == "Plain"


def test_faq_schemas_validate_visible_length():
    rich = "<p>" + "<strong>a</strong>" * 500 + "</p>"
    assert len(rich) > FAQ_ANSWER_MAX_LENGTH
    assert ChatbotFaqQuestionUpdate(text="Q", answer=rich).answer == rich
    with pytest.raises(ValidationError):
        ChatbotFaqQuestionUpdate(text="Q", answer="<p><br></p>")
    with pytest.raises(ValidationError):
        ChatbotFaqQuestionUpdate(text="Q", answer="<p>" + "a" * (FAQ_ANSWER_MAX_LENGTH + 1) + "</p>")
    assert PredefinedQuestion(question="Q", answer=rich).answer == rich
    with pytest.raises(ValidationError):
        PredefinedQuestion(question="Q", answer="x" * (FAQ_ANSWER_MAX_LENGTH + 1))


# --- Text / Q&A sources ------------------------------------------------------------------


def test_text_source_sanitizes_html_and_counts_visible_chars():
    body = TextSourceIn(title="T", content='<p onclick="x">Hi <strong>there</strong></p>', content_format="html")
    assert body.content == "<p>Hi <strong>there</strong></p>"
    plain = TextSourceIn(title="T", content="<b>literal</b> mention")
    assert plain.content == "<b>literal</b> mention"
    with pytest.raises(ValidationError):
        TextSourceIn(title="T", content="<p></p>", content_format="html")


def test_qa_answer_sanitized_with_visible_limit():
    body = QaSourceIn(title="FAQ", pairs=[{"question": "Q?", "answer": "<p>A<script>x</script></p>"}])
    assert body.pairs[0].answer == "<p>A</p>"
    rich = "<p>" + "<em>a</em>" * 1000 + "</p>"
    assert len(rich) > 4000
    assert QaSourceIn(title="FAQ", pairs=[{"question": "Q?", "answer": rich}]).pairs[0].answer == rich
    with pytest.raises(ValidationError):
        QaSourceIn(title="FAQ", pairs=[{"question": "Q?", "answer": "<p>" + "a" * 4001 + "</p>"}])
    with pytest.raises(ValidationError):
        QaSourceIn(title="FAQ", pairs=[{"question": "Q?", "answer": "<p>" + "<em>a</em>" * 2000 + "</p>"}])


def test_ingestion_indexes_rich_text_as_plain(tmp_path):
    text_path = tmp_path / f"doc_rich{TEXT_EXT}"
    text_path.write_text(RICH, encoding="utf-8")
    texts, _ = extract_text_from_file(str(text_path))
    joined = " ".join(texts)
    assert "<" not in joined and "Plan | Price" in joined

    qa_path = tmp_path / f"doc_rich{QA_EXT}"
    qa_path.write_bytes(serialize_qa_pairs([{"question": "Q?", "answer": "<ul><li><p>One</p></li></ul>"}]))
    texts, _ = extract_text_from_file(str(qa_path))
    assert texts == ["Question: Q?\nAnswer: - One"]


def test_plain_textual_content_is_indexed_unchanged():
    legacy = "Use <b>bold</b> tags in the template."
    assert editor_html_to_text(legacy) == legacy
    assert format_qa_chunk("Q", legacy) == f"Question: Q\nAnswer: {legacy}"
