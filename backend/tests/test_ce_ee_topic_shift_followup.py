"""CE/EE wrong-sense follow-ups must not graft Civil/Electrical onto 'community edition'."""
from __future__ import annotations

import pytest

from app.services import chat_clarification as clarify
from app.services import chat_contextualize as cctx
from app.services import chat_query_context as cqc
from app.services.chat_reference_signals import is_elliptical_followup
from app.services.chat_topic_memory import TopicFrame
from app.services.rag.query_processing import process_query

CIVIL_HISTORY = [
    {
        "type": "user",
        "content": "What CE vs EE?",
    },
    {
        "type": "assistant",
        "content": (
            "Are you asking about the differences between Civil Engineering (CE) "
            "and Electrical Engineering (EE)?"
        ),
    },
]


@pytest.mark.asyncio
async def test_community_edition_topic_shift_keeps_original_query():
    """Elliptical bare phrase that shifts topic must not rewrite against Civil/Electrical."""
    message = "community edition"
    assert is_elliptical_followup(
        message, CIVIL_HISTORY, named_entities=process_query(message).entities
    )
    rewritten, ambiguous = await cctx.contextualize_query(
        message,
        CIVIL_HISTORY,
        llm_config={"provider": "openai", "chat_model": "gpt-4", "api_key": "x"},
        llm_factory=None,
        elliptical=True,
    )
    assert not ambiguous
    assert rewritten == message
    assert "Civil" not in rewritten
    assert "Electrical" not in rewritten


def test_answer_history_cleared_on_topic_shift():
    res = cqc.ChatQueryResolution(
        rag_query="community edition",
        is_ambiguous=False,
        processed_query=process_query("community edition"),
        entities=[],
        reason="followup_unchanged",
        contextualize_ms=0,
        topic=TopicFrame(),
        pending=None,
    )
    assert res.answer_history("community edition", CIVIL_HISTORY) is None


def test_clarification_fallback_without_candidates_avoids_engineering():
    text = clarify.fallback_clarification("What CE vs EE?", [], "en")
    assert "Civil" not in text
    assert "Electrical" not in text
    assert "product" in text.lower() or "topic" in text.lower()


def test_clarification_prompt_forbids_invented_full_forms():
    prompt = clarify._prompt("What CE vs EE?", [], [], "English")
    low = prompt.lower()
    assert "invent" in low
    assert "disciplines" in low or "full forms" in low
    assert "Civil Engineering" not in prompt


@pytest.mark.asyncio
async def test_clarification_skips_llm_when_no_candidates(monkeypatch):
    called = {"n": 0}

    class _Factory:
        def get_llm(self, *a, **k):
            called["n"] += 1
            raise AssertionError("LLM must not run without candidates")

    monkeypatch.setattr(clarify, "clarification_candidates", lambda *a, **k: [])
    out = await clarify.generate_clarification(
        "What CE vs EE?",
        CIVIL_HISTORY,
        frame=TopicFrame(),
        project_id=None,
        language_code="en",
        llm_config={"provider": "openai", "chat_model": "gpt-4", "api_key": "x"},
        llm_factory=_Factory(),
    )
    assert called["n"] == 0
    assert out.generated is False
    assert "Civil" not in out.text
