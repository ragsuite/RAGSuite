"""Tests for Mistral model discovery helpers."""

from unittest.mock import MagicMock, patch

from app.utils.mistral_models import (
    format_mistral_chat_test_failure,
    list_mistral_chat_models_for_key,
)


def test_list_mistral_chat_models_for_key_filters_embed():
    payload = {
        "data": [
            {"id": "mistral-embed", "capabilities": {"completion_chat": False}},
            {"id": "mistral-small-latest", "capabilities": {"completion_chat": True}},
            {"id": "mistral-large-latest", "capabilities": {"completion_chat": True}},
        ]
    }
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = payload

    with patch("httpx.get", return_value=mock_response):
        models = list_mistral_chat_models_for_key("mistral-test-key-abcdefghijklmnopqrst")

    assert models == ["mistral-large-latest", "mistral-small-latest"]


def test_format_mistral_chat_test_failure_lists_allowed_models():
    with patch(
        "app.utils.mistral_models.list_mistral_chat_models_for_key",
        return_value=["mistral-small-latest", "ministral-8b-latest"],
    ):
        msg = format_mistral_chat_test_failure(
            "mistral-large-latest",
            "mistral-test-key-abcdefghijklmnopqrst",
            Exception("Status 403 Forbidden"),
        )

    assert "mistral-small-latest" in msg
    assert "mistral-large-latest" in msg
    assert "Select one of these in Chat model" in msg


def test_format_mistral_chat_test_failure_embed_only_key():
    with patch("app.utils.mistral_models.list_mistral_chat_models_for_key", return_value=[]):
        msg = format_mistral_chat_test_failure(
            "mistral-large-latest",
            "mistral-test-key-abcdefghijklmnopqrst",
            Exception("403 Forbidden"),
        )

    assert "no chat model access" in msg.lower()
