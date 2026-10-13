"""A message of words nobody uses is answered like a first message, never folded into the
assistant's question (services/chat_unrecognized.py, chat_query_context.resolve_chat_query)."""
import asyncio

import pytest

from app.services import chat_query_context as cqc
from app.services import chat_topic_memory as ctm
from app.services.chat_unrecognized import is_unrecognized
from app.services.rag import lexical_index as li

PROJECT_ID = "00000000-0000-0000-0000-000000000001"
ASKED_BACK = (
    "Did you mean something specific about Karwa Chauth makeup like lipstick shades, "
    "application techniques, or other details?"
)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.delenv("RAG_CHAT_CLARIFY", raising=False)
    monkeypatch.delenv("RAG_QUERY_PROCESSING", raising=False)
    monkeypatch.setattr(ctm.source_routing, "match_source_ids", lambda _pid, _text: [])


def _index_knows(monkeypatch, known, calls=None):
    def fake(_pid, words):
        if calls is not None:
            calls.append(list(words))
        return None if known is None else {w for w in words if w in known}

    monkeypatch.setattr(li, "project_words", fake)


@pytest.mark.parametrize("message", ["oipuiopuoiu", "giug ugjugj", "a;ldkjfal;kdja;lkdjasd;kjl"])
def test_words_nobody_uses_are_unrecognized(monkeypatch, message):
    _index_knows(monkeypatch, set())
    assert is_unrecognized(message, [ASKED_BACK], PROJECT_ID)


@pytest.mark.parametrize("message", [
    "yes", "haan batao", "the second one", "what about it?", "order 48213",
    "aplication techniques",  # a typo of the assistant's own words
    "",  "?!",
])
def test_reply_and_function_words_are_recognized_without_the_index(monkeypatch, message):
    calls = []
    _index_knows(monkeypatch, set(), calls)
    assert not is_unrecognized(message, [ASKED_BACK], PROJECT_ID)
    assert calls == []


def test_words_the_pages_use_are_recognized(monkeypatch):
    _index_knows(monkeypatch, {"sindoor"})
    assert not is_unrecognized("sindoor", [ASKED_BACK], PROJECT_ID)


def test_unknown_when_the_index_cannot_answer(monkeypatch):
    _index_knows(monkeypatch, None)
    assert not is_unrecognized("oipuiopuoiu", [ASKED_BACK], PROJECT_ID)


def test_earlier_user_gibberish_does_not_make_it_a_word(monkeypatch):
    _index_knows(monkeypatch, set())
    assert is_unrecognized("giug ugjugj", [ASKED_BACK], PROJECT_ID)


def _prior():
    return [
        {"type": "user", "content": "karwa chauth makeup tips for lips"},
        {"type": "assistant", "content": "Matte liquid lipsticks in deep reds stay put."},
        {"type": "user", "content": "giug ugjugj"},
        {"type": "assistant", "content": ASKED_BACK,
         "next_step": {"kind": "clarify", "original_query": "giug ugjugj", "answered": False}},
    ]


def _resolve(message):
    calls = []

    async def _contextualize(msg, hist, **ctx):
        calls.append(ctx)
        return "best Karwa Chauth lipstick shades", False

    prior = _prior()
    history = [{"type": m["type"], "content": m["content"]} for m in prior]
    res = asyncio.run(cqc.resolve_chat_query(
        message, prior, history, project_id=PROJECT_ID, language_hint="en", contextualize=_contextualize,
    ))
    return res, calls


def test_gibberish_after_asking_back_is_not_resolved_into_an_offered_option(monkeypatch):
    _index_knows(monkeypatch, set())
    res, calls = _resolve("oipuiopuoiu")
    assert res.reason == "unrecognized" and res.rag_query == "oipuiopuoiu"
    assert not res.is_ambiguous and calls == []


def test_unrecognized_turn_keeps_the_earlier_topic(monkeypatch):
    _index_knows(monkeypatch, set())
    res, _calls = _resolve("oipuiopuoiu")
    memory = res.memory_for_turn("I don't have information on that.", PROJECT_ID)
    assert memory[ctm.TOPIC_KEY] == list(res.topic.terms) and ctm.NEXT_STEP_KEY not in memory
    assert "oipuiopuoiu" not in memory[ctm.TOPIC_KEY]


def test_real_reply_after_asking_back_still_resolves(monkeypatch):
    _index_knows(monkeypatch, set())
    res, calls = _resolve("lipstick shades")
    assert res.reason == "reply_resolved" and calls[0]["pending"].kind == "clarify"
