"""Reward memory maths: source reorder, preference block, similarity ranking (no DB)."""
from __future__ import annotations

import numpy as np
import pytest

from app.services.feedback_training import guidance, hook, memory, reward
from app.services.feedback_training.memory import Example, Match


def _match(reward_value, urls=(), tags=(), weight=None, similarity=0.9, **extra):
    weight = float(reward_value) if weight is None else weight
    example = Example(
        id=f"ex-{reward_value}-{len(urls)}-{weight}",
        reward=reward_value,
        query_text="q",
        reason_tags=tuple(tags),
        cited_urls=tuple(urls),
        **extra,
    )
    return Match(example, similarity, weight)


def _entries(*urls):
    return [{"doc": f"d{i}", "id": f"c{i}", "meta": {"url": u}, "dist": 0.1 * i} for i, u in enumerate(urls)]


def test_normalize_url_ignores_case_trailing_slash_and_fragment():
    assert reward.normalize_url("HTTPS://Shop.Example/Page/#top") == "https://shop.example/Page"
    assert reward.normalize_url("https://shop.example/p?id=2") == "https://shop.example/p?id=2"
    assert reward.normalize_url("") == ""


def test_liked_sources_move_up_without_dropping_anything():
    entries = _entries("https://a.example/1", "https://b.example/2", "https://c.example/3")
    out, info = reward.rerank_entries(entries, [_match(1, urls=["https://c.example/3/"])])
    assert [e["id"] for e in out] == ["c2", "c0", "c1"]
    assert info == {"applied": True, "reason": "ok", "boosted": 1, "demoted": 0}
    assert sorted(e["id"] for e in out) == sorted(e["id"] for e in entries)


def test_disliked_sources_sink_only_for_source_blaming_reasons():
    entries = _entries("https://a.example/1", "https://b.example/2")
    out, info = reward.rerank_entries(entries, [_match(-1, urls=["https://a.example/1"], tags=["hallucinated"])])
    assert [e["id"] for e in out] == ["c1", "c0"]
    assert info["demoted"] == 1

    out, info = reward.rerank_entries(entries, [_match(-1, urls=["https://a.example/1"], tags=["poor_formatting"])])
    assert out == entries
    assert info == {"applied": False, "reason": "no_source_signal"}


def test_untagged_dislike_blames_sources_and_penalty_is_half_scale():
    assert reward.blames_sources(-1, []) is True
    assert reward.blames_sources(1, ["incorrect"]) is False
    scores = reward.url_scores([_match(-1, urls=["https://a.example/x"], weight=-0.8)])
    assert scores == {"https://a.example/x": pytest.approx(-0.4)}


def test_url_scores_are_clamped():
    matches = [_match(1, urls=["https://a.example/"], weight=0.9) for _ in range(3)]
    assert reward.url_scores(matches) == {"https://a.example/": 1.0}


def test_reorder_is_stable_for_equal_scores():
    entries = _entries("https://a.example/1", "https://x.example/1", "https://a.example/1", "https://y.example/1")
    out, _ = reward.rerank_entries(entries, [_match(1, urls=["https://a.example/1"])])
    assert [e["id"] for e in out] == ["c0", "c2", "c1", "c3"]


def test_no_reorder_without_matches():
    entries = _entries("https://a.example/1")
    assert reward.rerank_entries(entries, []) == (entries, {"applied": False, "reason": "no_match"})


def test_preference_block_maps_tags_and_always_ends_with_documents_rule():
    block = guidance.preference_block(
        [
            _match(1, tags=["clear", "complete"], answer_profile={"words": 40, "has_list": True}),
            _match(-1, tags=["too_technical"], guidance="Lead with the price.", user_comment='Too "long"\n here'),
        ]
    )
    lines = block.splitlines()
    assert lines[0].startswith("ANSWER PREFERENCES")
    assert "- Keep: Use clear, simple wording." in lines
    assert "- Avoid: Avoid jargon; explain in plain language." in lines
    assert any("short (under 80 words), using a list" in line for line in lines)
    assert "- Admin guidance for similar questions: \"Lead with the price.\"" in lines
    assert "- A user disliked a similar answer and said: \"Too 'long' here\"" in lines
    assert lines[-1] == guidance.CLOSING_RULE


def test_preference_block_empty_without_signal():
    assert guidance.preference_block([]) == ""
    assert guidance.preference_block([_match(-1, tags=["slow_response"])]) == ""


def test_preference_text_is_bounded():
    block = guidance.preference_block([_match(1, guidance="x " * 2000)])
    assert len(block) < guidance.GUIDANCE_MAX_CHARS + 400


def test_score_scales_between_floor_and_one():
    assert memory.score(1.0, 1, floor=0.8) == pytest.approx(1.0)
    assert memory.score(0.9, -1, floor=0.8) == pytest.approx(-0.5)
    assert memory.score(0.8, 1, floor=0.8) == pytest.approx(memory.MIN_WEIGHT)


def test_rank_keeps_similar_same_dimension_examples_best_first():
    examples = [Example(id=k, reward=1, query_text=k) for k in ("near", "far", "other_dim", "best")]
    vectors = {
        "near": np.array([1.0, 0.3], dtype=np.float32),
        "far": np.array([0.0, 1.0], dtype=np.float32),
        "other_dim": np.array([1.0, 0.0, 0.0], dtype=np.float32),
        "best": np.array([1.0, 0.0], dtype=np.float32),
    }
    ranked = memory.rank(examples, vectors, [1.0, 0.0], floor=0.9)
    assert [m.example.id for m in ranked] == ["best", "near"]
    assert memory.rank(examples, vectors, [0.0, 0.0], floor=0.9) == []


def test_hook_passes_entries_through_when_nothing_matches(monkeypatch):
    entries = _entries("https://a.example/1")
    monkeypatch.setattr(memory, "match", lambda *a: [])
    assert hook.apply(entries, "p", [1.0], object()) == (entries, {"applied": False, "reason": "no_match"})
    assert hook.preference_instruction({}) == ""
    assert hook.preference_instruction(None) == ""


def test_match_is_disabled_by_env_and_safe_on_errors(monkeypatch):
    monkeypatch.setenv("FEEDBACK_MEMORY_ENABLED", "false")
    assert memory.match("p", [1.0], object()) == []
    monkeypatch.setenv("FEEDBACK_MEMORY_ENABLED", "true")

    def boom(_project_id):
        raise RuntimeError("db down")

    monkeypatch.setattr(memory, "_memory", boom)
    assert memory.match("p", [1.0], object()) == []
