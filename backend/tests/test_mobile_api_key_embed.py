"""
Mobile API key embed auth tests.

Covers project-scoped rgs_live_/rgs_test_ keys on settings read routes and feedback.
Web widget auth regressions remain in test_widget_security.py.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.auth import resolve_embed_project_context


PROJECT_A = uuid.uuid4()
PROJECT_B = uuid.uuid4()
OWNER_ID = 42
CREATOR_ID = 99


def _make_project(project_id: uuid.UUID, owner_id: int = OWNER_ID):
    return SimpleNamespace(id=project_id, owner_id=owner_id)


def _make_api_key(project_id: uuid.UUID, created_by_id: int = CREATOR_ID, key_id: int = 7):
    return SimpleNamespace(
        id=key_id,
        project_id=project_id,
        created_by_id=created_by_id,
        is_active=True,
    )


class _FakeQuery:
    def __init__(self, result=None):
        self._result = result
        self.filters = []

    def filter(self, *args, **kwargs):
        self.filters.extend(args)
        return self

    def first(self):
        return self._result


class _FakeDb:
    def __init__(self, project=None):
        self._project = project

    def query(self, *args, **kwargs):
        return _FakeQuery(self._project)


class TestResolveEmbedProjectContext:
    def test_api_key_returns_key_project_and_owner_as_settings_user(self):
        project = _make_project(PROJECT_B)
        db = _FakeDb(project)
        auth = {"type": "api_key", "api_key": _make_api_key(PROJECT_B)}

        resolved_project, settings_user_id = resolve_embed_project_context(auth, db)

        assert resolved_project.id == PROJECT_B
        assert settings_user_id == OWNER_ID

    def test_api_key_rejects_missing_project_scope(self):
        db = _FakeDb()
        auth = {"type": "api_key", "api_key": SimpleNamespace(project_id=None)}

        with pytest.raises(HTTPException) as exc_info:
            resolve_embed_project_context(auth, db)
        assert exc_info.value.status_code == 403

    def test_api_key_rejects_unknown_project(self):
        db = _FakeDb(project=None)
        auth = {"type": "api_key", "api_key": _make_api_key(PROJECT_B)}

        with pytest.raises(HTTPException) as exc_info:
            resolve_embed_project_context(auth, db)
        assert exc_info.value.status_code == 404

    def test_widget_returns_project_and_owner(self):
        project = _make_project(PROJECT_A)
        db = _FakeDb(project)
        auth = {"type": "widget", "project_id": PROJECT_A, "user_id": OWNER_ID}

        resolved_project, settings_user_id = resolve_embed_project_context(auth, db)

        assert resolved_project.id == PROJECT_A
        assert settings_user_id == OWNER_ID


class TestChatbotSettingsApiKey:
    @pytest.mark.asyncio
    async def test_api_key_uses_key_project_not_active_project(self):
        from app.routes.chatbot import get_chatbot_settings

        project_b = _make_project(PROJECT_B)
        settings_row = SimpleNamespace(
            chatbot_title="Mobile Project B Title",
            short_description=None,
            bubble_message=None,
            welcome_message="Hello B",
            chatbot_language="en",
            feedback_enabled=True,
            widget_logo_url=None,
            widget_avatar="default-1",
            widget_avatar_size=38,
            widget_chatbot_color="#111111",
            widget_background_color="#222222",
            widget_text_color="#ffffff",
            widget_show_logo=True,
            widget_show_date_time=True,
            widget_bottom_space=15,
            widget_font_size=14,
            widget_trigger_border_radius=50,
            widget_position="bottom-right",
            widget_z_index=50,
            widget_offset_x=0,
            widget_offset_y=0,
            widget_width=None,
        )

        auth = {
            "type": "api_key",
            "user_id": CREATOR_ID,
            "api_key": _make_api_key(PROJECT_B),
        }
        db = MagicMock()

        with patch(
            "app.routes.chatbot.resolve_embed_project_context",
            return_value=(project_b, OWNER_ID),
        ), patch("app.routes.chatbot._get_chatbot_settings_query") as mock_query_factory:
            mock_query = MagicMock()
            mock_query.filter.return_value.first.return_value = settings_row
            mock_query_factory.return_value = mock_query

            result = await get_chatbot_settings(project_id=None, db=db, auth=auth)

        assert result.configuration.chatbot_title == "Mobile Project B Title"
        mock_query.filter.assert_called_once()


class TestSearchConfigurationApiKey:
    @pytest.mark.asyncio
    async def test_api_key_scopes_search_configuration_to_key_project(self):
        from app.routes.search_models import get_search_configuration

        project_b = _make_project(PROJECT_B)
        settings_row = SimpleNamespace(
            search_title="Search B",
            feedback_enabled=True,
            search_language="de",
            search_style_option="plugin",
            search_box_layout="box",
            search_icon="search",
            search_loader_type="skeleton",
            search_background_color="#abcdef",
            search_text_color="#000000",
            search_border_radius="semi-rounded",
            search_result_style="list",
        )

        auth = {
            "type": "api_key",
            "user_id": CREATOR_ID,
            "api_key": _make_api_key(PROJECT_B),
        }
        db = MagicMock()

        with patch(
            "app.routes.search_models.resolve_embed_project_context",
            return_value=(project_b, OWNER_ID),
        ):
            db.query.return_value.filter.return_value.first.return_value = settings_row

            result = await get_search_configuration(db=db, auth_result=auth)

        assert result.title == "Search B"
        assert result.language == "de"


class TestSearchCustomizationApiKey:
    @pytest.mark.asyncio
    async def test_api_key_auth_accepted_on_search_customization(self):
        from app.routes.search_models import get_search_customization

        project_b = _make_project(PROJECT_B)
        settings_row = SimpleNamespace(
            search_form_type="withBtn",
            search_button_type="icon",
            search_button_text="Find",
            search_input_placeholder="Ask anything",
            search_recent_search=True,
            search_recent_search_title="Recent",
            search_predefined_questions=True,
            search_questions_position="above-search",
            search_questions_limit=3,
            search_questions=["Help"],
        )

        auth = {
            "type": "api_key",
            "user_id": CREATOR_ID,
            "api_key": _make_api_key(PROJECT_B),
        }
        db = MagicMock()

        with patch(
            "app.routes.search_models.resolve_embed_project_context",
            return_value=(project_b, OWNER_ID),
        ):
            db.query.return_value.filter.return_value.first.return_value = settings_row

            result = await get_search_customization(db=db, auth_result=auth)

        assert result.searchButtonText == "Find"
        assert result.questionsPosition == "above-search"
        assert result.predefinedQuestions is True
        assert result.questions == ["Help"]


class TestSearchFeedbackApiKey:
    @pytest.mark.asyncio
    async def test_api_key_auth_rejects_unscoped_on_search_feedback(self):
        from app.routes.rag import submit_search_feedback
        from app.schemas import FeedbackRequest

        auth = {
            "type": "api_key",
            "user_id": CREATOR_ID,
            "api_key": SimpleNamespace(project_id=None),
        }
        req = FeedbackRequest(
            session_id="s1",
            message_id=str(uuid.uuid4()),
            feedback=True,
        )
        db = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            await submit_search_feedback(req=req, db=db, auth=auth)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_api_key_search_feedback_updates_message_in_same_project(self):
        from app.routes.rag import submit_search_feedback
        from app.schemas import FeedbackRequest

        message_id = uuid.uuid4()
        chat_message = SimpleNamespace(
            message_id=message_id,
            project_id=PROJECT_B,
            feedback=None,
            feedback_rating=None,
            feedback_text=None,
            context_tags=None,
            updated_at=None,
        )
        auth = {
            "type": "api_key",
            "user_id": CREATOR_ID,
            "api_key": _make_api_key(PROJECT_B, created_by_id=CREATOR_ID),
        }
        req = FeedbackRequest(
            session_id="s1",
            message_id=str(message_id),
            feedback=True,
            rating=5,
        )
        db = MagicMock()
        db.query.return_value = _FeedbackQueryChain(chat_message)

        with patch("app.routes.rag._is_search_feedback_enabled", return_value=True), patch(
            "app.services.feedback_reason_catalog.normalize_context_tags",
            return_value=([], []),
        ):
            result = await submit_search_feedback(req=req, db=db, auth=auth)

        assert result["success"] is True
        assert chat_message.feedback is True
        db.commit.assert_called_once()


class _FeedbackQueryChain:
    def __init__(self, result):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result


class TestChatFeedbackApiKey:
    @pytest.mark.asyncio
    async def test_api_key_feedback_not_found_for_other_project_message(self):
        from app.routes.rag import submit_feedback
        from app.schemas import FeedbackRequest

        message_id = uuid.uuid4()
        auth = {
            "type": "api_key",
            "user_id": CREATOR_ID,
            "api_key": _make_api_key(PROJECT_B),
        }
        req = FeedbackRequest(
            session_id="s1",
            message_id=str(message_id),
            feedback=True,
            rating=5,
        )
        db = MagicMock()
        db.query.return_value = _FeedbackQueryChain(None)

        with pytest.raises(HTTPException) as exc_info:
            await submit_feedback(req=req, db=db, auth=auth)
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_api_key_feedback_rejects_unscoped_key(self):
        from app.routes.rag import submit_feedback
        from app.schemas import FeedbackRequest

        auth = {
            "type": "api_key",
            "user_id": CREATOR_ID,
            "api_key": SimpleNamespace(project_id=None),
        }
        req = FeedbackRequest(
            session_id="s1",
            message_id=str(uuid.uuid4()),
            feedback=True,
        )
        db = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            await submit_feedback(req=req, db=db, auth=auth)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_api_key_feedback_updates_message_in_same_project(self):
        from app.routes.rag import submit_feedback
        from app.schemas import FeedbackRequest

        message_id = uuid.uuid4()
        chat_message = SimpleNamespace(
            message_id=message_id,
            project_id=PROJECT_B,
            feedback=None,
            feedback_rating=None,
            feedback_text=None,
            context_tags=None,
            updated_at=None,
        )
        auth = {
            "type": "api_key",
            "user_id": CREATOR_ID,
            "api_key": _make_api_key(PROJECT_B, created_by_id=CREATOR_ID),
        }
        req = FeedbackRequest(
            session_id="s1",
            message_id=str(message_id),
            feedback=True,
            rating=4,
        )
        db = MagicMock()
        db.query.return_value = _FeedbackQueryChain(chat_message)

        with patch("app.routes.rag._is_chat_feedback_enabled", return_value=True), patch(
            "app.services.feedback_reason_catalog.normalize_context_tags",
            return_value=([], []),
        ), patch("app.routes.rag._build_session_scope", return_value="k:1"), patch(
            "app.routes.rag._sessions", return_value=MagicMock(get=MagicMock(return_value=None))
        ):
            result = await submit_feedback(req=req, db=db, auth=auth)

        assert result["success"] is True
        assert chat_message.feedback is True
        db.commit.assert_called_once()


def _make_request(path="/api/v1/chatbot/settings", headers=None):
    from starlette.requests import Request

    raw_headers = []
    for k, v in (headers or {}).items():
        raw_headers.append((k.lower().encode(), v.encode()))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "headers": raw_headers,
            "query_string": b"",
        }
    )


class _MobileAuthFakeDb:
    def __init__(self, api_key=None):
        self.api_key = api_key

    def query(self, model):
        name = getattr(model, "__name__", str(model))
        if name == "APIKey":
            return _FakeQuery(self.api_key)
        return _FakeQuery(None)

    def execute(self, *args, **kwargs):
        return None

    def commit(self):
        return None

    def rollback(self):
        return None


class TestGetProjectIdOrUserMobileKey:
    @pytest.mark.asyncio
    async def test_unknown_rgs_live_key_returns_invalid_api_key(self):
        from app.auth import get_project_id_or_user

        request = _make_request()
        db = _MobileAuthFakeDb(api_key=None)

        with pytest.raises(HTTPException) as exc_info:
            await get_project_id_or_user(
                request=request,
                authorization="Bearer rgs_live_nonexistent_key_value",
                x_project_id=None,
                x_widget_mode=None,
                x_request_domain=None,
                project_id=None,
                db=db,
            )

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Invalid API key"
        assert "Invalid token" not in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_inactive_rgs_key_returns_inactive_detail(self):
        from app.auth import get_project_id_or_user

        inactive_key = SimpleNamespace(
            id=1,
            project_id=PROJECT_B,
            created_by_id=CREATOR_ID,
            is_active=False,
            expires_at=None,
            request_count=0,
        )
        request = _make_request()
        db = _MobileAuthFakeDb(api_key=inactive_key)

        with pytest.raises(HTTPException) as exc_info:
            await get_project_id_or_user(
                request=request,
                authorization="Bearer rgs_live_inactive_key_value",
                x_project_id=None,
                x_widget_mode=None,
                x_request_domain=None,
                project_id=None,
                db=db,
            )

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "API key is inactive"

    @pytest.mark.asyncio
    async def test_expired_rgs_key_returns_expired_detail(self):
        from datetime import datetime, timedelta

        from app.auth import get_project_id_or_user

        expired_key = SimpleNamespace(
            id=2,
            project_id=PROJECT_B,
            created_by_id=CREATOR_ID,
            is_active=True,
            expires_at=datetime.utcnow() - timedelta(days=1),
            request_count=0,
        )
        request = _make_request()
        db = _MobileAuthFakeDb(api_key=expired_key)

        with pytest.raises(HTTPException) as exc_info:
            await get_project_id_or_user(
                request=request,
                authorization="Bearer rgs_test_expired_key_value",
                x_project_id=None,
                x_widget_mode=None,
                x_request_domain=None,
                project_id=None,
                db=db,
            )

        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "API key has expired"
