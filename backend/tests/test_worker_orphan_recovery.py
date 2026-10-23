"""Worker × N must not double-reset running crawls on boot."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.services import job_recovery


def test_second_worker_skips_orphan_reset():
    redis = MagicMock()
    redis.set.return_value = False
    with patch("app.services.redis_client.get_redis", return_value=redis), patch.object(
        job_recovery, "recover_jobs_orphaned_by_restart"
    ) as orphan, patch.object(job_recovery, "recover_stale_jobs") as stale:
        job_recovery.recover_jobs_on_worker_start()
    orphan.assert_not_called()
    stale.assert_called_once()


def test_first_worker_runs_orphan_reset():
    redis = MagicMock()
    redis.set.return_value = True
    with patch("app.services.redis_client.get_redis", return_value=redis), patch.object(
        job_recovery, "recover_jobs_orphaned_by_restart"
    ) as orphan, patch.object(job_recovery, "recover_stale_jobs") as stale:
        job_recovery.recover_jobs_on_worker_start()
    orphan.assert_called_once()
    stale.assert_called_once()


def test_no_redis_still_recovers():
    with patch("app.services.redis_client.get_redis", return_value=None), patch.object(
        job_recovery, "recover_jobs_orphaned_by_restart"
    ) as orphan, patch.object(job_recovery, "recover_stale_jobs") as stale:
        job_recovery.recover_jobs_on_worker_start()
    orphan.assert_called_once()
    stale.assert_called_once()
