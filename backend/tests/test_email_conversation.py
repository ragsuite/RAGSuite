"""Tests for conversation email formatting helpers and email route polish."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from app.schemas import EmailConversationRequest
from app.services.conversation_email_format import (
    format_conversation_timestamp,
    markdown_to_email_html,
    markdown_to_plain_text,
    normalize_email_sources,
)
from app.services.transactional_email import send_conversation_email

PROJECT_A = uuid.uuid4()
USER_ID = 42


def _make_request(
    path="/api/v1/chat/conversation/email",
    query: str = "",
    client_host: str = "127.0.0.1",
):
    raw_query = query.encode() if query else b""
    return Request(
        {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "POST",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": raw_query,
            "headers": [],
            "client": (client_host, 12345),
            "server": ("test", 80),
        }
    )


class _QueryChain:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)


def _chat_row(*, project_id, session_id="sess-1", user_id=USER_ID, hidden=False, sources=None):
    return SimpleNamespace(
        project_id=project_id,
        session_id=session_id,
        user_id=user_id,
        message_type="chat",
        user_message="Hello",
        assistant_response="Hi **there**",
        created_at=datetime(2026, 9, 17, 4, 48, 33, 917872, tzinfo=timezone.utc),
        hidden_from_widget=hidden,
        sources=sources
        or [
            {"title": "T3Planet", "url": "https://example.com/services"},
        ],
        id=uuid.uuid4(),
    )


def test_format_conversation_timestamp_human_readable():
    stamp = format_conversation_timestamp(
        datetime(2026, 9, 17, 4, 48, 33, 917872, tzinfo=timezone.utc)
    )
    assert stamp == "17 Sep 2026, 04:48 UTC"
    assert "T04:48" not in stamp
    assert "+00:00" not in stamp


def test_markdown_to_plain_strips_markers():
    plain = markdown_to_plain_text("**services** and *AI*\n- item one")
    assert "**" not in plain
    assert "services" in plain
    assert "AI" in plain
    assert "• item one" in plain


def test_markdown_to_email_html_bold_and_list():
    html_body = markdown_to_email_html("**services**\n- Transparent pricing")
    assert "<strong>services</strong>" in html_body
    assert "**" not in html_body
    assert "<li" in html_body
    assert "Transparent pricing" in html_body


def test_normalize_email_sources_aliases():
    pairs = normalize_email_sources(
        [
            {"name": "Doc A", "source_url": "https://a.example/"},
            {"title": "Doc B", "url": "https://b.example/"},
            {"title": "Dup", "url": "https://a.example/"},
        ]
    )
    assert pairs == [
        ("Doc A", "https://a.example/"),
        ("Doc B", "https://b.example/"),
    ]


def test_send_conversation_email_uses_bot_name_stamp_markdown_sources():
    captured = {}

    def _fake_send(*, to_email, subject, html_body, text_body):
        captured["to_email"] = to_email
        captured["subject"] = subject
        captured["html_body"] = html_body
        captured["text_body"] = text_body

    with patch("app.services.transactional_email._send_smtp_sync", side_effect=_fake_send):
        send_conversation_email(
            to_email="user@example.com",
            assistant_name="Localhost",
            turns=[
                {
                    "user_message": "What services?",
                    "assistant_response": "We offer **services**\n- Support",
                    "created_at": datetime(2026, 9, 17, 4, 48, 33, tzinfo=timezone.utc),
                    "sources": [{"title": "Services", "url": "https://example.com/s"}],
                }
            ],
        )

    assert captured["subject"] == "Your conversation with Localhost"
    assert "RAGSuite" not in captured["subject"]
    assert "RAGSuite" not in captured["html_body"]
    assert "RAGSuite" not in captured["text_body"]
    assert "Localhost" in captured["html_body"]
    assert "17 Sep 2026, 04:48 UTC" in captured["html_body"]
    assert "2026-09-17T" not in captured["html_body"]
    assert "<strong>services</strong>" in captured["html_body"]
    assert "**services**" not in captured["html_body"]
    assert "https://example.com/s" in captured["html_body"]
    assert "Sources" in captured["html_body"]
    assert "— Localhost" in captured["text_body"]


@pytest.mark.asyncio
async def test_email_conversation_happy_path_widget():
    from app.routes.rag import email_chat_conversation

    row = _chat_row(project_id=PROJECT_A)
    auth = {"type": "widget", "project_id": PROJECT_A, "user_id": USER_ID}
    req = EmailConversationRequest(session_id="sess-1", email="user@example.com")
    db = MagicMock()
    db.query.return_value = _QueryChain([row])

    with patch(
        "app.services.transactional_email.smtp_delivery_ready", return_value=True
    ), patch(
        "app.services.transactional_email.send_conversation_email"
    ) as send_mail, patch(
        "app.routes.rag._column_exists_in_table", return_value=True
    ), patch(
        "app.services.rag.embedding_resolver.read_project_chatbot_settings",
        return_value=SimpleNamespace(chatbot_title="Localhost"),
    ), patch(
        "app.routes.chatbot._can_customize_chatbot_brand",
        return_value=True,
    ):
        result = await email_chat_conversation(
            request=_make_request(client_host="127.0.0.10"),
            req=req,
            db=db,
            auth=auth,
        )

    assert result["success"] is True
    assert result["data"]["turns"] == 1
    send_mail.assert_called_once()
    kwargs = send_mail.call_args.kwargs
    assert kwargs["to_email"] == "user@example.com"
    assert kwargs["assistant_name"] == "Localhost"
    assert kwargs["turns"][0]["sources"][0]["url"] == "https://example.com/services"
    assert kwargs["turns"][0]["created_at"] == row.created_at


@pytest.mark.asyncio
async def test_email_conversation_ce_forces_ragsuite_without_white_label():
    """Canonical row may store a custom title; CE without white-label still emails RAGSuite."""
    from app.routes.rag import email_chat_conversation

    row = _chat_row(project_id=PROJECT_A)
    auth = {"type": "widget", "project_id": PROJECT_A, "user_id": USER_ID}
    req = EmailConversationRequest(session_id="sess-1", email="user@example.com")
    db = MagicMock()
    db.query.return_value = _QueryChain([row])

    with patch(
        "app.services.transactional_email.smtp_delivery_ready", return_value=True
    ), patch(
        "app.services.transactional_email.send_conversation_email"
    ) as send_mail, patch(
        "app.routes.rag._column_exists_in_table", return_value=True
    ), patch(
        "app.services.rag.embedding_resolver.read_project_chatbot_settings",
        return_value=SimpleNamespace(chatbot_title="Localhost"),
    ), patch(
        "app.routes.chatbot._can_customize_chatbot_brand",
        return_value=False,
    ):
        result = await email_chat_conversation(
            request=_make_request(client_host="127.0.0.11"),
            req=req,
            db=db,
            auth=auth,
        )

    assert result["success"] is True
    assert send_mail.call_args.kwargs["assistant_name"] == "RAGSuite"


@pytest.mark.asyncio
async def test_email_conversation_smtp_not_ready():
    from app.routes.rag import (
        EMAIL_CONVERSATION_SMTP_NOT_READY_MESSAGE,
        email_chat_conversation,
    )

    auth = {"type": "widget", "project_id": PROJECT_A, "user_id": USER_ID}
    req = EmailConversationRequest(session_id="sess-1", email="user@example.com")
    db = MagicMock()

    with patch(
        "app.services.transactional_email.smtp_delivery_ready", return_value=False
    ):
        with pytest.raises(HTTPException) as exc_info:
            await email_chat_conversation(
                request=_make_request(client_host="127.0.0.12"),
                req=req,
                db=db,
                auth=auth,
            )
    assert exc_info.value.status_code == 503
    assert EMAIL_CONVERSATION_SMTP_NOT_READY_MESSAGE in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_email_conversation_empty_session():
    from app.routes.rag import EMAIL_CONVERSATION_EMPTY_MESSAGE, email_chat_conversation

    auth = {"type": "widget", "project_id": PROJECT_A, "user_id": USER_ID}
    req = EmailConversationRequest(session_id="sess-empty", email="user@example.com")
    db = MagicMock()
    db.query.return_value = _QueryChain([])

    with patch(
        "app.services.transactional_email.smtp_delivery_ready", return_value=True
    ), patch("app.routes.rag._column_exists_in_table", return_value=True):
        with pytest.raises(HTTPException) as exc_info:
            await email_chat_conversation(
                request=_make_request(client_host="127.0.0.13"),
                req=req,
                db=db,
                auth=auth,
            )
    assert exc_info.value.status_code == 400
    assert EMAIL_CONVERSATION_EMPTY_MESSAGE in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_email_conversation_api_key_rejects_unscoped():
    from app.routes.rag import email_chat_conversation

    auth = {
        "type": "api_key",
        "user_id": USER_ID,
        "api_key": SimpleNamespace(project_id=None),
    }
    req = EmailConversationRequest(session_id="sess-1", email="user@example.com")
    db = MagicMock()

    with patch(
        "app.services.transactional_email.smtp_delivery_ready", return_value=True
    ):
        with pytest.raises(HTTPException) as exc_info:
            await email_chat_conversation(
                request=_make_request(client_host="127.0.0.14"),
                req=req,
                db=db,
                auth=auth,
            )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_email_conversation_wrong_project_isolation():
    from app.routes.rag import EMAIL_CONVERSATION_EMPTY_MESSAGE, email_chat_conversation

    auth = {"type": "widget", "project_id": PROJECT_A, "user_id": USER_ID}
    req = EmailConversationRequest(session_id="sess-1", email="user@example.com")
    db = MagicMock()
    db.query.return_value = _QueryChain([])

    with patch(
        "app.services.transactional_email.smtp_delivery_ready", return_value=True
    ), patch("app.routes.rag._column_exists_in_table", return_value=True):
        with pytest.raises(HTTPException) as exc_info:
            await email_chat_conversation(
                request=_make_request(client_host="127.0.0.15"),
                req=req,
                db=db,
                auth=auth,
            )
    assert exc_info.value.status_code == 400
    assert EMAIL_CONVERSATION_EMPTY_MESSAGE in str(exc_info.value.detail)


def test_email_conversation_rejects_invalid_email():
    with pytest.raises(ValidationError):
        EmailConversationRequest(session_id="sess-1", email="not-an-email")
