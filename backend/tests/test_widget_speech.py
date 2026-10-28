from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException
import pytest

from app.routes import widget_speech as routes

PID = "11111111-1111-1111-1111-111111111111"


def test_speech_config_native_when_unset(monkeypatch):
    monkeypatch.setattr(routes, "widget_model_provider", lambda *_a, **_k: "openai")
    monkeypatch.setattr(routes, "resolve_extra_model", lambda *_a, **_k: None)
    monkeypatch.setattr(routes, "_project_id", lambda *_a, **_k: PID)
    out = routes.speech_config(surface="chat", project_id=None, db=MagicMock(), auth={"type": "widget"})
    assert out["data"]["asr"]["enabled"] is False
    assert out["data"]["tts"]["enabled"] is False


def test_tts_skips_proxy_when_unset(monkeypatch):
    monkeypatch.setattr(routes, "widget_model_provider", lambda *_a, **_k: "openai")
    monkeypatch.setattr(routes, "resolve_extra_model", lambda *_a, **_k: None)
    monkeypatch.setattr(routes, "_project_id", lambda *_a, **_k: PID)
    with pytest.raises(HTTPException) as exc:
        routes.speech_tts(
            routes.TtsIn(text="hello", surface="chat"),
            db=MagicMock(),
            auth={"type": "widget"},
        )
    assert exc.value.status_code == 404


def test_speech_config_enabled_when_model_set(monkeypatch):
    ref = SimpleNamespace(model="whisper-1")
    monkeypatch.setattr(routes, "widget_model_provider", lambda *_a, **_k: "openai")
    def _resolve(_db, _project_id, kind, _preferred=None):
        return ref if kind in {"asr", "tts"} else None

    monkeypatch.setattr(routes, "resolve_extra_model", _resolve)
    monkeypatch.setattr(routes, "_project_id", lambda *_a, **_k: PID)
    out = routes.speech_config(surface="search", project_id=None, db=MagicMock(), auth={"type": "widget"})
    assert out["data"]["asr"]["enabled"] is True
    assert out["data"]["tts"]["model"] == "whisper-1"


def test_speech_config_user_auth_uses_active_project(monkeypatch):
    monkeypatch.setattr(routes, "resolve_active_project", lambda *_a, **_k: SimpleNamespace(id=PID))
    monkeypatch.setattr(routes, "widget_model_provider", lambda *_a, **_k: "openai")
    ref = SimpleNamespace(model="tts-1")
    monkeypatch.setattr(
        routes,
        "resolve_extra_model",
        lambda *_a, **_k: ref,
    )
    out = routes.speech_config(
        surface="chat",
        project_id=None,
        db=MagicMock(),
        auth={"type": "user", "user": SimpleNamespace(id=1)},
    )
    assert out["data"]["asr"]["enabled"] is True
    assert out["data"]["tts"]["model"] == "tts-1"


def test_speech_config_search_surface_uses_active_project(monkeypatch):
    seen = {}

    def _provider(_db, _pid, surface="chat"):
        seen["surface"] = surface
        return "openai"

    monkeypatch.setattr(routes, "resolve_active_project", lambda *_a, **_k: SimpleNamespace(id=PID))
    monkeypatch.setattr(routes, "widget_model_provider", _provider)
    ref = SimpleNamespace(model="whisper-1")
    monkeypatch.setattr(routes, "resolve_extra_model", lambda *_a, **_k: ref)
    out = routes.speech_config(
        surface="search",
        project_id=None,
        db=MagicMock(),
        auth={"type": "user", "user": SimpleNamespace(id=1)},
    )
    assert seen["surface"] == "search"
    assert out["data"]["asr"]["enabled"] is True


def test_speech_config_user_auth_without_project_is_400(monkeypatch):
    monkeypatch.setattr(routes, "resolve_active_project", lambda *_a, **_k: None)
    with pytest.raises(HTTPException) as exc:
        routes.speech_config(
            surface="chat",
            project_id=None,
            db=MagicMock(),
            auth={"type": "user", "user": SimpleNamespace(id=1)},
        )
    assert exc.value.status_code == 400
