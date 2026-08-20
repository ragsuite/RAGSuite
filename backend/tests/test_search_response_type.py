"""Tests for search response type (short vs long) resolution."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.schemas import RagQuery, ResponseType
from app.services.search_run_context import (
    _SHORT_RESPONSE_MAX_TOKENS,
    _LONG_RESPONSE_MAX_TOKENS,
    _effective_max_tokens,
)
from app.services.rag.rag import RAG


class FakeSearchSettings:
    def __init__(self, search_max_tokens=None, response_type=None):
        self.search_max_tokens = search_max_tokens
        self.search_response_config = (
            {"response_type": response_type} if response_type else None
        )


def test_effective_max_tokens_short_caps_saved_limit():
    req = RagQuery(query="test", use_saved_rag_params=True)
    settings = FakeSearchSettings(search_max_tokens=4096)
    assert _effective_max_tokens(
        req, settings, ResponseType.SHORT.value, auth_type="widget"
    ) == _SHORT_RESPONSE_MAX_TOKENS


def test_effective_max_tokens_long_uses_saved_limit():
    req = RagQuery(query="test", use_saved_rag_params=True)
    settings = FakeSearchSettings(search_max_tokens=2000)
    assert _effective_max_tokens(
        req, settings, ResponseType.LONG.value, auth_type="widget"
    ) == 2000


def test_effective_max_tokens_dashboard_short_caps_request():
    req = RagQuery(query="test", maxTokens=4096, use_saved_rag_params=False)
    assert _effective_max_tokens(
        req, FakeSearchSettings(4096), ResponseType.SHORT.value, auth_type="user"
    ) == _SHORT_RESPONSE_MAX_TOKENS


def test_effective_max_tokens_dashboard_short_rejects_below_200():
    req = RagQuery(query="test", maxTokens=100, use_saved_rag_params=False)
    with pytest.raises(HTTPException) as exc:
        _effective_max_tokens(
            req, None, ResponseType.SHORT.value, auth_type="user"
        )
    assert exc.value.status_code == 400


def test_effective_max_tokens_defaults():
    req = RagQuery(query="test", use_saved_rag_params=False)
    assert _effective_max_tokens(
        req, None, ResponseType.SHORT.value, auth_type="user"
    ) == _SHORT_RESPONSE_MAX_TOKENS
    assert _effective_max_tokens(
        req, None, ResponseType.LONG.value, auth_type="user"
    ) == _LONG_RESPONSE_MAX_TOKENS


def test_cache_key_includes_format_type():
    rag = RAG.__new__(RAG)
    _, short_key = rag._make_cache_keys(
        "hello", 5, 2000, False, user_id=1, project_id="p1", format_type="html_short"
    )
    _, long_key = rag._make_cache_keys(
        "hello", 5, 2000, False, user_id=1, project_id="p1", format_type="html_long"
    )
    assert short_key != long_key


def test_build_prompt_short_has_no_bullet_style():
    rag = RAG.__new__(RAG)
    prompt = rag._build_prompt(
        "What is X?",
        "Doc content here.",
        5,
        False,
        mode="search",
        format_type="html_short",
    )
    assert "80-90 words" in prompt
    assert "concise bullets" not in prompt


def test_build_prompt_long_has_sections():
    rag = RAG.__new__(RAG)
    prompt = rag._build_prompt(
        "What is X?",
        "Doc content here.",
        5,
        False,
        mode="search",
        format_type="html_long",
    )
    assert "HTML only" in prompt
    assert "<mark>" in prompt
    assert "<strong>Label:</strong>" in prompt
    assert "150–350 words" in prompt or "150-350 words" in prompt
    assert "80–220 words" not in prompt and "80-220 words" not in prompt
    assert "Never bold words or phrases inside sentences" in prompt
    assert "ACCURACY:" in prompt
    assert "Do NOT use <h2>Summary</h2>" in prompt
    assert "Required closing <p>" in prompt
    assert "exactly 1–2 short complete sentences" in prompt or "exactly 1-2 short complete sentences" in prompt
    assert "Always end with 1–2 closing sentences" in prompt or "Always end with 1-2 closing sentences" in prompt
    assert "300-700 words" not in prompt
    assert "Use <strong> for key terms" not in prompt


def test_rag_query_accepts_response_type():
    req = RagQuery(query="test", response_type=ResponseType.SHORT)
    assert req.response_type == ResponseType.SHORT
