"""Compare Models runs the providers configured in Model Configuration."""
from __future__ import annotations

import sys
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, Project, ProjectModelProvider, User

pytestmark = pytest.mark.ee

MISTRAL_KEY = "mistral-test-key-abcdefghijklmnopqrstuvwxyz"
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


def _add(db, project, provider, **fields):
    db.add(ProjectModelProvider(project_id=project.id, provider=provider, **fields))
    db.commit()


@pytest.fixture()
def configured(db, project):
    """Mistral + Ollama configured; OpenAI key rejected; Anthropic has no chat model."""
    _add(db, project, "mistral", chat_model="mistral-large-latest", api_key=MISTRAL_KEY,
         chat_temperature="0.3", chat_max_tokens=900, last_test_status="success")
    _add(db, project, "ollama", chat_model="gpt-oss:120b-cloud")
    _add(db, project, "openai", chat_model="gpt-4o", api_key=OPENAI_KEY,
         last_test_status="failed", last_test_message=OPENAI_401)
    _add(db, project, "anthropic", api_key="sk-ant-test-abcdefghijklmnopqrstuvwxyz")
    return project


def _cp():
    from ragsuite_modules.compare_models.backend import compare_profiles

    return compare_profiles


def test_only_configured_providers_are_compared(db, configured):
    profiles, source = _cp().resolve_compare_profiles(db, user_id=1, project_id=configured.id)
    assert source == "providers"
    assert [p.provider for p in profiles] == ["mistral", "ollama"]

    mistral, ollama = profiles
    assert mistral.model_name == "mistral-large-latest"
    assert mistral.api_key == MISTRAL_KEY
    assert mistral.extra_params == {"temperature": "0.3", "max_tokens": 900}
    assert mistral.config_origin == "providers"
    assert ollama.api_key is None
    assert ollama.extra_params is None


def test_list_api_reports_providers_source(db, configured):
    profiles, configured_source, effective = _cp().effective_profiles_for_list_api(db, 1, configured.id)
    assert (configured_source, effective) == ("providers", "providers")
    assert len(profiles) == 2


def test_no_configured_provider_returns_empty_providers_source(db, project):
    profiles, source = _cp().resolve_compare_profiles(db, user_id=1, project_id=project.id)
    assert profiles == []
    assert source == "providers"
    assert "Model Configuration" in _cp().compare_profiles_empty_detail("providers", source)


def test_falls_back_to_legacy_sources_without_model_configuration(db, project):
    cp = _cp()
    legacy = ([cp.CompareProfile("openai", "gpt-4", "k", None, "search")], "search")
    with patch.dict(sys.modules, {"app.services.project_model_providers": None}), patch.object(
        cp, "_legacy_compare_profiles", return_value=legacy
    ) as legacy_fn:
        assert cp.resolve_compare_profiles(db, user_id=1, project_id=project.id) == legacy
    legacy_fn.assert_called_once()


def test_filter_profiles_by_provider():
    cp = _cp()
    profiles = [
        cp.CompareProfile("mistral", "m", "k", None, "providers"),
        cp.CompareProfile("ollama", "o", None, None, "providers"),
    ]
    assert cp.filter_profiles_by_provider(profiles, None) == profiles
    assert [p.provider for p in cp.filter_profiles_by_provider(profiles, ["MISTRAL"])] == ["mistral"]
    assert cp.filter_profiles_by_provider(profiles, []) == []


def test_compare_request_filter_rejects_empty_selection(db, configured):
    from ragsuite_modules.compare_models.backend.compare_routes import (
        CompareSearchRequest,
        _resolve_request_profiles,
    )

    req = CompareSearchRequest(query="q", providers=["ollama"])
    profiles, source = _resolve_request_profiles(req, db, 1, configured.id)
    assert source == "providers"
    assert [p.provider for p in profiles] == ["ollama"]

    with pytest.raises(HTTPException) as exc:
        _resolve_request_profiles(CompareSearchRequest(query="q", providers=[]), db, 1, configured.id)
    assert exc.value.status_code == 400


def test_compare_request_without_providers_raises_configuration_hint(db, project):
    from ragsuite_modules.compare_models.backend.compare_routes import (
        CompareSearchRequest,
        _resolve_request_profiles,
    )

    with pytest.raises(HTTPException) as exc:
        _resolve_request_profiles(CompareSearchRequest(query="q"), db, 1, project.id)
    assert exc.value.status_code == 400
    assert "Model Configuration" in exc.value.detail


def test_runtime_row_uses_provider_id_and_masks_key():
    from ragsuite_modules.compare_models.backend.profiles_routes import _runtime_compare_profile_to_out

    cp = _cp()
    row = _runtime_compare_profile_to_out(
        uuid4(), cp.CompareProfile("mistral", "mistral-large-latest", MISTRAL_KEY, None, "providers")
    )
    assert row["id"] == "provider:mistral"
    assert row["provider_key"] == "mistral"
    assert row["is_runtime_config"] is True
    assert MISTRAL_KEY not in str(row)


def test_legacy_runtime_row_keeps_origin_id():
    from ragsuite_modules.compare_models.backend.profiles_routes import _runtime_compare_profile_to_out

    project_id = uuid4()
    row = _runtime_compare_profile_to_out(
        project_id, _cp().CompareProfile("openai", "gpt-4", None, None, "chatbot")
    )
    assert row["id"] == f"chatbot:{project_id}"
    assert row["provider_key"] is None
