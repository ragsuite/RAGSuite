"""Voice Pilot ChatMessage persist for History Chatbot sessions."""
from __future__ import annotations

from uuid import uuid4

from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()


class _FakeDb:
    def __init__(self):
        self.added = []
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


def test_persist_voice_pilot_chat_turn_writes_chat_message(monkeypatch):
    from ragsuite_modules.ai_voice_pilot.backend.chat_persist import persist_voice_pilot_chat_turn

    fake = _FakeDb()
    monkeypatch.setattr("app.db.SessionLocal", lambda: fake)
    monkeypatch.setattr(
        "app.services.history_storage.should_persist_chat",
        lambda _db, _pid: True,
    )
    monkeypatch.setattr(
        "app.services.rag.vector_store.es_client.configured",
        lambda: True,
    )

    project_id = uuid4()
    wrote = persist_voice_pilot_chat_turn(
        project_id=project_id,
        user_id=7,
        session_id="vp-session-1",
        user_message="What is RAGSuite?",
        assistant_response="RAGSuite is a RAG platform.",
        total_ms=120,
    )
    assert wrote is True
    assert fake.committed is True
    assert len(fake.added) == 1
    msg = fake.added[0]
    assert msg.message_type == "chat"
    assert msg.session_id == "vp-session-1"
    assert msg.user_message == "What is RAGSuite?"
    assert msg.assistant_response == "RAGSuite is a RAG platform."
    assert msg.project_id == project_id
    assert msg.execution_snapshot["runtime_params"]["vector_store"] == "elasticsearch"


def test_persist_voice_pilot_skips_without_session_id(monkeypatch):
    from ragsuite_modules.ai_voice_pilot.backend.chat_persist import persist_voice_pilot_chat_turn

    fake = _FakeDb()
    monkeypatch.setattr("app.db.SessionLocal", lambda: fake)
    monkeypatch.setattr(
        "app.services.history_storage.should_persist_chat",
        lambda _db, _pid: True,
    )

    wrote = persist_voice_pilot_chat_turn(
        project_id=uuid4(),
        user_id=1,
        session_id=None,
        user_message="What is RAGSuite?",
        assistant_response="RAGSuite is a RAG platform.",
    )
    assert wrote is False
    assert fake.added == []
    assert fake.closed is False


def test_persist_voice_pilot_honors_store_history_off(monkeypatch):
    from ragsuite_modules.ai_voice_pilot.backend.chat_persist import persist_voice_pilot_chat_turn

    fake = _FakeDb()
    monkeypatch.setattr("app.db.SessionLocal", lambda: fake)
    monkeypatch.setattr(
        "app.services.history_storage.should_persist_chat",
        lambda _db, _pid: False,
    )

    wrote = persist_voice_pilot_chat_turn(
        project_id=uuid4(),
        user_id=1,
        session_id="vp-session-off",
        user_message="What is RAGSuite?",
        assistant_response="RAGSuite is a RAG platform.",
    )
    assert wrote is False
    assert fake.added == []
    assert fake.closed is True


def test_canned_idle_lines_are_not_persisted_by_helper():
    """Greeting / follow-up / end use /widget/tts and never call persist."""
    from ragsuite_modules.ai_voice_pilot.backend import routes

    assert not hasattr(routes, "persist_voice_pilot_chat_turn")
    assert "persist_voice_pilot_chat_turn" not in getattr(routes, "__all__", [])
