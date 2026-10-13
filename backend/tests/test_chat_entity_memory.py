"""Chat topic memory, deterministic ambiguity and replies (services/chat_query_context.py)."""
import asyncio

import pytest

from app.services import chat_query_context as cqc
from app.services import chat_topic_memory as ctm

PROJECT_ID = "00000000-0000-0000-0000-000000000001"
_SOURCE_WORDS = {"acmeshop", "contoso"}


@pytest.fixture(autouse=True)
def _fake_sources(monkeypatch):
    monkeypatch.delenv("RAG_QUERY_PROCESSING", raising=False)
    monkeypatch.delenv("RAG_CHAT_CLARIFY", raising=False)
    monkeypatch.setattr(
        ctm.source_routing,
        "match_source_ids",
        lambda _pid, text: ["src"] if (text or "").lower() in _SOURCE_WORDS else [],
    )


def _user(text):
    return {"type": "user", "content": text}


def _assistant(text, **extra):
    return {"type": "assistant", "content": text, **extra}


def _resolve(message, prior, *, rewrite=None, ambiguous=False):
    calls = []

    async def _contextualize(msg, hist, **ctx):
        calls.append((msg, ctx))
        return (rewrite or msg), ambiguous

    history = [{"type": m["type"], "content": m["content"]} for m in prior]
    res = asyncio.run(
        cqc.resolve_chat_query(
            message,
            prior,
            history,
            project_id=PROJECT_ID,
            language_hint=None,
            contextualize=_contextualize,
        )
    )
    return res, calls


def test_source_names_are_not_subject_entities():
    prior = [_user("How do I contact Acmeshop help center?"), _assistant("Use the contact form.")]
    assert cqc.resolve_entity_memory(prior, PROJECT_ID) == []
    res, calls = _resolve("Which one is better?", prior)
    assert res.is_ambiguous and res.reason == "deterministic_ambiguity"
    assert calls == []


def test_followup_with_product_entity_contextualizes():
    prior = [_user("What is the price of the Galaxy S24?"), _assistant("It costs 799 USD.")]
    res, calls = _resolve("Is it cheaper?", prior, rewrite="Is the Galaxy S24 cheaper?")
    assert not res.is_ambiguous
    assert [c[0] for c in calls] == ["Is it cheaper?"]
    assert "topic" in calls[0][1]
    assert res.rag_query == "Is the Galaxy S24 cheaper?"
    assert any("Galaxy" in e for e in res.entities)


def test_selection_with_topic_goes_to_contextualizer():
    one = [_user("Tell me about the Galaxy S24"), _assistant("A phone.")]
    res, calls = _resolve("Which one is better?", one, rewrite="Is the Galaxy S24 better?")
    assert not res.is_ambiguous and calls


def test_legacy_clarification_resets_memory():
    prior = [
        _user("What is the price of the Galaxy S24?"),
        _assistant("It costs 799 USD.", entities=["Galaxy S24"]),
        _user("Which one is better?"),
        _assistant(cqc.CLARIFICATION_TEXT),
    ]
    assert cqc.resolve_entity_memory(prior, PROJECT_ID) == []


def test_reply_to_clarification_is_rewritten_with_original_question():
    prior = [
        _user("Which one is better?"),
        _assistant("Which products would you like to compare — laptops or phones?",
                   next_step={"kind": "clarify", "original_query": "Which one is better?"}),
    ]
    res, calls = _resolve("laptops", prior, rewrite="Which laptop is better?")
    assert not res.is_ambiguous and res.reason == "reply_resolved"
    pending = calls[0][1]["pending"]
    assert pending.kind == "clarify" and pending.original_query == "Which one is better?"
    assert res.rag_query == "Which laptop is better?"


def test_unresolvable_reply_is_clarified_again():
    prior = [_user("Which one is better?"),
             _assistant("Which products?", next_step={"kind": "clarify", "original_query": "Which one is better?"})]
    res, _ = _resolve("How much does it cost?", prior, ambiguous=True)
    assert res.is_ambiguous and res.reason == "reply_ambiguous"


def test_new_full_question_after_follow_up_is_standalone():
    prior = [_user("What services do you offer?"),
             _assistant("We offer A, B and C. Which would you like to explore?",
                        next_step={"kind": "follow_up", "original_query": "What services do you offer?"})]
    res, calls = _resolve("What is the return policy for Galaxy phones?", prior)
    assert calls == [] and res.reason == "standalone"


def test_legacy_clarification_reply_when_clarify_disabled(monkeypatch):
    monkeypatch.setenv("RAG_CHAT_CLARIFY", "0")
    prior = [_user("Which one is better?"), _assistant(cqc.CLARIFICATION_TEXT)]
    res, calls = _resolve("the Galaxy S24", prior)
    assert res.reason == "clarification_reply"
    assert res.rag_query == "Which one is better? regarding the Galaxy S24"
    assert calls == []


def test_stored_entities_take_precedence_over_user_text():
    prior = [
        _user("Show me something nice"),
        _assistant("Here are two picks.", entities=["Pixel 8", "Galaxy S24"]),
    ]
    assert cqc.resolve_entity_memory(prior, PROJECT_ID) == ["Pixel 8", "Galaxy S24"]


def test_standalone_question_skips_contextualize():
    res, calls = _resolve("What is the return policy for electronics?", [])
    assert not res.is_ambiguous
    assert calls == []
    assert res.reason == "standalone"


def test_disabled_processing_keeps_legacy_flow(monkeypatch):
    monkeypatch.setenv("RAG_QUERY_PROCESSING", "0")
    res, calls = _resolve("Which one is better?", [])
    assert res.processed_query is None
    assert not res.is_ambiguous
    assert calls == []


def test_memory_for_ambiguous_turn_marks_pending_clarify():
    res, _ = _resolve("Which one is better?", [])
    memory = res.memory_for_turn("Which products would you like to compare?", PROJECT_ID)
    assert memory["entities"] == []
    assert memory["next_step"] == {"kind": "clarify", "original_query": "Which one is better?", "answered": False}


@pytest.mark.parametrize(
    "message,expected",
    [
        ("hi", True),
        ("Hello there", True),
        ("hey!", True),
        ("shipping cost", False),
        ("this phone?", False),
        ("hi, what is the return policy?", False),
        ("", False),
    ],
)
def test_greeting_word_boundary(message, expected):
    assert cqc.is_unambiguous_greeting(message) is expected
