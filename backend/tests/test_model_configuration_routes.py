"""Model Configuration route guard: project access + chatbot/search settings permission."""
from __future__ import annotations

import asyncio
import importlib.util
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

ROUTES = Path(__file__).resolve().parents[2] / "modules" / "model_configuration" / "backend" / "routes.py"


@pytest.fixture()
def routes():
    name = "model_configuration_routes_under_test"
    spec = importlib.util.spec_from_file_location(name, ROUTES)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
        yield module
    finally:
        sys.modules.pop(name, None)


def _guard(routes, monkeypatch, permissions):
    project = SimpleNamespace(id=uuid.uuid4())
    monkeypatch.setattr(routes, "ensure_project_access", lambda *_a, **_k: project)
    monkeypatch.setattr(routes, "project_permissions_for_user", lambda *_a, **_k: permissions)
    return routes._project_for_settings(None, SimpleNamespace(id=1), str(project.id)), project


@pytest.mark.parametrize("perms", [["chatbot:settings"], ["search:settings"], ["project:admin"]])
def test_either_settings_permission_allows(routes, monkeypatch, perms):
    result, project = _guard(routes, monkeypatch, perms)
    assert result is project


def test_missing_settings_permission_is_forbidden(routes, monkeypatch):
    with pytest.raises(HTTPException) as exc:
        _guard(routes, monkeypatch, ["chat:use", "search:use"])
    assert exc.value.status_code == 403


def test_invalid_project_id_is_bad_request(routes):
    with pytest.raises(HTTPException) as exc:
        routes._project_for_settings(None, SimpleNamespace(id=1), "not-a-uuid")
    assert exc.value.status_code == 400


def test_unknown_provider_is_bad_request(routes):
    with pytest.raises(HTTPException) as exc:
        routes._provider_or_400("cohere")
    assert exc.value.status_code == 400


def test_save_payload_rejects_out_of_range_temperature(routes):
    with pytest.raises(ValueError):
        routes.ProviderConfigIn(chat_model="gpt-4o", temperature=3)


def test_rejected_key_save_is_400_without_propagation(routes, monkeypatch):
    project = SimpleNamespace(id=uuid.uuid4())
    calls = []

    async def _reject(*_a, **_k):
        raise routes.ProviderConfigError("Google Gemini rejected this API key.")

    monkeypatch.setattr(routes, "_project_for_settings", lambda *_a, **_k: project)
    monkeypatch.setattr(routes, "save_verified_provider_config", _reject)
    monkeypatch.setattr(routes, "propagate_provider_to_settings", lambda *a, **k: calls.append("propagate"))
    monkeypatch.setattr(routes, "emit_audit", lambda **k: calls.append("audit"))
    payload = routes.ProviderConfigIn(chat_model="gemini-2.0-flash-lite", api_key="sk_5-elevenlabs-key")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            routes.save_provider(
                "gemini", payload, request=None, project_id=str(project.id), db=None, current_user=SimpleNamespace(id=1)
            )
        )
    assert exc.value.status_code == 400
    assert "rejected this API key" in exc.value.detail
    assert calls == []


def test_save_payload_ignores_retired_tuning_params(routes):
    payload = routes.ProviderConfigIn(chat_model="gpt-4o", temperature=0.4, top_p=0.9, best_of=3)
    assert payload.model_dump(exclude_unset=True) == {"chat_model": "gpt-4o", "temperature": 0.4}


def test_provider_config_error_on_test_is_400(routes, monkeypatch):
    project = SimpleNamespace(id=uuid.uuid4())

    async def _raise(*_a, **_k):
        raise routes.ProviderConfigError("Endpoint must be an http(s) URL")

    monkeypatch.setattr(routes, "_project_for_settings", lambda *_a, **_k: project)
    monkeypatch.setattr(routes, "test_provider_config", _raise)
    payload = routes.ProviderTestIn(chat_model="gpt-4o", api_key="sk-test", endpoint="not-a-url")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            routes.test_provider(
                "azure_openai",
                payload,
                project_id=str(project.id),
                db=None,
                current_user=SimpleNamespace(id=1),
            )
        )
    assert exc.value.status_code == 400
    assert "http(s) URL" in exc.value.detail
