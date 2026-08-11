import uuid
from types import SimpleNamespace

import pytest
from starlette.requests import Request

from app.auth import get_project_id_or_user
from app.routes.rag import _resolve_widget_chat_session_id


class _FakeQuery:
    def __init__(self, first_result):
        self._first_result = first_result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._first_result


class _FakeDb:
    def __init__(self, first_result):
        self._first_result = first_result

    def query(self, *args, **kwargs):
        return _FakeQuery(self._first_result)


def test_widget_session_keeps_existing_session_id():
    project_id = uuid.uuid4()
    db = _FakeDb(first_result=object())
    existing = "sess_existing"

    resolved = _resolve_widget_chat_session_id(db, project_id, existing)

    assert resolved == existing


def test_widget_session_issues_new_when_missing_or_invalid(monkeypatch):
    project_id = uuid.uuid4()
    generated = uuid.UUID("11111111-1111-1111-1111-111111111111")
    monkeypatch.setattr("app.routes.rag.uuid.uuid4", lambda: generated)

    missing = _resolve_widget_chat_session_id(_FakeDb(first_result=None), project_id, None)
    invalid = _resolve_widget_chat_session_id(_FakeDb(first_result=None), project_id, "foreign_session")

    assert missing == str(generated)
    assert invalid == str(generated)


@pytest.mark.asyncio
async def test_widget_mode_header_prioritizes_widget_auth(monkeypatch):
    project_uuid = uuid.uuid4()
    project = SimpleNamespace(id=project_uuid, owner_id=42)
    db = _FakeDb(first_result=project)

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("Bearer token path should not be used in widget mode")

    monkeypatch.setattr("app.platform.auth.verify_token", _fail_if_called)
    monkeypatch.setattr("app.platform.auth.validate_domain_for_project", lambda *args, **kwargs: True)

    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/api/v1/chat/history",
            "headers": [],
            "query_string": b"",
        }
    )

    auth = await get_project_id_or_user(
        request=request,
        authorization="Bearer fake.jwt.token",
        x_project_id=str(project_uuid),
        x_widget_mode="true",
        x_request_domain="example.com",
        project_id=None,
        db=db,
    )

    assert auth["type"] == "widget"
    assert auth["project_id"] == project_uuid
