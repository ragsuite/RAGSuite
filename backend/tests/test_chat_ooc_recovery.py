"""Chat OOC recovery: synthesis instead of raw chunk dumps."""

from app.services.rag.rag import RAG


def test_complete_ooc_recovery_synthesizes_answer():
    rag = RAG.__new__(RAG)

    def _fake_complete(_llm, _prompt, provider="", kwargs=None):
        class _Resp:
            text = "T3Planet is a marketplace for TYPO3 extensions and templates."

        return _Resp()

    rag._complete_with_transient_retry = _fake_complete
    rag._clean_response_text = lambda text, format_type="markdown": text

    out = rag._complete_ooc_recovery(
        object(),
        "what is t3planet?",
        ["T3Planet offers TYPO3 templates and extensions for developers."],
        format_type="markdown",
        language_code="en",
        max_tokens=400,
    )
    assert "T3Planet" in out
    assert "Key point" not in out
    assert "retrieved chunks" not in out.lower()


def test_complete_ooc_recovery_returns_empty_on_second_ooc():
    rag = RAG.__new__(RAG)

    def _fake_complete(_llm, _prompt, provider="", kwargs=None):
        class _Resp:
            text = RAG.OUT_OF_CONTEXT_SENTINEL

        return _Resp()

    rag._complete_with_transient_retry = _fake_complete

    out = rag._complete_ooc_recovery(
        object(),
        "what is t3planet?",
        ["T3Planet offers TYPO3 templates."],
        format_type="markdown",
        language_code="en",
        max_tokens=400,
    )
    assert out == ""
