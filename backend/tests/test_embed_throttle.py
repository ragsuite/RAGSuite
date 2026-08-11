"""Tests for hosted embedding throttle."""
import threading
import time

from app.services.embed_throttle import hosted_embed_slot, reset_embed_throttle_for_tests


class _FakeHosted:
    pass


def test_hosted_embed_slot_serializes_calls(monkeypatch):
    reset_embed_throttle_for_tests()
    monkeypatch.setattr(
        "app.services.embed_throttle._hosted_embed_model_types",
        lambda: (_FakeHosted,),
    )
    monkeypatch.setattr("app.services.embed_throttle._get_semaphore", lambda: threading.Semaphore(1))

    order: list[int] = []
    barrier = threading.Barrier(2)

    def worker(tag: int) -> None:
        with hosted_embed_slot(_FakeHosted()):
            order.append(tag)
            time.sleep(0.05)
        barrier.wait()

    t1 = threading.Thread(target=worker, args=(1,))
    t2 = threading.Thread(target=worker, args=(2,))
    t1.start()
    time.sleep(0.01)
    t2.start()
    t1.join(timeout=2)
    t2.join(timeout=2)
    assert order == [1, 2]
