"""Out-of-context handling for Search Test: normalize + lexical fail-fast."""

from app.routes.rag import (
    RAG_OOC_SENTINEL,
    RAG_OUT_OF_CONTEXT_MSG,
    _normalize_ooc_answer_text,
)
from app.services.rag.rag import RAG


def test_normalize_keeps_non_sentinel_when_raw_was_sentinel():
    answer = "<p>NITSAN is a digital agency.</p>"
    assert _normalize_ooc_answer_text(answer, raw_llm=RAG_OOC_SENTINEL) == answer


def test_normalize_replaces_raw_sentinel_answer():
    assert _normalize_ooc_answer_text(RAG_OOC_SENTINEL) == RAG_OUT_OF_CONTEXT_MSG
    assert (
        _normalize_ooc_answer_text("", raw_llm=RAG_OOC_SENTINEL) == RAG_OUT_OF_CONTEXT_MSG
    )


def test_search_lacks_lexical_support_ignores_generic_service_pages():
    rag = RAG.__new__(RAG)
    # Generic "services" pages must NOT count as evidence for "nitsan".
    assert rag._search_lacks_lexical_support(
        "what is nitsan? what are services of it?",
        [
            "But in case you need our installation or customization services, a fee will be required.",
            "T3Planet TYPO3 Consultant services and SaaS hosting.",
        ],
    )
    assert rag._search_lacks_lexical_support(
        "what is nitsan? what are services of it?",
        ["Gujarat tourism beaches and temples guide"],
    )
    assert not rag._search_lacks_lexical_support(
        "what is nitsan? what are services of it?",
        ["NITSAN is a digital marketing company offering SEO services."],
    )


def test_search_resolve_ooc_does_not_dump_chunks():
    rag = RAG.__new__(RAG)
    out = rag._resolve_ooc_answer(
        RAG_OOC_SENTINEL,
        user_query="what is nitsan?",
        non_empty_contexts=[
            "T3Planet installation services fee required for customization.",
            "More unrelated services marketing copy.",
        ],
        retrieval_meta={"confidence_score": 40, "tier_used": 1},
        mode="search",
        format_type="html_long",
    )
    assert out == RAG.OUT_OF_CONTEXT_MSG
    assert "Key point" not in out
    assert "retrieved chunks" not in out.lower()


def test_extractive_fallback_still_works_for_chat_path():
    rag = RAG.__new__(RAG)
    out = rag._build_context_fallback_answer(
        "what is nitsan?",
        [
            "NITSAN helps businesses grow with web development and digital marketing.",
            "Unrelated paragraph about weather.",
        ],
    )
    assert "NITSAN" in out or "nitsan" in out.lower()
    assert RAG_OOC_SENTINEL not in out


def test_recovery_prompt_forbids_sentinel_and_raw_dumps():
    rag = RAG.__new__(RAG)
    prompt = rag._build_search_recovery_prompt(
        "what is nitsan?",
        ["NITSAN builds TYPO3 products and digital services."],
        format_type="html_long",
    )
    assert "QUERY_OUT_OF_CONTEXT" in prompt
    assert "Do NOT paste raw source text" in prompt
    assert "<p>" in prompt or "HTML" in prompt
