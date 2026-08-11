"""
Standalone background job worker process.

Usage:
    python -m app.worker
    # or via supervisor:
    # command=python -m app.worker
"""
from __future__ import annotations

import logging
import signal
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("app.worker")


def _setup_db() -> None:
    from .db import engine  # noqa: F401 — ensures DB is connected

    logger.info("Database connection established (engine=%s)", engine.url)


def _handle_signal(signum, frame) -> None:
    logger.info("Worker received signal %s — shutting down", signum)
    sys.exit(0)


def main() -> None:
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    from .settings import settings

    if not settings.enable_durable_jobs:
        logger.error("enable_durable_jobs is false — nothing to run")
        sys.exit(1)

    logger.info("RAGSuite background worker starting")
    _setup_db()

    from .services.job_queue import start_job_worker, wait_for_job_worker

    start_job_worker()
    if not wait_for_job_worker(timeout_sec=30.0):
        logger.error("Worker threads failed to start within 30s — exiting")
        sys.exit(1)

    logger.info("Worker threads running. Ctrl+C or SIGTERM to stop.")
    try:
        while True:
            time.sleep(5)
    except (KeyboardInterrupt, SystemExit):
        logger.info("Worker stopped")


if __name__ == "__main__":
    main()
