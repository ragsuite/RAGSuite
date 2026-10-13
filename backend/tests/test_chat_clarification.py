"""Query-specific clarifying questions (services/chat_clarification.py)."""
import asyncio

import pytest

from app.services import chat_clarification as cc
from app.services.chat_topic_memory import LEGACY_CLARIFICATION_TEXT, TopicFrame

PROJECT_ID = "00000000-0000-0000-0000-000000000001"


class _Result:
    def __init__(self, text):
        self.text = text


class _Factory:
    def __init__(self, text=None, exc=None):
        self.text, self.exc, self.prompts = text, exc, []

    def get_llm(self, provider, model, api_key):
        factory = self

        class _LLM:
            def complete(self, prompt):
                factory.prompts.append(prompt)
                if factory.exc:
                    raise factory.exc
                return _Result(factory.text)

        return _LLM()


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.delenv("RAG_CHAT_CLARIFY", raising=False)
    monkeypatch.setattr(cc.source_routing, "source_labels", lambda _pid, limit=4: ["shop.example", "docs.example"])


def _generate(factory, message="Which one is better?", history=(), frame=TopicFrame(), lang="en"):
    return asyncio.run(cc.generate_clarification(
        message, list(history), frame=frame, project_id=PROJECT_ID,
        language_code=lang, llm_config={"provider": "openai", "chat_model": "m"}, llm_factory=factory,
    ))


def test_generated_question_is_used_and_prompt_has_options_and_language():
    factory = _Factory("Which laptops would you like to compare — the ASUS ROG or the HP Omen?")
    history = [{"type": "user", "content": "Show gaming laptops"},
               {"type": "assistant", "content": "Try the **ASUS ROG Strix** or the **HP Omen 16**."}]
    out = _generate(factory, history=history, lang="de")
    assert out.generated and out.text.startswith("Which laptops")
    assert "ASUS ROG Strix" in factory.prompts[0] and "German" in factory.prompts[0]
    assert out.options == ("ASUS ROG Strix", "HP Omen 16")


@pytest.mark.parametrize("bad", ["AMBIGUOUS", "", "Here is the answer.", "x" * 500 + "?", "Which? SOURCES_USED: S1"])
def test_invalid_llm_output_falls_back_to_template(bad):
    out = _generate(_Factory(bad))
    assert not out.generated
    assert "Which one is better?" in out.text and out.text.endswith("?")


def test_llm_failure_falls_back_to_template_with_source_options():
    out = _generate(_Factory(exc=RuntimeError("down")))
    assert not out.generated
    assert "shop.example or docs.example" in out.text


def test_fallback_is_localized():
    text = cc.fallback_clarification("Welches ist besser?", ["A", "B", "C"], "de-DE")
    assert text.startswith("Können Sie") and "A, B oder C" in text
    assert cc.fallback_clarification("x", [], "xx").startswith("Could you tell me which")


def test_frame_entities_come_first_in_candidates():
    frame = TopicFrame(entities=("Galaxy S24",), terms=("phone",))
    assert cc.clarification_candidates(frame, [], PROJECT_ID)[:1] == ["Galaxy S24"]


def test_disabled_flag_returns_legacy_text(monkeypatch):
    monkeypatch.setenv("RAG_CHAT_CLARIFY", "0")
    factory = _Factory("unused?")
    out = _generate(factory)
    assert out.text == LEGACY_CLARIFICATION_TEXT and factory.prompts == []
