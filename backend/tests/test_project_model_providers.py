"""Project-wide provider configs (Model Configuration module)."""
from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, ChatbotSettings, Project, ProjectModelProvider, SearchSettings, User
from app.services import project_model_provider_save as save_svc
from app.services import project_model_providers as svc

OPENAI_KEY = "sk-test-abcdefghijklmnopqrstuvwxyz0123"
OPENAI_401 = "chat_model: Failed: Error code: 401 - {'error': {'message': 'Incorrect API key provided'}}"


@pytest.fixture()
def db():
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


def _save(db, project, provider, **data):
    return save_svc.save_provider_config(db, project_id=project.id, provider=provider, user_id=None, data=data)


def test_hosted_provider_requires_api_key(db, project):
    with pytest.raises(svc.ProviderConfigError):
        _save(db, project, "openai", chat_model="gpt-4o")


def test_save_masks_key_and_counts_configured(db, project):
    row = _save(db, project, "openai", chat_model="gpt-4o", embedding_model="text-embedding-3-small", api_key=OPENAI_KEY)
    out = svc.serialize_provider_config(row, "openai")
    assert out["configured"] is True
    assert out["has_api_key"] is True
    assert OPENAI_KEY not in str(out)
    assert out["api_key_masked"].startswith("sk-t") and "..." in out["api_key_masked"]

    raw = db.execute(text("SELECT api_key FROM project_model_providers")).scalar()
    assert raw and raw != OPENAI_KEY

    payload = svc.build_providers_payload(db, project.id, include_live=False)
    assert payload["configured_count"] == 1
    openai = next(p for p in payload["providers"] if p["value"] == "openai")
    assert openai["config"]["chat_model"] == "gpt-4o"


@pytest.mark.parametrize("incoming", [None, "", "sk-t...0123"])
def test_empty_or_masked_key_keeps_stored_key(db, project, incoming):
    _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY)
    row = _save(db, project, "openai", chat_model="gpt-4.1", api_key=incoming)
    assert row.api_key == OPENAI_KEY
    assert row.chat_model == "gpt-4.1"


def test_new_key_resets_last_test_status(db, project):
    row = _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY)
    row.last_test_status = "success"
    db.commit()
    row = _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY + "x")
    assert row.last_test_status is None


def test_ollama_needs_no_key_and_anthropic_has_no_embedding(db, project):
    ollama = _save(db, project, "ollama", chat_model="llama3:8b", api_key="ignored-key-value")
    assert ollama.api_key is None
    assert svc.is_configured(ollama)

    anthropic = _save(
        db, project, "anthropic", chat_model="claude-sonnet-5", embedding_model="x", api_key=OPENAI_KEY
    )
    assert anthropic.embedding_model is None


def test_temperature_limit_follows_provider(db, project):
    row = _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY, temperature=1.5)
    assert row.temperature == "1.5"
    with pytest.raises(svc.ProviderConfigError):
        _save(db, project, "anthropic", chat_model="claude-sonnet-5", api_key=OPENAI_KEY, temperature=1.5)
    row = _save(db, project, "anthropic", chat_model="claude-sonnet-5", api_key=OPENAI_KEY, temperature=0.4)
    assert row.temperature == "0.4"


def test_save_clears_retired_tuning_params(db, project):
    row = _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY)
    row.top_p, row.best_of, row.frequency_penalty, row.presence_penalty = "0.9", 3, "0.5", "0.5"
    db.commit()
    row = _save(db, project, "openai", chat_model="gpt-4o", temperature=0.3)
    assert (row.top_p, row.best_of, row.frequency_penalty, row.presence_penalty) == (None, None, None, None)
    out = svc.serialize_provider_config(row, "openai")
    assert out["temperature"] == "0.3"
    assert "top_p" not in out and "best_of" not in out


def test_provider_aliases_and_unknown(db, project):
    assert svc.normalize_provider("google-gemini") == "gemini"
    assert svc.normalize_provider("custom-llm") == "ollama"
    assert svc.normalize_provider("azure_openai") == "azure_openai"
    assert svc.normalize_provider("Azure OpenAI") == "azure_openai"
    with pytest.raises(svc.ProviderConfigError):
        svc.normalize_provider("cohere")


def test_azure_openai_requires_endpoint(db, project):
    with pytest.raises(svc.ProviderConfigError, match="Endpoint"):
        _save(db, project, "azure_openai", chat_model="gpt-4o", api_key=OPENAI_KEY)
    row = _save(
        db,
        project,
        "azure_openai",
        chat_model="gpt-4o",
        embedding_model="text-embedding-3-small",
        api_key=OPENAI_KEY,
        endpoint="https://example.openai.azure.com",
        api_version="2024-12-01-preview",
    )
    assert row.endpoint == "https://example.openai.azure.com"
    assert row.api_version == "2024-12-01-preview"
    out = svc.serialize_provider_config(row, "azure_openai")
    assert out["endpoint"] == "https://example.openai.azure.com"
    assert out["api_version"] == "2024-12-01-preview"
    assert out["configured"] is True or out["has_api_key"] is True
    assert svc.resolve_provider_api_version(db, project.id, "azure_openai") == "2024-12-01-preview"
    assert svc.azure_openai_api_version(None) == "2024-10-21"


def test_delete_provider(db, project):
    _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY)
    assert svc.delete_provider_config(db, project.id, "openai") is True
    assert svc.delete_provider_config(db, project.id, "openai") is False


def test_connection_test_without_key_skips_probe(db, project, monkeypatch):
    async def _fail(*_a, **_k):  # pragma: no cover - must not run
        raise AssertionError("probe must not run without a key")

    monkeypatch.setattr(svc, "probe_provider_models", _fail)
    results = asyncio.run(
        svc.test_provider_config(
            db, project_id=project.id, provider="openai", chat_model="gpt-4o", embedding_model=None, api_key=None
        )
    )
    assert results["chat_model"].startswith("Failed: API key required")


def test_azure_connection_test_without_endpoint_soft_fails(db, project, monkeypatch):
    async def _fail(*_a, **_k):  # pragma: no cover - must not run
        raise AssertionError("probe must not run without an endpoint")

    monkeypatch.setattr(svc, "probe_provider_models", _fail)
    results = asyncio.run(
        svc.test_provider_config(
            db,
            project_id=project.id,
            provider="azure_openai",
            chat_model="gpt-4o",
            embedding_model="text-embedding-3-small",
            api_key="sk-azure-test-key-long-enough",
            endpoint=None,
        )
    )
    assert results["chat_model"].startswith("Failed: Endpoint is required")
    assert results["embedding_model"].startswith("Failed: Endpoint is required")


def test_connection_test_uses_stored_key_and_records_status(db, project, monkeypatch):
    _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY)
    seen = {}

    async def _probe(provider, *, chat_model, embedding_model, api_key, endpoint=None, api_version=None):
        seen.update(provider=provider, api_key=api_key)
        return {"chat_model": "Success: Yes"}

    monkeypatch.setattr(svc, "probe_provider_models", _probe)
    results = asyncio.run(
        svc.test_provider_config(
            db, project_id=project.id, provider="openai", chat_model="gpt-4o", embedding_model=None, api_key="sk-t...0123"
        )
    )
    assert results == {"chat_model": "Success: Yes"}
    assert seen == {"provider": "openai", "api_key": OPENAI_KEY}
    assert svc.get_provider_config(db, project.id, "openai").last_test_status == "success"


def test_rejected_stored_key_is_not_configured(db, project):
    row = _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY)
    row.last_test_status, row.last_test_message = "failed", OPENAI_401
    db.commit()
    out = svc.serialize_provider_config(row, "openai")
    assert out["configured"] is False
    assert out["key_rejected"] is True
    assert out["has_api_key"] is True
    assert svc.build_providers_payload(db, project.id, include_live=False)["configured_count"] == 0


def test_timeout_failure_keeps_provider_configured(db, project):
    row = _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY)
    row.last_test_status, row.last_test_message = "failed", "chat_model: Failed: Timed out after 18s"
    db.commit()
    out = svc.serialize_provider_config(row, "openai")
    assert out["configured"] is True
    assert out["key_rejected"] is False


def _verified_save(db, project, provider, **data):
    return asyncio.run(
        save_svc.save_verified_provider_config(db, project_id=project.id, provider=provider, user_id=None, data=data)
    )


def test_verified_save_rejects_key_and_writes_nothing(db, project, monkeypatch):
    async def _probe(*_a, **_k):
        return {"chat_model": "Failed: Error code: 401 - {'type': 'authentication_error', 'message': 'invalid x-api-key'}"}

    monkeypatch.setattr("app.services.project_model_provider_verification.probe_provider_models", _probe)
    with pytest.raises(svc.ProviderConfigError, match="Anthropic rejected this API key"):
        _verified_save(db, project, "anthropic", chat_model="claude-sonnet-5", api_key=OPENAI_KEY)
    db.rollback()
    assert svc.get_provider_config(db, project.id, "anthropic") is None


def test_verified_save_keeps_stored_key_when_new_key_rejected(db, project, monkeypatch):
    _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY)

    async def _probe(*_a, **_k):
        return {"chat_model": "Failed: Error code: 401 - Incorrect API key provided"}

    monkeypatch.setattr("app.services.project_model_provider_verification.probe_provider_models", _probe)
    with pytest.raises(svc.ProviderConfigError):
        _verified_save(db, project, "openai", chat_model="gpt-4o", api_key="sk-elevenlabs-wrong-key-000")
    db.rollback()
    assert svc.get_provider_config(db, project.id, "openai").api_key == OPENAI_KEY


def test_verified_save_non_auth_failure_is_reported(db, project, monkeypatch):
    async def _probe(*_a, **_k):
        return {"chat_model": "Failed: Timed out after 18s"}

    monkeypatch.setattr("app.services.project_model_provider_verification.probe_provider_models", _probe)
    with pytest.raises(svc.ProviderConfigError, match="Couldn't verify the OpenAI configuration: Timed out"):
        _verified_save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY)


def test_verified_save_records_success(db, project, monkeypatch):
    async def _probe(*_a, **_k):
        return {"chat_model": "Success: Yes", "embedding_model": "Success: Vector of length 1536 generated"}

    monkeypatch.setattr("app.services.project_model_provider_verification.probe_provider_models", _probe)
    row = _verified_save(
        db, project, "openai", chat_model="gpt-4o", embedding_model="text-embedding-3-small", api_key=OPENAI_KEY
    )
    assert row.last_test_status == "success"
    assert svc.is_configured(row)


def test_temperature_only_save_on_verified_config_skips_probe(db, project, monkeypatch):
    row = _save(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY)
    row.last_test_status = "success"
    db.commit()

    async def _fail(*_a, **_k):  # pragma: no cover - must not run
        raise AssertionError("probe must not run for a temperature-only change")

    monkeypatch.setattr("app.services.project_model_provider_verification.probe_provider_models", _fail)
    row = _verified_save(db, project, "openai", chat_model="gpt-4o", api_key="sk-t...0123", temperature=0.2)
    assert row.temperature == "0.2"
    assert row.last_test_status == "success"


def test_ollama_verified_save_skips_probe(db, project, monkeypatch):
    async def _fail(*_a, **_k):  # pragma: no cover - must not run
        raise AssertionError("ollama has no key to verify")

    monkeypatch.setattr("app.services.project_model_provider_verification.probe_provider_models", _fail)
    assert svc.is_configured(_verified_save(db, project, "ollama", chat_model="llama3:8b"))


def _load_migration():
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "j0k1l2m3n4o5_add_project_model_providers.py"
    spec = importlib.util.spec_from_file_location("mig_project_model_providers", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_seed_copies_saved_keys_once_per_family(db, project):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    member = User(username="member", email="member@example.com", hashed_password="x" * 60)
    db.add(member)
    db.flush()
    db.add_all(
        [
            ChatbotSettings(user_id=member.id, project_id=project.id, model_provider="openai",
                            chat_model="gpt-4.1", api_key="sk-member-key-0000000000000000"),
            ChatbotSettings(user_id=project.owner_id, project_id=project.id, model_provider="openai",
                            chat_model="gpt-4o", api_key=OPENAI_KEY, chat_temperature="0.3"),
            SearchSettings(user_id=project.owner_id, project_id=project.id, model_provider="google-gemini",
                           search_model="gemini-2.5-flash", api_key="AIza-test-key-000000000000000"),
            SearchSettings(user_id=member.id, project_id=project.id, model_provider="ollama",
                           search_model="llama3:8b", api_key="placeholder"),
        ]
    )
    db.commit()

    migration = _load_migration()
    conn = db.connection()
    with Operations.context(MigrationContext.configure(conn)):
        migration._seed(conn)
    db.commit()

    rows = {r.provider: r for r in db.query(ProjectModelProvider).all()}
    assert set(rows) == {"openai", "gemini"}
    assert rows["openai"].api_key == OPENAI_KEY
    assert rows["openai"].chat_model == "gpt-4o"
    assert rows["openai"].temperature == "0.3"
    assert rows["gemini"].chat_model == "gemini-2.5-flash"
