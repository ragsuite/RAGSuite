"""GET /chat/history session reads: admin History (source=page) includes widget-hidden rows."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.routes import rag


def _session_history_where_clause(monkeypatch, source):
    captured = {}

    def fake_fetch(base, offset, limit, paginated):
        captured["sql"] = str(base.statement.compile(dialect=postgresql.dialect()))
        return [], 0

    monkeypatch.setattr(rag, "_fetch_chat_history_messages", fake_fetch)
    monkeypatch.setattr(
        rag,
        "_resolve_history_project",
        lambda db, user, project_id=None: SimpleNamespace(id=uuid.uuid4()),
    )
    monkeypatch.setattr(rag, "_column_exists_in_table", lambda db, table, column: True)

    rag.get_chat_history(
        session_id="session-1",
        q=None,
        project_id=None,
        date_from=None,
        date_to=None,
        limit=50,
        offset=0,
        paginated=False,
        source=source,
        db=Session(),
        auth={"type": "user", "user": SimpleNamespace(id=1)},
    )
    return captured["sql"].split("WHERE", 1)[1]


@pytest.mark.parametrize("source", [None, "widget"])
def test_session_history_hides_widget_hidden_rows_by_default(monkeypatch, source):
    where = _session_history_where_clause(monkeypatch, source)
    assert "hidden_from_widget" in where


def test_session_history_page_source_includes_widget_hidden_rows(monkeypatch):
    where = _session_history_where_clause(monkeypatch, "page")
    assert "hidden_from_widget" not in where
    assert "session_id" in where
