"""Enhance-index gate, prompt templates, and short OOC."""
from unittest.mock import MagicMock

from app.services.rag import llm_chunk_context as lc
from app.services.rag.prompt_templates import HELPFUL_PROMPT, STRICT_PROMPT, prompt_for
from app.services.rag.rag import RAG


def test_enhance_false_never_enqueues(monkeypatch):
    monkeypatch.setenv("RAG_LLM_CONTEXT_ENABLED", "true")
    monkeypatch.setenv("RAG_LLM_CONTEXT_MIN_CHUNKS", "8")
    common = dict(project_id="p", user_id=1, document_id="d", collection="c")
    assert lc.maybe_enqueue(name="/tmp/a.pdf", chunk_count=40, enhance_index=False, **common) is False


def test_enhance_null_keeps_env_gate(monkeypatch):
    monkeypatch.setenv("RAG_LLM_CONTEXT_ENABLED", "false")
    monkeypatch.setenv("RAG_LLM_CONTEXT_MIN_CHUNKS", "8")
    common = dict(project_id="p", user_id=1, document_id="d", collection="c")
    assert lc.maybe_enqueue(name="/tmp/a.pdf", chunk_count=40, enhance_index=None, **common) is False


def test_strict_template_is_in_build_prompt():
    rag = object.__new__(RAG)
    prompt = rag._build_prompt(
        "What is the warranty?",
        "Warranty is 1 year.",
        top_k=5,
        generate_topk=False,
        system_prompt=prompt_for("strict"),
        mode="chat",
    )
    assert "sources-only" in prompt.lower() or "do not invent" in prompt.lower()
    assert STRICT_PROMPT.split(".")[0] in prompt


def test_chat_prompt_copies_quantities_from_spans():
    rag = object.__new__(RAG)
    kwargs = dict(top_k=5, generate_topk=False)
    chat = rag._build_prompt("What was the mass?", "Launch mass 1380 kg.", mode="chat", **kwargs)
    search = rag._build_prompt("What was the mass?", "Launch mass 1380 kg.", mode="search", **kwargs)
    assert "copy that span into the answer verbatim" in chat
    assert "copy that span into the answer verbatim" not in search


def test_helpful_template_is_current_tone():
    assert "helpful AI chatbot" in HELPFUL_PROMPT
    rag = object.__new__(RAG)
    prompt = rag._build_prompt(
        "Hello",
        "About us.",
        top_k=5,
        generate_topk=False,
        system_prompt=prompt_for("helpful"),
        mode="chat",
    )
    assert "helpful AI chatbot" in prompt


def test_empty_retrieve_stays_short_ooc():
    assert "QUERY_OUT_OF_CONTEXT" not in RAG.OUT_OF_CONTEXT_MSG
    assert len(RAG.OUT_OF_CONTEXT_MSG) < 280
    sentinel = RAG._extract_custom_ooc_reply
    assert callable(sentinel)
