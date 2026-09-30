"""Process role flags that must be known before the DB engine is created."""
from __future__ import annotations

import os

JOB_WORKER_PROCESS_ENV = "RAGSUITE_JOB_WORKER_PROCESS"


def mark_job_worker_process() -> None:
    """Call before importing ``app.platform.db`` in the standalone worker."""
    os.environ[JOB_WORKER_PROCESS_ENV] = "1"


def is_job_worker_process() -> bool:
    return os.environ.get(JOB_WORKER_PROCESS_ENV) == "1"
