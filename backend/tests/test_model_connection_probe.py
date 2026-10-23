"""Connection probes: empty results fail; extra-only providers use GET /models."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

from app.services.model_connection_probe import (
    collect_extra_models,
    is_probe_success,
    probe_compatible_credentials,
    probe_provider_models,
)


def test_empty_probe_is_not_success():
    assert is_probe_success({}) is False


def test_collect_extra_models_keeps_non_empty():
    assert collect_extra_models(ocr_model=" mistral-ocr-latest ", asr_model="") == {
        "ocr_model": "mistral-ocr-latest"
    }


def test_probe_without_any_model_fails_explicitly():
    results = asyncio.run(
        probe_provider_models(
            "mistral_ocr",
            chat_model=None,
            embedding_model=None,
            api_key="sk-test-abcdefghijklmnopqrstuvwxyz",
        )
    )
    assert results["credentials"].startswith("Failed:")
    assert is_probe_success(results) is False


def test_extra_only_probe_does_not_call_native_chat(monkeypatch):
    async def _chat(*_a, **_k):  # pragma: no cover - must not run
        raise AssertionError("mistral_ocr must not use native Mistral chat")

    async def _embed(*_a, **_k):  # pragma: no cover - must not run
        raise AssertionError("mistral_ocr must not use embedding probe")

    async def _creds(api_key, *, endpoint):
        assert api_key == "sk-test"
        assert endpoint == "https://api.mistral.ai/v1"
        return "Success: Credentials accepted"

    monkeypatch.setattr("app.services.model_connection_probe.probe_chat_model", _chat)
    monkeypatch.setattr("app.services.model_connection_probe.probe_embedding_model", _embed)
    monkeypatch.setattr("app.services.model_connection_probe.probe_compatible_credentials", _creds)
    results = asyncio.run(
        probe_provider_models(
            "mistral_ocr",
            chat_model=None,
            embedding_model=None,
            api_key="sk-test",
            endpoint="https://api.mistral.ai/v1",
            extra_models={"ocr_model": "mistral-ocr-latest"},
        )
    )
    assert results == {"credentials": "Success: Credentials accepted"}
    assert is_probe_success(results) is True


def test_credentials_probe_200(monkeypatch):
    class _Client:
        def __init__(self, * _a, **_k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

        async def get(self, url, headers=None):
            assert url == "https://api.mistral.ai/v1/models"
            assert headers["Authorization"] == "Bearer sk-test"
            return SimpleNamespace(status_code=200, reason_phrase="OK")

    monkeypatch.setattr("httpx.AsyncClient", _Client)
    result = asyncio.run(
        probe_compatible_credentials("sk-test", endpoint="https://api.mistral.ai/v1")
    )
    assert result.startswith("Success")


def test_credentials_probe_401(monkeypatch):
    class _Client:
        def __init__(self, *_a, **_k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

        async def get(self, url, headers=None):
            return SimpleNamespace(status_code=401, reason_phrase="Unauthorized")

    monkeypatch.setattr("httpx.AsyncClient", _Client)
    result = asyncio.run(
        probe_compatible_credentials("sk-random", endpoint="https://api.mistral.ai/v1")
    )
    assert result.startswith("Failed: 401")
    assert is_probe_success({"credentials": result}) is False
