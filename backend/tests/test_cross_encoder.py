"""Reranker loader: failure memo, bundled model source and latency budget."""
import sys
import types

import pytest

from app.services.rag import cross_encoder, cross_encoder_probe

REAL_MEASURE = cross_encoder_probe.measure


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    cross_encoder.reset_for_tests()
    monkeypatch.setattr(cross_encoder.cross_encoder_probe, "measure", lambda *_a, **_k: None)
    yield
    cross_encoder.reset_for_tests()


def _fake_sentence_transformers(monkeypatch, factory):
    module = types.ModuleType("sentence_transformers")
    module.CrossEncoder = factory
    monkeypatch.setitem(sys.modules, "sentence_transformers", module)


def test_failed_load_is_not_retried_on_every_query(monkeypatch):
    attempts = []

    def failing(*_args, **_kwargs):
        attempts.append(1)
        raise OSError("offline")

    _fake_sentence_transformers(monkeypatch, failing)
    assert cross_encoder.get() is None
    assert cross_encoder.get() is None
    assert len(attempts) == 1


def test_load_retried_after_the_memo_expires(monkeypatch):
    calls = []

    def factory(source, **kwargs):
        calls.append((source, kwargs["max_length"]))
        if len(calls) == 1:
            raise OSError("offline")
        return object()

    _fake_sentence_transformers(monkeypatch, factory)
    assert cross_encoder.get() is None
    cross_encoder._State.failed_at -= cross_encoder.RETRY_AFTER_SECONDS + 1
    assert cross_encoder.get() is not None
    assert calls[-1][1] == cross_encoder.MAX_LENGTH


def test_bundled_copy_used_without_configuration(monkeypatch, tmp_path):
    (tmp_path / "config.json").write_text("{}")
    monkeypatch.setattr(cross_encoder, "CONFIGURED_MODEL", "")
    monkeypatch.setattr(cross_encoder, "BUNDLED_MODEL_DIR", str(tmp_path))
    assert cross_encoder.model_source() == str(tmp_path)
    monkeypatch.setattr(cross_encoder, "CONFIGURED_MODEL", "org/other-reranker")
    assert cross_encoder.model_source() == "org/other-reranker"


def test_candidate_limit_follows_measured_latency(monkeypatch):
    monkeypatch.setattr(cross_encoder, "BUDGET_MS", 800.0)
    assert cross_encoder.candidate_limit(30, 5) == 30
    cross_encoder.record_latency(30, 30 * 40.0)
    assert cross_encoder.candidate_limit(30, 5) == 20
    cross_encoder.record_latency(10, 10 * 200.0)
    assert cross_encoder.candidate_limit(30, 5) == 9
    cross_encoder.record_latency(10, 10 * 900.0)
    assert cross_encoder.candidate_limit(30, 5) == 0


def test_model_is_calibrated_on_load(monkeypatch):
    class Model:
        def predict(self, pairs, **_kwargs):
            return [0.0] * len(pairs)

    _fake_sentence_transformers(monkeypatch, lambda *_a, **_k: Model())
    assert cross_encoder.get() is not None
    assert cross_encoder._State.pair_ms is not None


def test_query_never_waits_for_the_model_load(monkeypatch):
    import threading

    release = threading.Event()

    class Model:
        def predict(self, pairs, **_kwargs):
            return [0.0] * len(pairs)

    def slow_factory(*_a, **_k):
        release.wait(5)
        return Model()

    _fake_sentence_transformers(monkeypatch, slow_factory)
    assert cross_encoder.ready() is False
    loader = cross_encoder._State.loader
    assert loader is not None and loader.is_alive()
    assert cross_encoder.ready() is False
    assert cross_encoder._State.loader is loader
    release.set()
    loader.join(5)
    assert cross_encoder.ready() is True


def test_model_released_when_host_cannot_fit_the_minimum_pool(monkeypatch):
    class SlowModel:
        def predict(self, pairs, **_kwargs):
            return [0.0] * len(pairs)

    _fake_sentence_transformers(monkeypatch, lambda *_a, **_k: SlowModel())
    monkeypatch.setattr(cross_encoder, "_calibrate", lambda _m: cross_encoder.record_latency(4, 4 * 400.0))
    monkeypatch.setattr(cross_encoder, "BUDGET_MS", 800.0)
    assert cross_encoder.get() is None
    assert cross_encoder._State.model is None
    assert cross_encoder.ready() is False
    assert cross_encoder._State.loader is None
    assert cross_encoder.unavailable_reason() == "over_latency_budget"


def test_too_slow_host_never_loads_the_model(monkeypatch):
    loads = []
    _fake_sentence_transformers(monkeypatch, lambda *_a, **_k: loads.append(1))
    monkeypatch.setattr(cross_encoder.cross_encoder_probe, "measure", lambda *_a, **_k: 500.0)
    monkeypatch.setattr(cross_encoder, "BUDGET_MS", 800.0)
    assert cross_encoder.get() is None
    assert loads == [] and cross_encoder.unavailable_reason() == "over_latency_budget"


def test_probe_result_is_shared_through_redis(monkeypatch):
    from app.services.rag import cross_encoder_probe as probe

    class FakeRedis:
        def __init__(self):
            self.data = {}

        def get(self, key):
            return self.data.get(key)

        def set(self, key, value, nx=False, ex=None):
            if nx and key in self.data:
                return False
            self.data[key] = value
            return True

        def delete(self, key):
            self.data.pop(key, None)

        def exists(self, key):
            return key in self.data

    redis = FakeRedis()
    runs = []
    monkeypatch.setattr(probe, "get_redis", lambda: redis)
    monkeypatch.setattr(probe, "_run_child", lambda *_a: runs.append(1) or 412.5)
    assert REAL_MEASURE("src", "model", 256, 4) == 412.5
    assert REAL_MEASURE("src", "model", 256, 4) == 412.5
    assert runs == [1] and not any(k.endswith(":lock") for k in redis.data)
