"""API key verification helpers for Model Configuration."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.project_model_provider_verification import is_auth_failure, is_key_rejected


@pytest.mark.parametrize(
    "message",
    [
        "Failed: Error code: 401 - {'error': {'message': 'Incorrect API key provided: sk-proj-***'}}",
        "Failed: Error code: 401 - {'type': 'error', 'error': {'type': 'authentication_error', 'message': 'invalid x-api-key'}}",
        "Failed: 400 API key not valid. Please pass a valid API key. [reason: \"API_KEY_INVALID\"]",
        "Failed: Unauthorized",
        "Failed: 403 PERMISSION_DENIED",
    ],
)
def test_provider_auth_errors_are_detected(message):
    assert is_auth_failure(message)


@pytest.mark.parametrize(
    "message",
    [
        "Failed: Timed out after 18s",
        "Failed: Connection refused",
        "Failed: model 'gpt-9' not found",
        "Success: Vector of length 1024 generated",
        None,
    ],
)
def test_non_auth_results_are_not_key_rejections(message):
    assert not is_auth_failure(message)


def _row(status, message):
    return SimpleNamespace(last_test_status=status, last_test_message=message)


def test_key_rejected_reads_the_stored_test_result():
    assert is_key_rejected(_row("failed", "chat_model: Failed: Error code: 401 - invalid_api_key"))
    assert is_key_rejected(
        _row("failed", "chat_model: Success: Yes; embedding_model: Failed: 401 Unauthorized")
    )
    assert not is_key_rejected(_row("failed", "chat_model: Failed: Timed out after 18s"))
    assert not is_key_rejected(_row("success", "chat_model: Success: Yes"))
    assert not is_key_rejected(_row(None, None))
    assert not is_key_rejected(None)
