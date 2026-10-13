"""Answer/retrieval cache keys: KB generation, first turn only, inputs that shape answers."""
import pytest

from app.services.rag import answer_cache, kb_generation


class _FakeRedis:
    def __init__(self):
        self.value = 0

    def get(self, _key):
        return str(self.value)

    def incr(self, _key):
        self.value += 1


@pytest.fixture
def redis(monkeypatch):
    fake = _FakeRedis()
    monkeypatch.setattr(kb_generation, "get_redis", lambda: fake)
    return fake


def test_variant_changes_with_generation_and_inputs(redis):
    base = answer_cache.variant("pq", None, {"mode": "chat"})
    assert base == answer_cache.variant("pq", None, {"mode": "chat"})
    assert base != answer_cache.variant("pq2", None, {"mode": "chat"})
    assert base != answer_cache.variant("pq", None, {"mode": "search"})
    kb_generation.bump()
    assert base != answer_cache.variant("pq", None, {"mode": "chat"})


def test_follow_ups_and_missing_redis_skip_caching(redis, monkeypatch):
    assert answer_cache.variant("pq", None, {}, [{"role": "user", "content": "hi"}]) is None
    monkeypatch.setattr(kb_generation, "get_redis", lambda: None)
    assert answer_cache.variant("pq", None, {}) is None


def test_item_rows_are_part_of_the_key(redis):
    class Items:
        def __init__(self, block):
            self.block = block

        def prompt_block(self, _ids):
            return self.block

    assert answer_cache.variant("pq", Items("a 100"), {}) != answer_cache.variant("pq", Items("a 120"), {})


def test_retrieval_cache_copies_and_invalidates(redis):
    cache = answer_cache.RetrievalCache(max_entries=2, ttl=60)
    key = cache.key({"text": "phones"})
    cache.put(key, (["doc"], ["id"], [{}], [0.1], {"retrieval_ms": 40}))
    hit = cache.get(key)
    hit[4]["retrieval_ms"] = 0
    assert cache.get(key)[4]["retrieval_ms"] == 40
    kb_generation.bump()
    assert cache.get(cache.key({"text": "phones"})) is None


def test_retrieval_cache_evicts_oldest(redis):
    cache = answer_cache.RetrievalCache(max_entries=2, ttl=60)
    keys = [cache.key({"text": str(i)}) for i in range(3)]
    for k in keys:
        cache.put(k, ([k], [], [], [], {}))
    assert cache.get(keys[0]) is None and cache.get(keys[2]) is not None
