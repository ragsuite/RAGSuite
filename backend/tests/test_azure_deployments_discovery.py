"""Azure OpenAI deployment listing for Model Configuration."""
from __future__ import annotations

from app.services.project_model_providers import normalize_provider_endpoint
from app.utils.provider_model_discovery import list_azure_deployments


class _Resp:
    def __init__(self, status_code: int, payload, text: str | None = None):
        self.status_code = status_code
        self._payload = payload
        self.text = text if text is not None else str(payload)

    def json(self):
        return self._payload


def test_list_azure_deployments_splits_chat_and_embedding(monkeypatch):
    payload = {
        "data": [
            {"id": "gpt-4o", "model": "gpt-4o"},
            {"id": "my-embed", "model": "text-embedding-3-small"},
            {"id": "text-embedding-3-large", "model": "text-embedding-3-large"},
        ]
    }

    def _get(url, **kwargs):
        assert "/openai/deployments" in url
        assert kwargs["params"]["api-version"]
        assert kwargs["headers"]["api-key"] == "test-key"
        return _Resp(200, payload)

    monkeypatch.setattr("httpx.get", _get)
    out = list_azure_deployments(
        "https://example.openai.azure.com/",
        "test-key",
        "2024-10-21",
    )
    assert out["chat"] == ["gpt-4o"]
    assert out["embedding"] == ["my-embed", "text-embedding-3-large"]
    assert out.get("error") in (None, "")


def test_list_azure_deployments_404_returns_actionable_error(monkeypatch):
    monkeypatch.setattr(
        "httpx.get",
        lambda *_a, **_k: _Resp(404, {"error": {"message": "Resource not found"}}, text="Resource not found"),
    )
    out = list_azure_deployments("https://example.cognitiveservices.azure.com", "key")
    assert out["chat"] == []
    assert out["embedding"] == []
    assert out["error"]
    assert "Type the exact chat and embedding deployment names" in out["error"]


def test_list_azure_deployments_missing_creds_error():
    out = list_azure_deployments("", "key")
    assert out["chat"] == []
    assert out["error"]


def test_list_azure_deployments_retries_versions_until_success(monkeypatch):
    calls: list[str] = []

    def _get(url, **kwargs):
        version = kwargs["params"]["api-version"]
        calls.append(version)
        if version != "2023-05-15":
            return _Resp(404, {}, text="not found")
        return _Resp(
            200,
            {"data": [{"id": "gpt-4o", "model": "gpt-4o"}]},
        )

    monkeypatch.setattr("httpx.get", _get)
    out = list_azure_deployments(
        "https://example.openai.azure.com",
        "test-key",
        "2024-10-21",
    )
    assert "2024-10-21" in calls
    assert out["chat"] == ["gpt-4o"]
    assert out.get("error") in (None, "")


def test_normalize_azure_endpoint_strips_paths():
    assert (
        normalize_provider_endpoint(
            "azure_openai",
            "https://res.cognitiveservices.azure.com/models",
            required=True,
        )
        == "https://res.cognitiveservices.azure.com"
    )
    assert (
        normalize_provider_endpoint(
            "azure_openai",
            "https://res.cognitiveservices.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview",
            required=True,
        )
        == "https://res.cognitiveservices.azure.com"
    )
