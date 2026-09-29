"""Model-specific Chatbot / Search tuning on project provider configs."""
from __future__ import annotations

import importlib.util
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, ChatbotSettings, Project, ProjectModelProvider, SearchSettings, User
from app.services import project_model_provider_sync as sync
from app.services.project_model_provider_save import save_provider_config
from app.services.project_model_provider_tuning import serialize_surface_tuning
from app.services.project_model_providers import ProviderConfigError

OPENAI_KEY = "sk-test-abcdefghijklmnopqrstuvwxyz0123"
MISTRAL_KEY = "mistral-test-key-abcdefghijklmnopqr"
MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "k1l2m3n4o5p6_add_provider_surface_tuning.py"


@pytest.fixture()
def engine(monkeypatch):
    monkeypatch.setattr(sync, "_invalidate_embedding_caches", lambda _pid: None)
    monkeypatch.setattr(sync, "_sync_compare_profiles", lambda _db, _touched: None)
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture()
def db(engine):
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


def _save(db, project, provider="openai", **tuning):
    key = OPENAI_KEY if provider == "openai" else MISTRAL_KEY
    data = {"chat_model": "gpt-4o" if provider == "openai" else "mistral-small-latest", "api_key": key, **tuning}
    return save_provider_config(db, project_id=project.id, provider=provider, user_id=None, data=data)


def _row(db, project, provider="openai") -> ProjectModelProvider:
    return db.query(ProjectModelProvider).filter_by(project_id=project.id, provider=provider).one()


def test_legacy_temperature_applies_to_both_surfaces(db, project):
    _save(db, project, temperature="0.4")
    row = _row(db, project)
    assert (row.chat_temperature, row.search_temperature, row.temperature) == ("0.4", "0.4", "0.4")
    assert serialize_surface_tuning(row)["search"]["temperature"] == "0.4"


def test_surface_values_stay_separate_and_chat_mirrors_legacy(db, project):
    _save(
        db,
        project,
        chat_temperature=0.3,
        search_temperature=0.9,
        chat_similarity_threshold=0.35,
        search_similarity_threshold=0.6,
        chat_max_tokens=900,
        search_max_tokens=1500,
    )
    row = _row(db, project)
    assert serialize_surface_tuning(row) == {
        "chat": {"temperature": "0.3", "similarity_threshold": 0.35, "max_tokens": 900},
        "search": {"temperature": "0.9", "similarity_threshold": 0.6, "max_tokens": 1500},
    }
    assert row.temperature == "0.3"


@pytest.mark.parametrize(
    "tuning",
    [{"chat_temperature": 1.5}, {"search_similarity_threshold": 1.2}, {"chat_max_tokens": 5000}],
)
def test_invalid_tuning_is_rejected(db, project, tuning):
    with pytest.raises(ProviderConfigError):
        _save(db, project, provider="mistral", **tuning)


def test_fill_copies_only_the_widget_surface(db, project):
    _save(db, project, chat_similarity_threshold=0.35, search_max_tokens=1500)
    update = {"model_provider": "openai", "chat_top_k": 7}
    sync.fill_update_from_project_provider(db, project.id, update, "chat")
    assert update["chat_similarity_threshold"] == 0.35
    assert "chat_max_tokens" not in update
    assert "search_max_tokens" not in update
    assert update["chat_top_k"] == 7


def test_widget_sent_tuning_never_changes_provider(db, project):
    _save(db, project, chat_temperature=0.3, chat_similarity_threshold=0.3, chat_max_tokens=1200)
    update = {
        "model_provider": "openai",
        "chat_temperature": "1.5",
        "chat_similarity_threshold": 0.4,
        "chat_max_tokens": 800,
        "chat_top_k": 9,
    }
    sync.fill_update_from_project_provider(db, project.id, update, "chat")
    row = _row(db, project)
    assert (row.chat_temperature, row.chat_similarity_threshold, row.chat_max_tokens) == ("0.3", 0.3, 1200)
    assert (update["chat_temperature"], update["chat_similarity_threshold"], update["chat_max_tokens"]) == (
        "0.3",
        0.3,
        1200,
    )
    assert update["chat_top_k"] == 9


def test_empty_provider_field_keeps_stored_widget_value(db, project):
    _save(db, project)
    update = {"model_provider": "openai", "search_max_tokens": 700, "search_similarity_threshold": 0.6}
    sync.fill_update_from_project_provider(db, project.id, update, "search")
    assert "search_max_tokens" not in update
    assert "search_similarity_threshold" not in update
    row = _row(db, project)
    assert (row.search_max_tokens, row.search_similarity_threshold) == (None, None)


def test_propagate_updates_matching_surface_and_keeps_widget_only_fields(db, project):
    db.add_all(
        [
            ChatbotSettings(user_id=project.owner_id, project_id=project.id, model_provider="openai",
                            chat_model="gpt-4o", api_key=OPENAI_KEY, chat_top_k=9, chat_use_reranker=True,
                            chat_max_tokens=800),
            SearchSettings(user_id=project.owner_id, project_id=project.id, model_provider="openai",
                           search_model="gpt-4o", api_key=OPENAI_KEY, search_top_k=4, search_max_tokens=1000),
        ]
    )
    db.commit()
    _save(db, project, search_max_tokens=1500)
    sync.propagate_provider_to_settings(db, project.id, "openai")
    chat = db.query(ChatbotSettings).one()
    search = db.query(SearchSettings).one()
    assert (chat.chat_max_tokens, chat.chat_top_k, chat.chat_use_reranker) == (800, 9, True)
    assert (search.search_max_tokens, search.search_top_k) == (1500, 4)


def _load_migration():
    spec = importlib.util.spec_from_file_location("provider_surface_tuning_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_backfill_uses_provider_temperature_and_newest_owner_widget(engine, db, project):
    member = User(username="member", email="member@example.com", hashed_password="x" * 60)
    db.add(member)
    db.flush()
    now = datetime.utcnow()
    db.add_all(
        [
            ProjectModelProvider(project_id=project.id, provider="openai", chat_model="gpt-4o", temperature="0.2"),
            ProjectModelProvider(project_id=project.id, provider="gemini", chat_model="gemini-2.0-flash"),
            ProjectModelProvider(project_id=project.id, provider="mistral", chat_model="mistral-small-latest"),
            ChatbotSettings(user_id=member.id, project_id=project.id, model_provider="openai",
                            chat_similarity_threshold=0.9, chat_max_tokens=2000, updated_at=now),
            ChatbotSettings(user_id=project.owner_id, project_id=project.id, model_provider="openai",
                            chat_similarity_threshold=0.35, chat_max_tokens=900,
                            updated_at=now - timedelta(days=1)),
            SearchSettings(user_id=project.owner_id, project_id=project.id, model_provider="google-gemini",
                           search_temperature="0.6", search_similarity_threshold=0.5, search_max_tokens=1200),
        ]
    )
    db.commit()

    with engine.begin() as conn:
        _load_migration()._backfill(conn)
    db.expire_all()

    openai = _row(db, project, "openai")
    assert (openai.chat_temperature, openai.search_temperature) == ("0.2", "0.2")
    assert (openai.chat_similarity_threshold, openai.chat_max_tokens) == (0.35, 900)
    assert (openai.search_similarity_threshold, openai.search_max_tokens) == (None, None)
    gemini = _row(db, project, "gemini")
    assert (gemini.search_temperature, gemini.search_similarity_threshold, gemini.search_max_tokens) == ("0.6", 0.5, 1200)
    assert gemini.chat_temperature is None
    mistral = _row(db, project, "mistral")
    assert all(getattr(mistral, c) is None for c in ("chat_temperature", "search_temperature", "chat_max_tokens"))
