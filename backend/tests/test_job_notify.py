"""Redis job notify + role routing (Postgres stays the job record)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.models import BackgroundJobType
from app.services import job_notify
from app.services.job_roles import (
    ROLE_CRAWL,
    ROLE_INDEX,
    ROLE_MISC,
    ROLE_SYNC,
    job_type_allowed,
    parse_worker_roles,
    role_for_job_type,
)


class _FakeRedis:
    def __init__(self) -> None:
        self.lists: dict[str, list[str]] = {}

    def rpush(self, key: str, value: str) -> int:
        self.lists.setdefault(key, []).append(value)
        return len(self.lists[key])

    def brpop(self, keys, timeout: int = 0):
        for key in keys:
            if self.lists.get(key):
                return (key, self.lists[key].pop(0))
        return None


def test_role_for_known_job_types():
    assert role_for_job_type(BackgroundJobType.CRAWL_FETCH.value) == ROLE_CRAWL
    assert role_for_job_type(BackgroundJobType.DOCUMENT_INGEST.value) == ROLE_INDEX
    assert role_for_job_type(BackgroundJobType.DOCUMENT_PARSE.value) == ROLE_INDEX
    assert role_for_job_type(BackgroundJobType.DOCUMENT_EMBED.value) == ROLE_INDEX
    assert role_for_job_type(BackgroundJobType.CONNECTOR_SYNC.value) == ROLE_SYNC
    assert role_for_job_type(BackgroundJobType.WEBHOOK_DELIVERY.value) == ROLE_MISC


def test_parse_worker_roles_all_and_subset():
    assert parse_worker_roles("all") == parse_worker_roles(None)
    assert parse_worker_roles("crawl") == frozenset({ROLE_CRAWL})
    assert parse_worker_roles("index,sync,misc") == frozenset({ROLE_INDEX, ROLE_SYNC, ROLE_MISC})


def test_index_worker_ignores_crawl_types():
    roles = parse_worker_roles("index,sync,misc")
    assert job_type_allowed(BackgroundJobType.DOCUMENT_INGEST.value, roles)
    assert job_type_allowed(BackgroundJobType.DOCUMENT_PARSE.value, roles)
    assert job_type_allowed(BackgroundJobType.DOCUMENT_EMBED.value, roles)
    assert not job_type_allowed(BackgroundJobType.CRAWL_FETCH.value, roles)


def test_notify_then_brpop_round_trip():
    fake = _FakeRedis()
    with patch("app.services.job_notify.get_redis", return_value=fake):
        assert job_notify.notify_job_id("job-1", BackgroundJobType.DOCUMENT_INGEST.value)
        popped = job_notify.brpop_job_id([ROLE_INDEX], timeout=1)
    assert popped == "job-1"
    assert fake.lists[job_notify.list_key(ROLE_INDEX)] == []


def test_brpop_skips_other_role_lists():
    fake = _FakeRedis()
    with patch("app.services.job_notify.get_redis", return_value=fake):
        job_notify.notify_job_id("crawl-1", BackgroundJobType.CRAWL_FETCH.value)
        assert job_notify.brpop_job_id([ROLE_INDEX], timeout=1) is None
        assert job_notify.brpop_job_id([ROLE_CRAWL], timeout=1) == "crawl-1"


def test_rehydrate_pushes_pending_ids():
    fake = _FakeRedis()
    with patch("app.services.job_notify.get_redis", return_value=fake):
        n = job_notify.rehydrate_ids(
            [
                ("a", BackgroundJobType.DOCUMENT_INGEST.value),
                ("b", BackgroundJobType.CRAWL_FETCH.value),
            ]
        )
    assert n == 2
    assert fake.lists[job_notify.list_key(ROLE_INDEX)] == ["a"]
    assert fake.lists[job_notify.list_key(ROLE_CRAWL)] == ["b"]


def test_notify_is_noop_without_redis():
    with patch("app.services.job_notify.get_redis", return_value=None):
        assert job_notify.notify_job_id("x", BackgroundJobType.DOCUMENT_INGEST.value) is False
        assert job_notify.brpop_job_id([ROLE_INDEX]) is None


def test_claim_by_id_second_call_misses_when_not_pending():
    from app.services.job_queue import claim_job_by_id

    job = MagicMock()
    job.job_type = BackgroundJobType.DOCUMENT_INGEST.value
    job.status = "RUNNING"
    job.retry_after = None
    db = MagicMock()
    db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = job
    with patch("app.services.job_queue._roles_for_worker", return_value=parse_worker_roles("index")):
        assert claim_job_by_id(db, "11111111-1111-1111-1111-111111111111") is None


def test_claim_by_id_wrong_role_requeues():
    from app.services.job_queue import claim_job_by_id

    job = MagicMock()
    job.id = "jid"
    job.job_type = BackgroundJobType.CRAWL_FETCH.value
    job.status = "PENDING"
    job.retry_after = None
    db = MagicMock()
    db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = job
    with patch("app.services.job_notify.notify_job") as notify:
        claimed = claim_job_by_id(
            db,
            "11111111-1111-1111-1111-111111111111",
            roles=parse_worker_roles("index"),
        )
    assert claimed is None
    notify.assert_called_once_with(job)
    db.rollback.assert_called()
