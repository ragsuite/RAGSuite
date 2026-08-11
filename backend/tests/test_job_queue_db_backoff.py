"""Background job worker tolerates temporary database outages."""
from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy.exc import OperationalError

from app.services import job_queue as mod


@pytest.fixture(autouse=True)
def reset_worker_db_state():
    with mod._worker_db_lock:
        mod._worker_db_state["backoff_until"] = 0.0
        mod._worker_db_state["last_log_at"] = 0.0
        mod._worker_db_state["consecutive_failures"] = 0.0
    yield
    with mod._worker_db_lock:
        mod._worker_db_state["backoff_until"] = 0.0
        mod._worker_db_state["last_log_at"] = 0.0
        mod._worker_db_state["consecutive_failures"] = 0.0


def test_is_db_unavailable_error_operational_error():
    assert mod._is_db_unavailable_error(OperationalError("stmt", {}, Exception("recovery mode")))


def test_is_db_unavailable_error_message_marker():
    assert mod._is_db_unavailable_error(RuntimeError("FATAL: the database system is in recovery mode"))


def test_record_db_unavailable_increases_backoff():
    delay_first = mod._record_db_unavailable(RuntimeError("recovery mode"), poll_seconds=1.0)
    delay_second = mod._record_db_unavailable(RuntimeError("recovery mode"), poll_seconds=1.0)
    assert delay_first >= 1.0
    assert delay_second > delay_first
    assert mod._worker_db_backoff_remaining() > 0


def test_clear_db_unavailable_resets_state():
    mod._record_db_unavailable(RuntimeError("recovery mode"), poll_seconds=1.0)
    mod._clear_db_unavailable()
    assert mod._worker_db_backoff_remaining() == 0.0
    assert mod._worker_db_state["consecutive_failures"] == 0.0


@patch("app.services.job_queue.threading.Event")
@patch("app.services.job_queue.process_pending_jobs")
def test_worker_loop_backs_off_on_db_outage(mock_process, mock_event):
    calls = {"n": 0}

    def _process():
        calls["n"] += 1
        if calls["n"] == 1:
            raise OperationalError(
                "SELECT 1",
                {},
                Exception("FATAL: the database system is in recovery mode"),
            )
        raise KeyboardInterrupt

    mock_process.side_effect = _process
    mock_event.return_value.wait.return_value = None

    with pytest.raises(KeyboardInterrupt):
        mod._worker_loop(thread_idx=99)

    assert mock_process.call_count == 2
    assert mock_event.return_value.wait.call_count >= 1
