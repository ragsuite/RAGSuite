"""Tests for org-scoped session timeout resolve/clamp helpers."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.session_timeout import (
    SESSION_TIMEOUT_DISABLED_MINUTES,
    SESSION_TIMEOUT_MAX_MINUTES,
    SESSION_TIMEOUT_MIN_MINUTES,
    clamp_session_timeout_minutes,
    is_session_timeout_enabled,
    resolve_jwt_expire_minutes,
    session_timeout_source,
)


def test_clamp_session_timeout_minutes():
    assert clamp_session_timeout_minutes(1) == SESSION_TIMEOUT_MIN_MINUTES
    assert clamp_session_timeout_minutes(5) == 5
    assert clamp_session_timeout_minutes(60) == 60
    assert clamp_session_timeout_minutes(99999) == SESSION_TIMEOUT_MAX_MINUTES


def test_is_session_timeout_enabled_defaults_true():
    assert is_session_timeout_enabled(None) is True
    assert is_session_timeout_enabled(SimpleNamespace()) is True
    assert is_session_timeout_enabled(SimpleNamespace(session_timeout_enabled=None)) is True
    assert is_session_timeout_enabled(SimpleNamespace(session_timeout_enabled=True)) is True
    assert is_session_timeout_enabled(SimpleNamespace(session_timeout_enabled=False)) is False


def test_resolve_jwt_expire_minutes_null_org_uses_env(monkeypatch):
    from app.services import session_timeout as mod

    monkeypatch.setattr(mod.settings, "jwt_expire_minutes", 90)
    db = MagicMock()
    user = SimpleNamespace(org_id=1)
    org = SimpleNamespace(session_timeout_minutes=None, session_timeout_enabled=True)
    db.query.return_value.filter.return_value.first.return_value = org
    assert resolve_jwt_expire_minutes(db, user) == 90
    assert session_timeout_source(db, user) == "env"


def test_resolve_jwt_expire_minutes_org_override(monkeypatch):
    from app.services import session_timeout as mod

    monkeypatch.setattr(mod.settings, "jwt_expire_minutes", 60)
    db = MagicMock()
    user = SimpleNamespace(org_id=2)
    org = SimpleNamespace(session_timeout_minutes=120, session_timeout_enabled=True)
    db.query.return_value.filter.return_value.first.return_value = org
    assert resolve_jwt_expire_minutes(db, user) == 120
    assert session_timeout_source(db, user) == "org"


def test_resolve_jwt_expire_minutes_disabled_returns_sentinel(monkeypatch):
    from app.services import session_timeout as mod

    monkeypatch.setattr(mod.settings, "jwt_expire_minutes", 60)
    db = MagicMock()
    user = SimpleNamespace(org_id=4)
    org = SimpleNamespace(session_timeout_minutes=30, session_timeout_enabled=False)
    db.query.return_value.filter.return_value.first.return_value = org
    assert resolve_jwt_expire_minutes(db, user) == SESSION_TIMEOUT_DISABLED_MINUTES


def test_resolve_jwt_expire_minutes_clamps_org_value(monkeypatch):
    from app.services import session_timeout as mod

    monkeypatch.setattr(mod.settings, "jwt_expire_minutes", 60)
    db = MagicMock()
    user = SimpleNamespace(org_id=3)
    org = SimpleNamespace(session_timeout_minutes=2, session_timeout_enabled=True)
    db.query.return_value.filter.return_value.first.return_value = org
    assert resolve_jwt_expire_minutes(db, user) == SESSION_TIMEOUT_MIN_MINUTES


def test_resolve_jwt_expire_minutes_no_user(monkeypatch):
    from app.services import session_timeout as mod

    monkeypatch.setattr(mod.settings, "jwt_expire_minutes", 45)
    db = MagicMock()
    assert resolve_jwt_expire_minutes(db, None) == 45
