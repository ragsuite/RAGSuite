"""Smoke tests for session summary helpers."""

from __future__ import annotations

from app.services.session_summary import _preview_text, _session_ids_matching_email_q


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
