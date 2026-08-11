"""Thin helpers that check settings for job-queue routing decisions.

Kept in a separate module so routes can import without pulling in the full
job_queue module (avoids circular import chains).
"""
from ..settings import settings


def use_durable_reindex() -> bool:
    """True when reindex should go through the durable job queue."""
    return bool(getattr(settings, "enable_durable_jobs", False))
