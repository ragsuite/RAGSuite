"""Tests for transcript email persistence on chat session meta."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.models import ChatSessionMeta
from app.services.chat_session_meta import (
    append_transcript_email_if_persisting,
    get_transcript_emails_for_sessions,
    normalize_transcript_email,
)


def test_normalize_transcript_email():
    assert normalize_transcript_email("  Foo@Bar.COM ") == "foo@bar.com"


def test_append_creates_row_with_first_email():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    project_id = uuid.uuid4()

    with patch(
        "app.services.chat_session_meta.ensure_chat_session_meta_table",
        return_value=True,
    ):
        append_transcript_email_if_persisting(
            db,
            project_id=project_id,
            session_id="sess-1",
            email="A@x.com",
        )

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    assert isinstance(added, ChatSessionMeta)
    assert added.transcript_emails == ["a@x.com"]
    db.flush.assert_called_once()


def test_append_dedupes_and_accumulates():
    db = MagicMock()
    project_id = uuid.uuid4()
    existing = ChatSessionMeta(
        project_id=project_id,
        session_id="sess-1",
        message_type="chat",
        transcript_emails=["a@x.com"],
    )
    db.query.return_value.filter.return_value.first.return_value = existing

    with patch(
        "app.services.chat_session_meta.ensure_chat_session_meta_table",
        return_value=True,
    ):
        append_transcript_email_if_persisting(
            db,
            project_id=project_id,
            session_id="sess-1",
            email="a@x.com",
        )
        assert existing.transcript_emails == ["a@x.com"]
        db.add.assert_not_called()

        append_transcript_email_if_persisting(
            db,
            project_id=project_id,
            session_id="sess-1",
            email="b@x.com",
        )
    assert existing.transcript_emails == ["a@x.com", "b@x.com"]


def test_append_skips_when_table_unavailable():
    db = MagicMock()
    with patch(
        "app.services.chat_session_meta.ensure_chat_session_meta_table",
        return_value=False,
    ):
        append_transcript_email_if_persisting(
            db,
            project_id=uuid.uuid4(),
            session_id="sess-1",
            email="a@x.com",
        )
    db.query.assert_not_called()
    db.add.assert_not_called()


def test_get_emails_empty_when_table_unavailable():
    db = MagicMock()
    with patch(
        "app.services.chat_session_meta.ensure_chat_session_meta_table",
        return_value=False,
    ):
        out = get_transcript_emails_for_sessions(
            db,
            project_id=uuid.uuid4(),
            session_ids=["sess-1"],
        )
    assert out == {}
    db.query.assert_not_called()
