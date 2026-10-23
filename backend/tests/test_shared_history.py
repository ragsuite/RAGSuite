"""History page lists project-wide rows; widget/in-app reads stay personal."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.routes import rag


def _history_where_clause(monkeypatch, source):
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


def test_chat_history_page_source_is_project_wide(monkeypatch):
    where = _history_where_clause(monkeypatch, "page")
    assert "user_id" not in where
    assert "project_id" in where


def test_chat_history_widget_source_stays_personal(monkeypatch):
    where = _history_where_clause(monkeypatch, "widget")
    assert "user_id" in where


def test_chat_history_default_source_stays_personal(monkeypatch):
    where = _history_where_clause(monkeypatch, None)
    assert "user_id" in where


def test_chat_session_summary_is_project_wide(monkeypatch):
    captured = {}

    def fake_list(*args, **kwargs):
        captured["args"] = args
        captured.update(kwargs)
        return [], 0

    monkeypatch.setattr(
        "app.services.session_summary.list_session_summaries",
        fake_list,
    )
    monkeypatch.setattr(
        rag,
        "_resolve_history_project",
        lambda db, user, project_id=None: SimpleNamespace(id=uuid.uuid4()),
    )

    import asyncio

    asyncio.run(
        rag.list_chat_sessions_summary(
            project_id=None,
            q=None,
            date_from=None,
            date_to=None,
            limit=50,
            offset=0,
            db=MagicMock(),
            current_user=SimpleNamespace(id=7),
        )
    )
    assert captured.get("user_id") is None


def test_search_history_page_is_project_wide(monkeypatch):
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

    rag.get_search_history(
        session_id=None,
        q=None,
        project_id=None,
        date_from=None,
        date_to=None,
        limit=50,
        offset=0,
        source="page",
        grouped=False,
        paginated=False,
        db=Session(),
        current_user=SimpleNamespace(id=1),
    )
    where = captured["sql"].split("WHERE", 1)[1]
    assert "user_id" not in where
    assert "project_id" in where


def test_search_history_widget_stays_personal(monkeypatch):
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
    monkeypatch.setattr(rag, "should_persist_search", lambda db, project_id: True)

    rag.get_search_history(
        session_id="search_1_2026-10-23",
        q=None,
        project_id=None,
        date_from=None,
        date_to=None,
        limit=50,
        offset=0,
        source="widget",
        grouped=False,
        paginated=False,
        db=Session(),
        current_user=SimpleNamespace(id=1),
    )
    where = captured["sql"].split("WHERE", 1)[1]
    assert "user_id" in where
