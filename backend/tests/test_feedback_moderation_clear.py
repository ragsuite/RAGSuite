"""DELETE /feedback/moderation/{message_id}: clears saved moderation for one feedback message."""

from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routes import feedback_moderation as routes


class _FakeQuery:
    def __init__(self, result):
        self._result = result

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self._result


class _FakeSession:
    def __init__(self, message):
        self._message = message
        self.committed = False

    def query(self, *_args, **_kwargs):
        return _FakeQuery(self._message)

    def add(self, _obj):
        pass

    def commit(self):
        self.committed = True


def _clear(message_id: str, db: _FakeSession):
    return asyncio.run(
        routes.clear_feedback_moderation(
            message_id=message_id,
            db=db,
            current_user=SimpleNamespace(id=1),
            active_project=SimpleNamespace(id=uuid.uuid4()),
        )
    )


def test_clear_removes_saved_moderation():
    message = SimpleNamespace(
        feedback_moderation={"internal_notes": "check", "reviewed": True, "flagged": True},
        updated_at=None,
    )
    db = _FakeSession(message)

    result = _clear(str(uuid.uuid4()), db)

    assert result == {"success": True, "feedback_moderation": None}
    assert message.feedback_moderation is None
    assert message.updated_at is not None
    assert db.committed


def test_clear_rejects_invalid_message_id():
    with pytest.raises(HTTPException) as exc:
        _clear("not-a-uuid", _FakeSession(None))
    assert exc.value.status_code == 400


def test_clear_returns_404_when_message_missing():
    db = _FakeSession(None)
    with pytest.raises(HTTPException) as exc:
        _clear(str(uuid.uuid4()), db)
    assert exc.value.status_code == 404
    assert not db.committed
