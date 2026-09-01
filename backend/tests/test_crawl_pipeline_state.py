"""Pipeline state derivation for crawl sources."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock

from app.models import CrawlJobStatus


def test_derive_pipeline_state_ready_when_completed_with_target_vectors():
    from app.routes.crawl import _derive_pipeline_state

    source = MagicMock()
    source.trained_at = None
    job = MagicMock()
    job.status = CrawlJobStatus.COMPLETED

    pipeline_status, is_search_ready = _derive_pipeline_state(
        source,
        job,
        has_target_vectors=True,
    )

    assert pipeline_status == "ready"
    assert is_search_ready is True


def test_derive_pipeline_state_failed_when_completed_without_vectors():
    from app.routes.crawl import _derive_pipeline_state

    source = MagicMock()
    source.trained_at = None
    job = MagicMock()
    job.status = CrawlJobStatus.COMPLETED

    pipeline_status, is_search_ready = _derive_pipeline_state(
        source,
        job,
        has_target_vectors=False,
    )

    assert pipeline_status == "failed"
    assert is_search_ready is False


def test_derive_pipeline_state_ready_when_trained_at_set():
    from app.routes.crawl import _derive_pipeline_state

    source = MagicMock()
    source.trained_at = datetime.now(timezone.utc)
    job = MagicMock()
    job.status = CrawlJobStatus.COMPLETED

    pipeline_status, is_search_ready = _derive_pipeline_state(source, job)

    assert pipeline_status == "ready"
    assert is_search_ready is True
