import uuid
from types import SimpleNamespace

import pytest
from starlette.requests import Request

from app.auth import get_project_id_or_user
from app.routes.rag import _build_session_scope, _resolve_widget_chat_session_id, _user_redis_scopes
from app.services.history_storage import build_session_scope, user_redis_scopes


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


def test_build_session_scope_user_includes_project():
    project_id = uuid.uuid4()
    auth = {"type": "user", "user_id": 7}

    assert build_session_scope(auth) == "u:7"
    assert build_session_scope(auth, project_id=project_id) == f"u:7:p:{project_id}"
    assert _build_session_scope(auth, project_id=project_id) == f"u:7:p:{project_id}"


def test_build_session_scope_widget_and_api_key_unchanged():
    project_id = uuid.uuid4()
    assert build_session_scope({"type": "widget", "project_id": project_id}) == f"w:{project_id}"
    assert build_session_scope(
        {"type": "api_key", "api_key": SimpleNamespace(id=99)},
        project_id=project_id,
    ) == "k:99"


def test_user_redis_scopes_include_legacy_and_project():
    project_id = uuid.uuid4()
    scopes = user_redis_scopes(42, project_id)
    assert scopes == {f"u:42", f"u:42:p:{project_id}"}
    assert _user_redis_scopes(42, project_id) == scopes
    assert user_redis_scopes(42) == {"u:42"}


def test_user_auth_session_resolve_rejects_foreign_project_session(monkeypatch):
    """Dashboard (user) path uses the same project-bound session resolver as widget."""
    project_a = uuid.uuid4()
    project_b = uuid.uuid4()
    generated = uuid.UUID("22222222-2222-2222-2222-222222222222")
    monkeypatch.setattr("app.routes.rag.uuid.uuid4", lambda: generated)

    # Session only exists under project A — resolve for B must mint a new id.
    foreign = _resolve_widget_chat_session_id(_FakeDb(first_result=None), project_b, "sess_from_a")
    assert foreign == str(generated)

    same = _resolve_widget_chat_session_id(_FakeDb(first_result=object()), project_a, "sess_from_a")
    assert same == "sess_from_a"


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
