"""Tests for per-project history storage guards."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.history_storage import (
    HISTORY_OFF_TTL,
    HISTORY_ON_TTL,
    chat_session_ttl,
    is_chat_history_enabled,
    is_search_history_enabled,
    search_session_ttl,
    session_ttl_seconds,
    should_persist_chat,
    should_persist_search,
)
from app.services.search_persist import persist_search_exchange

PROJECT_ID = uuid.uuid4()


class _ScalarQuery:
    def __init__(self, value, *, missing: bool = False):
        self._value = value
        self._missing = missing

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def first(self):
        if self._missing:
            return None
        return (self._value,)


def test_session_ttl_seconds():
    assert session_ttl_seconds(True) == HISTORY_ON_TTL
    assert session_ttl_seconds(False) == HISTORY_OFF_TTL


def test_is_chat_history_enabled_defaults_true_when_missing():
    db = MagicMock()
    db.query.return_value = _ScalarQuery(None, missing=True)
    assert is_chat_history_enabled(db, PROJECT_ID) is True


def test_is_chat_history_enabled_reads_setting():
    db = MagicMock()
    db.query.return_value = _ScalarQuery(False)
    assert is_chat_history_enabled(db, PROJECT_ID) is False
    assert should_persist_chat(db, PROJECT_ID) is False


def test_is_search_history_enabled_reads_setting():
    db = MagicMock()
    db.query.return_value = _ScalarQuery(True)
    assert is_search_history_enabled(db, PROJECT_ID) is True
    assert should_persist_search(db, PROJECT_ID) is True


def test_chat_session_ttl_follows_setting():
    db = MagicMock()
    db.query.return_value = _ScalarQuery(False)
    assert chat_session_ttl(db, PROJECT_ID) == HISTORY_OFF_TTL
    db.query.return_value = _ScalarQuery(True)
    assert chat_session_ttl(db, PROJECT_ID) == HISTORY_ON_TTL


def test_search_session_ttl_follows_setting():
    db = MagicMock()
    db.query.return_value = _ScalarQuery(False)
    assert search_session_ttl(db, PROJECT_ID) == HISTORY_OFF_TTL
    db.query.return_value = _ScalarQuery(True)
    assert search_session_ttl(db, PROJECT_ID) == HISTORY_ON_TTL


@patch("app.db.SessionLocal")
@patch("app.services.history_storage.should_persist_search", return_value=False)
@patch("app.services.session_store.append_search_turn")
def test_persist_search_exchange_skips_db_when_history_off(mock_append, _mock_should, mock_session_local):
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db

    persist_search_exchange(
        user_id=1,
        project_uuid=PROJECT_ID,
        session_id="sess-1",
        message_id=uuid.uuid4(),
        query="hello",
        answer="world",
        sources=[],
        api_key_id=None,
        llm_config_dict={},
        token_usage={},
        elapsed_ms=10,
        session_scope="w:test",
    )

    mock_append.assert_called_once()
    mock_db.add.assert_not_called()


@patch("app.db.SessionLocal")
@patch("app.services.history_storage.should_persist_search", return_value=False)
@patch("app.services.history_storage.search_session_ttl", return_value=HISTORY_OFF_TTL)
@patch("app.services.session_store.append_search_turn")
def test_persist_search_exchange_passes_off_ttl_to_redis(
    mock_append, _mock_ttl, _mock_should, mock_session_local,
):
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db

    persist_search_exchange(
        user_id=1,
        project_uuid=PROJECT_ID,
        session_id="sess-1",
        message_id=uuid.uuid4(),
        query="hello",
        answer="world",
        sources=[],
        api_key_id=None,
        llm_config_dict={},
        token_usage={},
        elapsed_ms=10,
        session_scope="w:test",
    )

    mock_append.assert_called_once()
    assert mock_append.call_args.args[4] == HISTORY_OFF_TTL


@patch("app.db.SessionLocal")
@patch("app.services.history_storage.should_persist_search", return_value=True)
def test_persist_search_exchange_writes_db_when_history_on(_mock_should, mock_session_local):
    mock_db = MagicMock()
    mock_session_local.return_value = mock_db

    persist_search_exchange(
        user_id=1,
        project_uuid=PROJECT_ID,
        session_id="sess-1",
        message_id=uuid.uuid4(),
        query="hello",
        answer="world",
        sources=[],
        api_key_id=None,
        llm_config_dict={},
        token_usage={},
        elapsed_ms=10,
    )

    assert mock_db.add.called
    assert mock_db.commit.called
