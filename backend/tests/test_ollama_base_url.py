"""Ollama clients honour OLLAMA_BASE_URL (Docker reaches the host via host.docker.internal)."""
from __future__ import annotations

import pytest

from app.services.llm_error_messages import (
    format_crawl_indexing_error,
    format_embed_error_for_crawl,
)
from app.settings import settings

DOCKER_URL = "http://host.docker.internal:11434"
OLLAMA_REFUSED = (
    "Failed to connect to Ollama. Please check that Ollama is downloaded, running and accessible. "
    "https://ollama.com/download"
)


@pytest.fixture()
def docker_ollama_url(monkeypatch):
    monkeypatch.setattr(settings, "ollama_base_url", DOCKER_URL)
    return DOCKER_URL


def test_llm_factory_ollama_uses_configured_base_url(docker_ollama_url):
    from app.services.llmconn import LLMFactory

    LLMFactory._instances.clear()
    try:
        llm = LLMFactory.get_llm("ollama", "qwen3:4b", allow_ollama_fallback=False)
        assert llm.base_url == docker_ollama_url
        default_llm = LLMFactory.get_llm("custom-llm", "custom-default", allow_ollama_fallback=False)
        assert default_llm.base_url == docker_ollama_url
    finally:
        LLMFactory._instances.clear()


@pytest.mark.parametrize(
    ("configured", "expected"),
    [
        (DOCKER_URL, f"{DOCKER_URL}/v1"),
        (f"{DOCKER_URL}/", f"{DOCKER_URL}/v1"),
        (f"{DOCKER_URL}/v1", f"{DOCKER_URL}/v1"),
    ],
)
def test_ai_assistant_ollama_base_appends_v1_once(monkeypatch, configured, expected):
    from app.platform.module_bootstrap import ensure_ragsuite_modules_path

    ensure_ragsuite_modules_path()
    from ragsuite_modules.ai_assistant.backend.agent import _openai_compatible_base

    monkeypatch.setattr(settings, "ollama_base_url", configured)

    assert _openai_compatible_base("ollama", None) == (expected, "ollama")
    assert _openai_compatible_base("ollama", "http://custom:1234/v1")[0] == "http://custom:1234/v1"


def test_crawl_error_names_unreachable_ollama(docker_ollama_url):
    message = format_embed_error_for_crawl(OLLAMA_REFUSED)

    assert message.startswith(f"Cannot reach Ollama at {docker_ollama_url}")


@pytest.mark.parametrize(
    "raw",
    ["Indexing Failed", "Indexing failed: Indexing Failed", "Indexing failed: Indexing failed: boom"],
)
def test_crawl_indexing_error_prefix_appears_once(raw):
    message = format_crawl_indexing_error(raw)

    assert message.startswith("Indexing failed: ")
    assert message.lower().count("indexing failed:") == 1


def test_crawl_indexing_error_keeps_friendly_text(docker_ollama_url):
    assert format_crawl_indexing_error(OLLAMA_REFUSED) == (
        f"Indexing failed: Cannot reach Ollama at {docker_ollama_url}. "
        "Start Ollama and make sure the RAGSuite server can reach it."
    )
