"""Tests for dense-language chat max_tokens multiplier."""
from __future__ import annotations

from app.services.chat_token_budget import (
    apply_dense_language_chat_budget,
    is_dense_chat_language,
)


def test_is_dense_chat_language_detects_hi_zh_ar():
    assert is_dense_chat_language("hi") is True
    assert is_dense_chat_language("hi-IN") is True
    assert is_dense_chat_language("zh") is True
    assert is_dense_chat_language("zh-CN") is True
    assert is_dense_chat_language("ar") is True
    assert is_dense_chat_language("ar-SA") is True


def test_is_dense_chat_language_skips_latin():
    assert is_dense_chat_language("en") is False
    assert is_dense_chat_language("en-GB") is False
    assert is_dense_chat_language("es") is False
    assert is_dense_chat_language("fr") is False
    assert is_dense_chat_language("de") is False
    assert is_dense_chat_language("pt") is False
    assert is_dense_chat_language(None) is False
    assert is_dense_chat_language("") is False


def test_hindi_multiplier_raises_adaptive_budget():
    assert apply_dense_language_chat_budget(500, "hi") == 750
    assert apply_dense_language_chat_budget(1000, "hi-IN") == 1500


def test_english_budget_unchanged():
    assert apply_dense_language_chat_budget(500, "en") == 500
    assert apply_dense_language_chat_budget(1000, "en-GB") == 1000
    assert apply_dense_language_chat_budget(800, None) == 800


def test_dense_budget_clamps_to_ceiling():
    assert apply_dense_language_chat_budget(2500, "zh") == 3000
    assert apply_dense_language_chat_budget(3000, "ar") == 3000
