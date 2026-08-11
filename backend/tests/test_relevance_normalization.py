"""Tests for per-chunk relevance display normalization."""

from app.services.rag.rag import (
    normalize_chunk_relevance_pcts,
    chunk_relevance_pcts_from_distances,
    raw_chunk_similarity_pct_from_distances,
)


def test_normalize_spread_range():
    assert normalize_chunk_relevance_pcts([30, 60, 90]) == [0, 50, 100]


def test_normalize_single_chunk():
    assert normalize_chunk_relevance_pcts([42]) == [100]


def test_normalize_flat_values_use_rank():
    out = normalize_chunk_relevance_pcts([50, 50, 50, 50])
    assert out[0] == 100
    assert out[-1] == 20
    assert out == sorted(out, reverse=True)


def test_normalize_empty():
    assert normalize_chunk_relevance_pcts([]) == []


def test_chunk_relevance_pcts_from_distances():
    absolute, display = chunk_relevance_pcts_from_distances([0.0, 1.0, 0.5])
    assert absolute == raw_chunk_similarity_pct_from_distances([0.0, 1.0, 0.5])
    assert display == [100, 0, 50]
