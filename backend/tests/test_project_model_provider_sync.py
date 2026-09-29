"""Widget settings rows follow project provider configs (Model Configuration phase 2)."""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, ChatbotSettings, Project, SearchSettings, User
from app.services import project_model_provider_sync as sync
from app.services.project_model_provider_save import save_provider_config

OPENAI_KEY = "sk-test-abcdefghijklmnopqrstuvwxyz0123"
MISTRAL_KEY = "mistral-test-key-abcdefghijklmnopqr"


@pytest.fixture()
def db(monkeypatch):
    monkeypatch.setattr(sync, "_invalidate_embedding_caches", lambda _pid: None)
    monkeypatch.setattr(sync, "_sync_compare_profiles", lambda _db, _touched: None)
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def project(db):
    owner = User(username="owner", email="owner@example.com", hashed_password="x" * 60)
    db.add(owner)
    db.flush()
    proj = Project(name="Main", owner_id=owner.id)
    db.add(proj)
    db.commit()
    return proj


def _configure_openai(db, project, **overrides):
    data = {
        "chat_model": "gpt-4o",
        "embedding_model": "text-embedding-3-small",
        "api_key": OPENAI_KEY,
        "temperature": "0.2",
    }
    data.update(overrides)
    return save_provider_config(db, project_id=project.id, provider="openai", user_id=None, data=data)


def test_fill_update_uses_provider_config_for_chat(db, project):
    _configure_openai(db, project)
    update = {"model_provider": "openai", "chat_model": "client-sent", "chat_top_k": 7}
    assert sync.fill_update_from_project_provider(db, project.id, update, "chat") is True
    assert update["chat_model"] == "gpt-4o"
    assert update["api_key"] == OPENAI_KEY
    assert update["embedding_model"] == "text-embedding-3-small"
    assert update["chat_temperature"] == "0.2"
    assert update["chat_top_k"] == 7
    for retired in ("chat_top_p", "chat_best_of", "chat_frequency_penalty", "chat_presence_penalty"):
        assert update[retired] is None


def test_fill_update_maps_search_fields(db, project):
    _configure_openai(db, project)
    update = {"model_provider": "openai", "search_top_k": 4}
    sync.fill_update_from_project_provider(db, project.id, update, "search")
    assert update["search_model"] == "gpt-4o"
    assert update["search_temperature"] == "0.2"
    assert update["search_top_p"] is None
    assert "chat_model" not in update
    assert update["search_top_k"] == 4


def test_fill_update_leaves_unconfigured_provider_untouched(db, project):
    update = {"model_provider": "mistral", "chat_model": "mistral-small-latest", "api_key": MISTRAL_KEY}
    before = dict(update)
    assert sync.fill_update_from_project_provider(db, project.id, update, "chat") is False
    assert update == before


def test_ollama_fill_keeps_route_key_handling(db, project):
    save_provider_config(db, project_id=project.id, provider="ollama", user_id=None, data={"chat_model": "llama3:8b"})
    update = {"model_provider": "custom-llm"}
    sync.fill_update_from_project_provider(db, project.id, update, "chat")
    assert update["model_provider"] == "ollama"
    assert update["chat_model"] == "llama3:8b"
    assert "api_key" not in update


def test_propagate_updates_matching_rows_only(db, project):
    other = User(username="member", email="member@example.com", hashed_password="x" * 60)
    db.add(other)
    db.flush()
    db.add_all(
        [
            ChatbotSettings(user_id=project.owner_id, project_id=project.id, model_provider="openai",
                            chat_model="gpt-3.5-turbo", api_key="sk-old-key-000000000000000000", chat_top_k=9,
                            chat_top_p="0.8", chat_presence_penalty="0.5"),
            SearchSettings(user_id=other.id, project_id=project.id, model_provider="openai",
                           search_model="gpt-3.5-turbo", api_key="sk-old-key-000000000000000000"),
            ChatbotSettings(user_id=other.id, project_id=project.id, model_provider="mistral",
                            chat_model="mistral-small-latest", api_key=MISTRAL_KEY),
        ]
    )
    db.commit()

    _configure_openai(db, project, chat_model="gpt-4.1")
    counts = sync.propagate_provider_to_settings(db, project.id, "openai")
    assert counts == {"chat": 1, "search": 1}

    owner_chat = db.query(ChatbotSettings).filter_by(user_id=project.owner_id).one()
    assert (owner_chat.chat_model, owner_chat.api_key, owner_chat.chat_top_k) == ("gpt-4.1", OPENAI_KEY, 9)
    assert (owner_chat.chat_top_p, owner_chat.chat_presence_penalty) == (None, None)
    search = db.query(SearchSettings).one()
    assert (search.search_model, search.api_key, search.search_temperature) == ("gpt-4.1", OPENAI_KEY, "0.2")
    mistral = db.query(ChatbotSettings).filter_by(user_id=other.id).one()
    assert (mistral.chat_model, mistral.api_key) == ("mistral-small-latest", MISTRAL_KEY)

    assert sync.propagate_provider_to_settings(db, project.id, "openai") == {"chat": 0, "search": 0}
