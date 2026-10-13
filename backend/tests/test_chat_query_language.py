"""Chat messages in a language the documents are not in are translated for retrieval only."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.services import chat_query_language as bridge_mod
from app.services.rag.query_language import detect_text_language


class _LLM:
    def __init__(self, reply="Which is the cheapest laptop?", fail=False):
        self.reply, self.fail, self.calls = reply, fail, 0

    def complete(self, prompt):
        self.calls += 1
        if self.fail:
            raise RuntimeError("provider down")
        return SimpleNamespace(text=self.reply)


def _factory(llm):
    return SimpleNamespace(get_llm=lambda provider, model, key: llm)


@pytest.fixture(autouse=True)
def _english_project(monkeypatch):
    bridge_mod._languages.clear()
    bridge_mod._translations.clear()
    monkeypatch.setattr(bridge_mod, "_detect_languages", lambda db, pid: ("en",))


def _run(message, llm):
    return asyncio.run(bridge_mod.bridge(object(), "p1", message, {"provider": "mistral"}, llm_factory=_factory(llm)))


def test_script_languages_are_detected():
    assert detect_text_language("सबसे सस्ता लैपटॉप कौन सा है?") == "hi"
    assert detect_text_language("u guys sell ACs or not") == "en"


def test_foreign_question_is_translated_once():
    llm = _LLM()
    first = _run("सबसे सस्ता लैपटॉप कौन सा है?", llm)
    again = _run("सबसे सस्ता लैपटॉप कौन सा है?", llm)
    assert first.translated and first.language == "hi" and first.message == "Which is the cheapest laptop?"
    assert again.message == first.message and llm.calls == 1


@pytest.mark.parametrize("message", ["cheapest laptop", "sabse sasta konsa hai?", "Samsung TV 108 cm"])
def test_content_language_or_uncertain_text_is_unchanged(message):
    llm = _LLM()
    out = _run(message, llm)
    assert out.message == message and not out.translated and llm.calls == 0


def test_failure_keeps_the_original_message():
    out = _run("Welcher Fernseher ist am günstigsten?", _LLM(fail=True))
    assert out.message == "Welcher Fernseher ist am günstigsten?" and not out.translated


@pytest.mark.parametrize(
    "reply",
    [
        "What is the **iPhone 13 mini** (€599) the cheapest **iPhone** model?",
        "I need a Lenovo IdeaPad laptop with 8GB RAM, 512GB SSD, Intel Core i5, Windows 11 Home for "
        "office work, gaming and video editing under a budget please",
        "",
        "सबसे सस्ता कौन सा है?",
    ],
)
def test_embellished_translation_keeps_the_original_message(reply):
    out = _run("Was ist das günstigste Smartphone?", _LLM(reply=reply))
    assert out.message == "Was ist das günstigste Smartphone?" and not out.translated


def test_language_label_echoed_by_the_model_is_dropped():
    llm = _LLM(reply="hi: Which one is the cheapest?")
    out = _run("सबसे सस्ता कौन सा है?", llm)
    assert out.message == "Which one is the cheapest?"


def test_translation_markup_is_stripped_and_numbers_kept():
    out = _run("Welche Fernseher habt ihr unter 20000 Rupien?", _LLM(reply="English: **TVs** under 20000 rupees?"))
    assert out.message == "TVs under 20000 rupees?" and out.translated


def test_unknown_content_language_never_translates(monkeypatch):
    monkeypatch.setattr(bridge_mod, "_detect_languages", lambda db, pid: ())
    llm = _LLM()
    assert _run("Welcher Fernseher ist am günstigsten?", llm).message.startswith("Welcher") and llm.calls == 0
