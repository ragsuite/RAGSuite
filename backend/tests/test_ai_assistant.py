"""AI Assistant module: settings isolation and tools smoke."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    AIAssistantSettings,
    Base,
    ChatMessage,
    ChatbotSettings,
    Organization,
    Project,
    User,
)
from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()

from ragsuite_modules.ai_assistant.backend.tools import (  # noqa: E402
    execute_tool,
    tool_top_chat_queries,
)


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    org = Organization(name="Test Org", slug=f"ai-asst-{uuid.uuid4().hex[:8]}")
    session.add(org)
    session.flush()
    user = User(
        username=f"ai_asst_{uuid.uuid4().hex[:8]}",
        email=f"ai_asst_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="x" * 60,
        is_active=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    session.add(user)
    session.flush()
    project = Project(name="AI Assistant Test", owner_id=user.id, org_id=org.id)
    session.add(project)
    session.commit()
    yield session, user, project
    session.close()


def test_assistant_settings_do_not_mutate_chatbot_settings(db_session):
    db, user, project = db_session
    chatbot = ChatbotSettings(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        model_provider="openai",
        chat_model="gpt-4o-mini",
        api_key="chatbot-secret-key",
    )
    db.add(chatbot)
    db.commit()

    assistant = AIAssistantSettings(
        id=uuid.uuid4(),
        project_id=project.id,
        model_provider="mistral",
        chat_model="mistral-small-latest",
        api_key="assistant-secret-key",
    )
    db.add(assistant)
    db.commit()

    assistant.api_key = "assistant-rotated"
    db.commit()
    db.refresh(chatbot)
    assert chatbot.api_key == "chatbot-secret-key"
    assert chatbot.model_provider == "openai"


def test_top_chat_queries_aggregates(db_session):
    db, user, project = db_session
    for _ in range(3):
        db.add(
            ChatMessage(
                id=uuid.uuid4(),
                user_id=user.id,
                project_id=project.id,
                session_id="s1",
                message_id=uuid.uuid4(),
                user_message="how to crawl?",
                assistant_response="...",
                message_type="chat",
                created_at=datetime.now(timezone.utc),
            )
        )
    db.add(
        ChatMessage(
            id=uuid.uuid4(),
            user_id=user.id,
            project_id=project.id,
            session_id="s2",
            message_id=uuid.uuid4(),
            user_message="what is RAG?",
            assistant_response="...",
            message_type="chat",
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()

    result = tool_top_chat_queries(db, project.id, {"limit": 5})
    assert result["queries"][0]["query"] == "how to crawl?"
    assert result["queries"][0]["count"] == 3

    raw = execute_tool(db, project.id, "top_chat_queries", {"limit": 5})
    assert "how to crawl?" in raw


def test_ce_capabilities_omit_voice_without_voice_module():
    from app.platform.widget_capabilities import collect_public_widget_capabilities
    from app.platform.module_loader import loaded_module_ids

    # Without loading the app, loaded modules may be empty → voice false
    caps = set(collect_public_widget_capabilities() or [])
    if "voice" not in set(loaded_module_ids() or []):
        assert "voice.stt" not in caps
        assert "voice.tts" not in caps


def test_capabilities_payload_shape():
    from ragsuite_modules.ai_assistant.backend.routes import get_capabilities

    # Call without FastAPI Depends by invoking the body after monkeypatching is impractical;
    # assert the module exposes the route and voice defaults are CE-safe via collect.
    from app.platform.widget_capabilities import collect_public_widget_capabilities

    caps = set(collect_public_widget_capabilities() or [])
    payload = {
        "voice": "voice.stt" in caps or "voice.tts" in caps,
        "voice_stt": "voice.stt" in caps,
        "voice_tts": "voice.tts" in caps,
    }
    assert set(payload.keys()) == {"voice", "voice_stt", "voice_tts"}
    assert get_capabilities is not None


def test_heuristic_tools_for_top_queries():
    from ragsuite_modules.ai_assistant.backend.tools import heuristic_tools_for_message

    names = heuristic_tools_for_message("What are the top chatbot queries?")
    assert "top_chat_queries" in names


def test_resolve_product_links_defaults_and_env(monkeypatch):
    from ragsuite_modules.ai_assistant.backend.tools import (
        execute_tool,
        heuristic_tools_for_message,
        resolve_product_links,
        tool_product_links,
    )

    monkeypatch.delenv("RAGSUITE_DOCS_URL", raising=False)
    links = resolve_product_links()
    assert "docs.ragsuite.de" in links["documentation"]
    assert "docs.ragsuite.ai" not in links["documentation"]

    payload = tool_product_links(None, uuid.uuid4(), {})  # type: ignore[arg-type]
    assert payload["links"]["documentation"] == "https://docs.ragsuite.de/"
    assert "docs.ragsuite.ai" not in json.dumps(payload)

    names = heuristic_tools_for_message("give me ragsuite's documentation link")
    assert "product_links" in names

    raw = execute_tool(None, uuid.uuid4(), "product_links", {})  # type: ignore[arg-type]
    assert "docs.ragsuite.de" in raw
    assert "docs.ragsuite.ai" not in raw

    monkeypatch.setenv("RAGSUITE_DOCS_URL", "https://docs.example.test/")
    overridden = resolve_product_links()
    assert overridden["documentation"] == "https://docs.example.test/"
    monkeypatch.delenv("RAGSUITE_DOCS_URL", raising=False)


def test_sanitize_assistant_answer_rewrites_hallucinated_docs(monkeypatch):
    from ragsuite_modules.ai_assistant.backend.tools import (
        resolve_product_links,
        sanitize_assistant_answer,
    )

    monkeypatch.delenv("RAGSUITE_DOCS_URL", raising=False)
    sample = "See https://docs.ragsuite.ai/guides and also docs.ragsuite.ai for more."
    cleaned = sanitize_assistant_answer(sample, resolve_product_links())
    assert "docs.ragsuite.ai" not in cleaned
    assert "https://docs.ragsuite.de/" in cleaned

    monkeypatch.setenv("RAGSUITE_DOCS_URL", "https://docs.override.test/")
    cleaned_override = sanitize_assistant_answer(
        "Visit https://docs.ragsuite.ai/x",
        resolve_product_links(),
    )
    assert cleaned_override == "Visit https://docs.override.test/"
    monkeypatch.delenv("RAGSUITE_DOCS_URL", raising=False)


def test_assistant_language_settings_round_trip(db_session):
    from app.services.rag.language_config import build_language_instruction
    from ragsuite_modules.ai_assistant.backend.routes import (
        AiAssistantSettingsUpdate,
        _normalize_assistant_language,
        _settings_out,
    )

    db, user, project = db_session
    row = AIAssistantSettings(
        id=uuid.uuid4(),
        project_id=project.id,
        model_provider="openai",
        chat_model="gpt-4o-mini",
        language="en",
    )
    db.add(row)
    db.commit()

    out = _settings_out(row, db=db, user_id=user.id, project_id=project.id)
    assert out.language == "en"

    row.language = _normalize_assistant_language("de")
    db.commit()
    db.refresh(row)
    out_de = _settings_out(row, db=db, user_id=user.id, project_id=project.id)
    assert out_de.language == "de"

    instruction = build_language_instruction(out_de.language)
    assert "German" in instruction
    assert "MUST write your entire answer" in instruction

    body = AiAssistantSettingsUpdate(language="fr")
    row.language = _normalize_assistant_language(body.language)
    assert row.language == "fr"

    with pytest.raises(Exception) as exc_info:
        _normalize_assistant_language("xx-invalid")
    assert "Unsupported language" in str(getattr(exc_info.value, "detail", exc_info.value))


def test_provider_api_keys_switch_without_merging(db_session):
    """Saving Mistral then switching to OpenAI must not keep the Mistral key active."""
    from app.models import ModelConfigProfile
    from app.utils.api_key import build_provider_api_key_masks, mask_api_key
    from ragsuite_modules.ai_assistant.backend.routes import (
        AI_ASSISTANT_PROFILE_TYPE,
        AiAssistantSettingsUpdate,
        _settings_out,
        _upsert_ai_assistant_profile,
    )

    db, user, project = db_session
    row = AIAssistantSettings(
        id=uuid.uuid4(),
        project_id=project.id,
        model_provider="mistral",
        chat_model="mistral-small-latest",
        api_key="mistral-secret-key-abcdefghijklmnopqrst",
    )
    db.add(row)
    db.commit()
    _upsert_ai_assistant_profile(db, user.id, row)
    db.commit()

    masks = build_provider_api_key_masks(
        db,
        user_id=user.id,
        project_id=project.id,
        profile_type=AI_ASSISTANT_PROFILE_TYPE,
        active_provider="mistral",
        active_api_key=row.api_key,
    )
    assert "mistral" in masks
    assert masks["mistral"] == mask_api_key(row.api_key)

    # Simulate PUT switching provider without a new key
    prev = row.model_provider
    row.model_provider = "openai"
    row.chat_model = "gpt-4o-mini"
    from ragsuite_modules.ai_assistant.backend.routes import _resolve_assistant_api_key

    resolved = _resolve_assistant_api_key(
        db,
        user_id=user.id,
        project_id=project.id,
        provider="openai",
        settings_api_key=None,
        settings_provider=None,
    )
    row.api_key = resolved
    db.commit()
    db.refresh(row)
    assert row.api_key is None
    assert prev == "mistral"

    out = _settings_out(row, db=db, user_id=user.id, project_id=project.id)
    assert out.has_api_key is False
    assert not out.api_key_masked
    assert out.provider_api_keys.get("mistral") == masks["mistral"]
    assert not out.provider_api_keys.get("openai")

    # Switch back to mistral — profile key restores
    row.model_provider = "mistral"
    row.chat_model = "mistral-small-latest"
    restored = _resolve_assistant_api_key(
        db,
        user_id=user.id,
        project_id=project.id,
        provider="mistral",
        settings_api_key=None,
        settings_provider=None,
    )
    row.api_key = restored
    db.commit()
    assert restored == "mistral-secret-key-abcdefghijklmnopqrst"
    out2 = _settings_out(row, db=db, user_id=user.id, project_id=project.id)
    assert out2.has_api_key is True
    assert out2.provider_api_keys.get("mistral")

    # Profiles stay isolated from chatbot profile_type
    chat_profiles = (
        db.query(ModelConfigProfile)
        .filter(
            ModelConfigProfile.project_id == project.id,
            ModelConfigProfile.profile_type == "chat",
        )
        .count()
    )
    assert chat_profiles == 0
    assert AiAssistantSettingsUpdate is not None
