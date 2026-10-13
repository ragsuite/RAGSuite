"""Index writes ride out a short vector-store outage; real errors are not retried."""
import errno

import pytest

from app.services.vector_store_retry import is_transient, with_store_retry


class ConnectError(Exception):
    """Stands in for httpx.ConnectError (matched by type name)."""


def test_transient_detection():
    assert is_transient(ConnectionRefusedError(errno.ECONNREFUSED, "Connection refused"))
    assert is_transient(ConnectError("[Errno -2] Name or service not known"))
    assert is_transient(OSError(-2, "Name or service not known"))
    wrapped = RuntimeError("batch failed")
    wrapped.__cause__ = ConnectionResetError(errno.ECONNRESET, "reset")
    assert is_transient(wrapped)
    assert not is_transient(ValueError("dimension mismatch"))


def test_retries_then_succeeds_and_cleans_up_between_attempts():
    calls, cleanups, sleeps = [], [], []

    def write():
        calls.append(1)
        if len(calls) < 3:
            raise ConnectError("[Errno 111] Connection refused")
        return {"chunks": 4}

    result = with_store_retry(write, before_retry=lambda: cleanups.append(1), sleep=sleeps.append)
    assert result == {"chunks": 4}
    assert len(calls) == 3 and len(cleanups) == 2 and sleeps == [3.0, 8.0]


def test_non_transient_error_is_raised_immediately():
    calls = []

    def write():
        calls.append(1)
        raise ValueError("bad metadata")

    with pytest.raises(ValueError):
        with_store_retry(write, sleep=lambda _s: None)
    assert len(calls) == 1


def test_last_transient_error_is_raised_after_all_attempts():
    calls = []

    def write():
        calls.append(1)
        raise ConnectError("down")

    with pytest.raises(ConnectError):
        with_store_retry(write, delays=(0.0, 0.0), sleep=lambda _s: None)
    assert len(calls) == 3
