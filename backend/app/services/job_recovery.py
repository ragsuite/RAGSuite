"""Startup recovery for durable background jobs.

Two kinds of recovery with different safety rules:

* ``recover_jobs_orphaned_by_restart`` resets *every* RUNNING crawl / ingest job
  (and clears running reindex rows). Only call it from the process that owns the
  job worker threads, right before they start. API processes restart
  independently (gunicorn ``max_requests`` recycling) while the standalone worker
  is still mid-job; resetting there re-queues live work and double-claims it.
* ``recover_stale_jobs`` only touches jobs past their stale timeouts, so it is safe
  from any process (the scheduler also runs it periodically).
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def recover_jobs_orphaned_by_restart() -> None:
    from .job_queue import (
        reset_running_crawl_jobs,
        reset_stale_ingest_jobs,
        reset_stale_reindex_jobs,
    )

    reset_stale_reindex_jobs()
    reset_running_crawl_jobs()
    reset_stale_ingest_jobs()


def recover_stale_jobs() -> None:
    from .job_queue import (
        cleanup_stale_crawl_jobs,
        reset_all_stale_running_jobs,
        reset_stale_crawl_ingest_batch_jobs,
        sweep_orphaned_indexing_crawl_jobs,
    )

    cleanup_stale_crawl_jobs()
    reset_stale_crawl_ingest_batch_jobs()
    sweep_orphaned_indexing_crawl_jobs()
    reset_all_stale_running_jobs()


def recover_jobs_on_worker_start() -> None:
    """Full recovery for the process that is about to start job worker threads."""
    recover_jobs_orphaned_by_restart()
    recover_stale_jobs()
