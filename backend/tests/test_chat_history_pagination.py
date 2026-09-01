"""Chat history pagination envelope helpers."""

from __future__ import annotations

from unittest.mock import MagicMock

from app.routes.rag import _chat_history_response, _empty_chat_history_response


def test_empty_chat_history_response_array_default():
    assert _empty_chat_history_response(False, 20, 0) == []


def test_empty_chat_history_response_paginated_envelope():
    out = _empty_chat_history_response(True, 20, 10)
    assert out.items == []
    assert out.total == 0
    assert out.limit == 20
    assert out.offset == 10


def test_chat_history_response_paginated_envelope(monkeypatch):
    msg = MagicMock()
    monkeypatch.setattr(
        "app.routes.rag._chat_message_history_list_out",
        lambda _msg: {"id": "row-1"},
    )
    out = _chat_history_response([msg], True, 20, 40, 101)
    assert out.total == 101
    assert out.limit == 20
    assert out.offset == 40
    assert len(out.items) == 1


def test_chat_history_response_array_default(monkeypatch):
    msg = MagicMock()
    monkeypatch.setattr(
        "app.routes.rag._chat_message_history_list_out",
        lambda _msg: {"id": "row-1"},
    )
    out = _chat_history_response([msg], False, 20, 0, 0)
    assert out == [{"id": "row-1"}]
