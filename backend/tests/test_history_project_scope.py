"""History endpoints must scope by explicit project_id (not only DB active)."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.routes.rag import _resolve_history_project


def test_resolve_history_project_uses_explicit_id(monkeypatch):
    user = MagicMock()
    user.id = 1
    db = MagicMock()
    expected = MagicMock()
    pid = uuid.uuid4()

    def _ensure(db_arg, user_arg, project_id, **kwargs):
        assert project_id == pid
        return expected

    monkeypatch.setattr("app.auth.ensure_project_access", _ensure)
    got = _resolve_history_project(db, user, str(pid))
    assert got is expected


def test_resolve_history_project_rejects_bad_uuid():
    user = MagicMock()
    user.id = 1
    with pytest.raises(HTTPException) as exc:
        _resolve_history_project(MagicMock(), user, "not-a-uuid")
    assert exc.value.status_code == 400


def test_resolve_history_project_falls_back_to_active(monkeypatch):
    user = MagicMock()
    user.id = 42
    expected = MagicMock()
    monkeypatch.setattr(
        "app.routes.rag._get_active_project",
        lambda db, user_id: expected if user_id == 42 else None,
    )
    assert _resolve_history_project(MagicMock(), user, None) is expected
    assert _resolve_history_project(MagicMock(), user, "  ") is expected
