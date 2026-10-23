"""Retrieve knobs: null columns keep today's path; presets write the confirmed floats."""
from app.services.rag.hybrid_fusion import KEYWORD_WEIGHT, SEMANTIC_WEIGHT
from app.services.rag.retrieve_knobs import (
    SMALL_KEYWORD_WEIGHT,
    SMALL_SEMANTIC_WEIGHT,
    apply_chat_query_threshold,
    clamp_candidates,
    clamp_keyword_blend,
    fusion_weights,
    pool_size,
    resolve_threshold_write,
)


def test_null_candidates_uses_legacy_overfetch():
    assert pool_size(8, None) == 24
    assert pool_size(5, None) == 15


def test_candidates_64_top_k_8_pool_is_64():
    assert pool_size(8, 64) == 64
    assert clamp_candidates(64, 8) == 64


def test_candidates_below_top_k_raises_to_top_k():
    assert pool_size(20, 16) == 20


def test_balanced_write_is_effective_chat_045():
    preset, value = resolve_threshold_write("chat", "balanced", None)
    assert preset == "balanced"
    assert value == 0.45
    preset_s, value_s = resolve_threshold_write("search", "balanced", None)
    assert preset_s == "balanced"
    assert value_s == 0.45


def test_legacy_chat_threshold_still_clamped():
    assert apply_chat_query_threshold(0.5, None) == 0.45
    assert apply_chat_query_threshold(None, None) == 0.3
    assert apply_chat_query_threshold(0.5, "balanced") == 0.45


def test_strict_and_custom_bypass_legacy_cap():
    assert apply_chat_query_threshold(0.55, "strict") == 0.55
    assert apply_chat_query_threshold(0.7, "custom") == 0.7


def test_null_keyword_blend_keeps_live_fusion_weights():
    assert fusion_weights(None, large=True) == (SEMANTIC_WEIGHT, KEYWORD_WEIGHT)
    assert fusion_weights(None, large=False) == (SMALL_SEMANTIC_WEIGHT, SMALL_KEYWORD_WEIGHT)
    assert clamp_keyword_blend(None) is None


def test_keyword_blend_maps_vector_and_keyword_weights():
    assert fusion_weights(1.0, large=True) == (1.0, 0.0)
    assert fusion_weights(0.0, large=False) == (0.0, 1.0)
    assert fusion_weights(0.5, large=True) == (0.5, 0.5)
    assert clamp_keyword_blend(1.4) == 1.0
    assert clamp_keyword_blend(-0.2) == 0.0
