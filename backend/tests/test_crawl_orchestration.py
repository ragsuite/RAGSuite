"""Crawl orchestration: enqueue without inline duplicate."""
from unittest.mock import MagicMock, patch
import uuid

import pytest
from fastapi import HTTPException

from app.services.crawl_orchestration import CrawlStartTrigger, start_crawl_for_source


@pytest.fixture
def mock_db():
    return MagicMock()


def test_start_creates_waiting_job_when_crawl_limit_reached(mock_db):
    """At capacity, crawls queue as WAITING (202) instead of 429."""
    source_id = uuid.uuid4()
    job_id = uuid.uuid4()
    source = MagicMock()
    source.name = "Example Site"
    source.created_by_id = 1
    waiting_job = MagicMock()
    waiting_job.id = job_id
    waiting_job.queued_at = MagicMock()

    with patch(
        "app.services.crawl_orchestration.source_has_active_crawl",
        return_value=False,
    ):
        with patch(
            "app.services.crawl_orchestration.assert_can_start_crawl",
            side_effect=ValueError("limit"),
        ):
            with patch(
                "app.services.crawl_orchestration.create_crawl_job",
                return_value=job_id,
            ) as mock_create:
                mock_db.query.return_value.filter.return_value.first.side_effect = [
                    source,
                    waiting_job,
                ]
                result = start_crawl_for_source(
                    mock_db,
                    source_id,
                    user_id=1,
                    trigger=CrawlStartTrigger.MANUAL,
                )
    mock_create.assert_called_once()
    assert mock_create.call_args[1]["initial_status"].value == "WAITING"
    assert result.http_status == 202
    assert result.enqueue_status == "waiting"


def test_start_raises_409_when_active_crawl(mock_db):
    source_id = uuid.uuid4()
    with patch(
        "app.services.crawl_orchestration.source_has_active_crawl",
        return_value=True,
    ):
        with pytest.raises(HTTPException) as exc:
            start_crawl_for_source(
                mock_db,
                source_id,
                user_id=1,
                trigger=CrawlStartTrigger.MANUAL,
            )
        assert exc.value.status_code == 409


def test_durable_jobs_enqueue_only_no_inline_task(mock_db):
    source_id = uuid.uuid4()
    job_id = uuid.uuid4()
    job = MagicMock()
    job.id = job_id
    job.queued_at = MagicMock()

    with patch("app.services.crawl_orchestration.source_has_active_crawl", return_value=False):
        with patch("app.services.crawl_orchestration.assert_can_start_crawl"):
            with patch(
                "app.services.crawl_orchestration.create_crawl_job",
                return_value=job_id,
            ):
                with patch(
                    "app.services.crawl_orchestration.settings"
                ) as mock_settings:
                    mock_settings.enable_durable_jobs = True
                    with patch(
                        "app.services.job_queue.enqueue_crawl",
                        return_value=True,
                    ) as mock_enqueue:
                        with patch(
                            "app.services.job_queue.worker_is_running",
                            return_value=True,
                        ):
                            with patch(
                                "app.services.job_queue.wait_for_job_worker",
                                return_value=True,
                            ):
                                with patch("asyncio.create_task") as mock_task:
                                    mock_db.query.return_value.filter.return_value.first.side_effect = [
                                        MagicMock(created_by_id=1),
                                        job,
                                    ]
                                    result = start_crawl_for_source(
                                        mock_db,
                                        source_id,
                                        user_id=1,
                                        trigger=CrawlStartTrigger.MANUAL,
                                    )
    mock_enqueue.assert_called_once()
    mock_task.assert_not_called()
    assert result.job_id == job_id
