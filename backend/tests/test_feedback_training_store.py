"""Train / untrain feedback, route scope, and the reward memory end to end with a fake embedder."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db as app_db
from app.models import Base, ChatMessage, FeedbackTrainingExample, Project, User
from app.platform.auth import _permission_for_request_path
from app.routes import feedback_training as routes
from app.schemas import FeedbackTrainingRequest
from app.services.feedback_training import hook, memory, store
from app.services.rag import kb_generation

LIKED_URL = "https://shop.example/returns"
OTHER_URL = "https://shop.example/blog"


class FakeEmbed:
    """Maps a question to a 2-d vector by topic so similarity is predictable."""

    model_name = "fake-embed"

    def __init__(self):
        self.calls = 0

    def get_text_embedding_batch(self, texts, show_progress=False):
        self.calls += 1
        return [[1.0, 0.0] if "return" in t.lower() else [0.0, 1.0] for t in texts]


@pytest.fixture()
def db(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(app_db, "SessionLocal", factory)
    generation = {"value": 0}
    monkeypatch.setattr(kb_generation, "current", lambda: str(generation["value"]))
    monkeypatch.setattr(kb_generation, "bump", lambda: generation.__setitem__("value", generation["value"] + 1))
    monkeypatch.setattr(routes, "emit_audit", lambda **_kw: None)
    memory.invalidate()
    session = factory()
    try:
        yield session
    finally:
        session.close()
        memory.invalidate()


@pytest.fixture()
def project(db):
    owner = User(username="admin", email="admin@example.com", hashed_password="x" * 60)
    db.add(owner)
    db.flush()
    proj = Project(name="P", owner_id=owner.id)
    db.add(proj)
    db.commit()
    return proj


def _feedback(db, project, *, liked=True, tags=None, new=True, question="How do returns work?"):
    message = ChatMessage(
        project_id=project.id,
        session_id="s",
        message_id=uuid.uuid4(),
        user_message=question,
        assistant_response="- Return within 30 days\n- Keep the receipt",
        sources=[{"title": "Returns", "url": LIKED_URL}, {"title": "Returns", "url": LIKED_URL}],
        feedback=liked,
        context_tags=tags,
        feedback_text="Short and to the point",
        feedback_at=datetime.now(timezone.utc) if new else None,
    )
    db.add(message)
    db.commit()
    return message


def _entries():
    return [
        {"doc": "blog", "id": "c0", "meta": {"url": OTHER_URL}, "dist": 0.1},
        {"doc": "returns", "id": "c1", "meta": {"url": LIKED_URL + "/"}, "dist": 0.2},
    ]


def test_old_feedback_is_not_eligible(db, project):
    message = _feedback(db, project, new=False)
    assert store.training_state(message, None)["eligible"] is False
    with pytest.raises(store.TrainingNotEligible):
        store.train(db, message, user_id=None, guidance=None)


def test_train_snapshots_feedback_and_retrain_updates_in_place(db, project):
    message = _feedback(db, project, liked=False, tags=["incorrect"])
    example = store.train(db, message, user_id=project.owner_id, guidance="  Cite the policy page.  ")
    assert example.reward == -1
    assert example.cited_urls == [LIKED_URL]
    assert example.guidance == "Cite the policy page."
    assert example.reason_tags == ["incorrect"]
    assert example.answer_profile["has_list"] is True
    example.embeddings = {"x": [1.0]}
    db.commit()

    message.user_message = "How do refunds work?"
    db.commit()
    again = store.train(db, message, user_id=project.owner_id, guidance=None)
    assert again.id == example.id and again.guidance is None and again.embeddings is None
    assert db.query(FeedbackTrainingExample).count() == 1
    state = store.training_state(message, again)
    assert state["active"] is True and state["reward"] == -1


def test_untrain_deactivates_and_reports_never_trained(db, project):
    message = _feedback(db, project)
    assert store.untrain(db, message) is None
    store.train(db, message, user_id=None, guidance=None)
    example = store.untrain(db, message)
    assert example is not None and example.is_active is False
    state = store.training_state(message, example)
    assert state == {**state, "active": False, "reward": None, "trained_at": None}


def test_routes_scope_to_project_and_reject_old_feedback(db, project):
    user = db.get(User, project.owner_id)
    request = SimpleNamespace()
    other = Project(name="Other", owner_id=user.id)
    db.add(other)
    db.commit()
    message = _feedback(db, project)

    with pytest.raises(HTTPException) as missing:
        routes.get_feedback_training(str(message.message_id), db=db, current_user=user, active_project=other)
    assert missing.value.status_code == 404
    with pytest.raises(HTTPException) as bad_id:
        routes.get_feedback_training("not-a-uuid", db=db, current_user=user, active_project=project)
    assert bad_id.value.status_code == 400

    trained = routes.train_feedback(
        str(message.message_id), FeedbackTrainingRequest(guidance="Be brief"), request,
        db=db, current_user=user, active_project=project,
    )
    assert trained.active is True and trained.reward == 1 and trained.guidance == "Be brief"
    removed = routes.untrain_feedback(str(message.message_id), request, db=db, current_user=user, active_project=project)
    assert removed.active is False

    old = _feedback(db, project, new=False)
    with pytest.raises(HTTPException) as conflict:
        routes.train_feedback(
            str(old.message_id), FeedbackTrainingRequest(), request, db=db, current_user=user, active_project=project
        )
    assert conflict.value.status_code == 409


def test_training_routes_require_feedback_moderation_permission():
    path = f"/api/v1/feedback/moderation/{uuid.uuid4()}/training"
    assert _permission_for_request_path(path) == "feedback:moderate"


def test_training_reorders_similar_questions_and_untrain_restores(db, project):
    embed = FakeEmbed()
    message = _feedback(db, project, tags=["clear"])
    pid = str(project.id)

    entries, info = hook.apply(_entries(), pid, [1.0, 0.0], embed)
    assert [e["id"] for e in entries] == ["c0", "c1"] and info["applied"] is False

    store.train(db, message, user_id=None, guidance="Lead with the deadline.")
    entries, info = hook.apply(_entries(), pid, [0.99, 0.05], embed)
    assert [e["id"] for e in entries] == ["c1", "c0"]
    assert info["applied"] is True and info["examples"][0]["reward"] == 1
    assert "Lead with the deadline." in info["preferences"]
    assert hook.preference_instruction({"feedback_memory": info}) == info["preferences"]
    stored = db.query(FeedbackTrainingExample).one()
    db.refresh(stored)
    assert "FakeEmbed|fake-embed" in stored.embeddings

    unrelated, info = hook.apply(_entries(), pid, [0.0, 1.0], embed)
    assert [e["id"] for e in unrelated] == ["c0", "c1"] and info["reason"] == "no_match"

    store.untrain(db, message)
    entries, info = hook.apply(_entries(), pid, [1.0, 0.0], embed)
    assert [e["id"] for e in entries] == ["c0", "c1"] and info["applied"] is False


def test_vectors_from_another_embedder_are_never_compared(db, project):
    store.train(db, _feedback(db, project), user_id=None, guidance=None)
    example = db.query(FeedbackTrainingExample).one()
    example.embeddings = {"OtherEmbed|other": [1.0, 0.0]}
    db.commit()
    memory.invalidate()

    class BrokenEmbed(FakeEmbed):
        def get_text_embedding_batch(self, texts, show_progress=False):
            raise RuntimeError("provider down")

    assert memory.match(str(project.id), [1.0, 0.0], BrokenEmbed()) == []
    assert len(memory.match(str(project.id), [1.0, 0.0], FakeEmbed())) == 1
    assert memory.match(str(project.id), [1.0, 0.0, 0.0], FakeEmbed()) == []


def test_preferences_reach_the_prompt_only_when_present():
    from app.services.rag.rag import RAG

    rag = RAG.__new__(RAG)
    kwargs = dict(top_k=5, generate_topk=False, cite_passages=True, mode="chat")
    block = "ANSWER PREFERENCES (learned):\n- Keep: Use clear, simple wording."
    with_prefs = rag._build_prompt("q?", "[S1]\nx", preference_instruction=block, **kwargs)
    plain = rag._build_prompt("q?", "[S1]\nx", **kwargs)
    assert block in with_prefs and "ANSWER PREFERENCES" not in plain
    assert with_prefs.index(block) < with_prefs.index("DOCUMENTS:")
