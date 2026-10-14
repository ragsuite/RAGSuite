"""Smoke tests for session summary helpers."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from app.services.session_summary import (
    _message_base_filters,
    _preview_text,
    _session_ids_matching_email_q,
)


def test_preview_text_truncates():
    long = "a" * 200
    out = _preview_text(long, max_len=10)
    assert len(out) == 10
    assert out.endswith("…")


def test_session_ids_matching_email_q_empty():
    from unittest.mock import MagicMock

    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = []
    assert _session_ids_matching_email_q(
        db, project_id=__import__("uuid").uuid4(), message_type="chat", q=""
    ) == []


def test_message_base_filters_include_rows_hidden_from_widget():
    query = _message_base_filters(
        Session(),
        project=SimpleNamespace(id=uuid.uuid4()),
        message_type="chat",
        date_from=None,
        date_to=None,
        require_feedback=True,
    )
    sql = str(query.statement.compile(dialect=postgresql.dialect()))
    where = sql.split("WHERE", 1)[1]
    assert "hidden_from_widget" not in where
    assert "feedback IS NOT NULL" in where
