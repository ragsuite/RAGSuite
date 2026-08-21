"""
Widget security tests.

Covers:
- Widget blocked from write endpoints (chatbot config, customization, search model)
- Invalid/expired Bearer token raises 401, does NOT fall through to widget auth
- Domain spoofing: Origin header takes priority over X-Request-Domain
- Cross-project access blocked
- Valid widget auth still works (no regression)
"""
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.auth import get_project_id_or_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_request(path="/api/v1/chat/message", headers=None):
    raw_headers = []
    for k, v in (headers or {}).items():
        raw_headers.append((k.lower().encode(), v.encode()))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": path,
            "headers": raw_headers,
            "query_string": b"",
        }
    )


class _FakeQuery:
    def __init__(self, result=None):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result


class _FakeDb:
    def __init__(self, project=None):
        self._project = project

    def query(self, *args, **kwargs):
        return _FakeQuery(self._project)


def _make_project(project_id=None, owner_id=99):
    pid = project_id or uuid.uuid4()
    return SimpleNamespace(id=pid, owner_id=owner_id)


# ---------------------------------------------------------------------------
# Fix 1: Widget blocked from write operations
# ---------------------------------------------------------------------------

class TestWidgetReadOnly:
    """Widget auth type must be rejected by write endpoints."""

    @pytest.mark.asyncio
    async def test_widget_blocked_from_chatbot_configuration(self, monkeypatch):
        """POST /chatbot/configuration must return 403 for widget auth."""
        from app.routes.chatbot import update_chatbot_configuration
        from app.schemas import ChatbotConfigurationCreate

        auth_result = {"type": "widget", "project_id": uuid.uuid4(), "user_id": 1}
        config_data = MagicMock(spec=ChatbotConfigurationCreate)
        request = _make_request("/api/v1/chatbot/configuration")
        db = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            await update_chatbot_configuration(
                config_data=config_data,
                request=request,
                project_id=None,
                db=db,
                auth_result=auth_result,
            )
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_widget_blocked_from_chatbot_customization(self, monkeypatch):
        """POST /chatbot/customization must return 403 for widget auth."""
        from app.routes.chatbot import update_widget_customization
        from app.schemas import WidgetCustomizationCreate

        auth_result = {"type": "widget", "project_id": uuid.uuid4(), "user_id": 1}
        customization_data = MagicMock(spec=WidgetCustomizationCreate)
        request = _make_request("/api/v1/chatbot/customization")
        db = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            await update_widget_customization(
                customization_data=customization_data,
                request=request,
                project_id=None,
                db=db,
                auth_result=auth_result,
            )
        assert exc_info.value.status_code == 403

    def test_widget_blocked_from_search_model_update(self, monkeypatch):
        """POST /search/models/ must return 403 for widget auth."""
        from app.routes.search_models import update_search_model_config

        auth_result = {"type": "widget", "project_id": uuid.uuid4(), "user_id": 1}
        config_in = MagicMock()
        request = _make_request("/api/v1/search/models/")
        db = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            update_search_model_config(
                config_in=config_in,
                request=request,
                db=db,
                auth_result=auth_result,
            )
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# Fix 2: Invalid Bearer token must NOT fall through to widget auth
# ---------------------------------------------------------------------------

class TestBearerTokenFallthrough:
    """Broken tokens must raise 401, never silently become widget auth."""

    @pytest.mark.asyncio
    async def test_expired_token_raises_401_not_widget(self, monkeypatch):
        """Expired JWT + project ID must return 401, not fall through to widget."""
        project_id = str(uuid.uuid4())

        def _fake_verify_token(token):
            raise Exception("Token expired")

        monkeypatch.setattr("app.platform.auth.verify_token", _fake_verify_token)

        request = _make_request()
        db = _FakeDb(project=_make_project())

        with pytest.raises(HTTPException) as exc_info:
            await get_project_id_or_user(
                request=request,
                authorization="Bearer expired.jwt.token",
                x_project_id=project_id,
                x_widget_mode=None,
                x_request_domain=None,
                project_id=None,
                db=db,
            )
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_malformed_token_raises_401(self, monkeypatch):
        """Malformed JWT must raise 401, not silently become widget."""
        project_id = str(uuid.uuid4())

        def _fake_verify_token(token):
            raise ValueError("Invalid token format")

        monkeypatch.setattr("app.platform.auth.verify_token", _fake_verify_token)

        request = _make_request()
        db = _FakeDb(project=_make_project())

        with pytest.raises(HTTPException) as exc_info:
            await get_project_id_or_user(
                request=request,
                authorization="Bearer malformed",
                x_project_id=project_id,
                x_widget_mode=None,
                x_request_domain=None,
                project_id=None,
                db=db,
            )
        assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# Fix 3: Origin header takes priority over X-Request-Domain
# ---------------------------------------------------------------------------

class TestDomainValidation:
    """Origin header must be checked before X-Request-Domain."""

    @pytest.mark.asyncio
    async def test_origin_header_used_over_x_request_domain(self, monkeypatch):
        """When both Origin and X-Request-Domain present, Origin wins."""
        project_id = uuid.uuid4()
        project = _make_project(project_id=project_id)
        captured = {}

        def _fake_validate(domain, pid, db, widget_type=None):
            captured["domain"] = domain

        monkeypatch.setattr("app.platform.auth.validate_domain_for_project", _fake_validate)

        request = _make_request(headers={"origin": "https://real-site.com"})
        db = _FakeDb(project=project)

        await get_project_id_or_user(
            request=request,
            authorization=None,
            x_project_id=str(project_id),
            x_widget_mode=None,
            x_request_domain="fake-site.com",  # attacker-supplied, should be ignored
            project_id=None,
            db=db,
        )

        assert captured["domain"] == "real-site.com"

    @pytest.mark.asyncio
    async def test_x_request_domain_used_when_no_origin(self, monkeypatch):
        """Falls back to X-Request-Domain when Origin absent."""
        project_id = uuid.uuid4()
        project = _make_project(project_id=project_id)
        captured = {}

        def _fake_validate(domain, pid, db, widget_type=None):
            captured["domain"] = domain

        monkeypatch.setattr("app.platform.auth.validate_domain_for_project", _fake_validate)

        request = _make_request()
        db = _FakeDb(project=project)

        await get_project_id_or_user(
            request=request,
            authorization=None,
            x_project_id=str(project_id),
            x_widget_mode=None,
            x_request_domain="mysite.com",
            project_id=None,
            db=db,
        )

        assert captured["domain"] == "mysite.com"

    @pytest.mark.asyncio
    async def test_embed_search_prefers_x_request_domain_over_origin(self, monkeypatch):
        """AppSearch iframe: Origin is asset host; parent domain comes from X-Request-Domain."""
        project_id = uuid.uuid4()
        project = _make_project(project_id=project_id)
        captured = {}

        def _fake_validate(domain, pid, db, widget_type=None):
            captured["domain"] = domain

        monkeypatch.setattr("app.platform.auth.validate_domain_for_project", _fake_validate)

        request = _make_request(
            path="/api/v1/search/stream",
            headers={
                "origin": "https://assets.ragsuite.example",
                "referer": "https://assets.ragsuite.example/embed/search?projectId=x",
                "x-request-domain": "customer-site.com",
            },
        )
        db = _FakeDb(project=project)

        await get_project_id_or_user(
            request=request,
            authorization=None,
            x_project_id=str(project_id),
            x_widget_mode=None,
            x_request_domain="customer-site.com",
            project_id=None,
            db=db,
        )

        assert captured["domain"] == "customer-site.com"

    @pytest.mark.asyncio
    async def test_embed_chatbot_prefers_x_request_domain_over_origin(self, monkeypatch):
        """AppChat iframe: same parent-domain preference as search."""
        project_id = uuid.uuid4()
        project = _make_project(project_id=project_id)
        captured = {}

        def _fake_validate(domain, pid, db, widget_type=None):
            captured["domain"] = domain

        monkeypatch.setattr("app.platform.auth.validate_domain_for_project", _fake_validate)

        request = _make_request(
            path="/api/v1/chat/message",
            headers={
                "origin": "https://assets.ragsuite.example",
                "referer": "https://assets.ragsuite.example/embed/chatbot?projectId=x",
                "x-request-domain": "customer-site.com",
            },
        )
        db = _FakeDb(project=project)

        await get_project_id_or_user(
            request=request,
            authorization=None,
            x_project_id=str(project_id),
            x_widget_mode=None,
            x_request_domain="customer-site.com",
            project_id=None,
            db=db,
        )

        assert captured["domain"] == "customer-site.com"


# ---------------------------------------------------------------------------
# Cross-project isolation
# ---------------------------------------------------------------------------

class TestCrossProjectIsolation:
    """Widget token for project A must not access project B."""

    @pytest.mark.asyncio
    async def test_widget_scoped_to_authenticated_project(self, monkeypatch):
        """Auth result project_id must match the validated project, not query param."""
        project_id = uuid.uuid4()
        other_project_id = uuid.uuid4()
        project = _make_project(project_id=project_id)

        monkeypatch.setattr("app.platform.auth.validate_domain_for_project", lambda *a, **kw: True)

        request = _make_request()
        db = _FakeDb(project=project)

        auth = await get_project_id_or_user(
            request=request,
            authorization=None,
            x_project_id=str(project_id),
            x_widget_mode=None,
            x_request_domain="mysite.com",
            project_id=str(other_project_id),  # attacker tries different project via query
            db=db,
        )

        # Must use the header project_id (X-Project-ID), not query param
        assert auth["project_id"] == project_id

    @pytest.mark.asyncio
    async def test_unknown_project_id_raises_401(self, monkeypatch):
        """Non-existent project UUID must return 401."""
        monkeypatch.setattr("app.platform.auth.validate_domain_for_project", lambda *a, **kw: True)

        request = _make_request()
        db = _FakeDb(project=None)  # project not found in DB

        with pytest.raises(HTTPException) as exc_info:
            await get_project_id_or_user(
                request=request,
                authorization=None,
                x_project_id=str(uuid.uuid4()),
                x_widget_mode=None,
                x_request_domain="mysite.com",
                project_id=None,
                db=db,
            )
        assert exc_info.value.status_code == 401


# ---------------------------------------------------------------------------
# Regression: valid widget auth still works
# ---------------------------------------------------------------------------

class TestValidWidgetAuthRegression:
    """Ensure our fixes did not break normal widget flow."""

    @pytest.mark.asyncio
    async def test_valid_widget_auth_succeeds(self, monkeypatch):
        """Widget with valid project ID + domain must authenticate successfully."""
        project_id = uuid.uuid4()
        project = _make_project(project_id=project_id, owner_id=7)

        monkeypatch.setattr("app.platform.auth.validate_domain_for_project", lambda *a, **kw: True)

        request = _make_request(headers={"origin": "https://mysite.com"})
        db = _FakeDb(project=project)

        auth = await get_project_id_or_user(
            request=request,
            authorization=None,
            x_project_id=str(project_id),
            x_widget_mode="true",
            x_request_domain=None,
            project_id=None,
            db=db,
        )

        assert auth["type"] == "widget"
        assert auth["project_id"] == project_id
        assert auth["user_id"] == 7
