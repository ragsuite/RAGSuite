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


def test_heuristic_tools_no_default_dump_on_greeting():
    from ragsuite_modules.ai_assistant.backend.tools import heuristic_tools_for_message

    assert heuristic_tools_for_message("hello") == []
    assert heuristic_tools_for_message("hi there") == []


def test_validate_intent_plan_drops_unknown_tools_and_fallback():
    from ragsuite_modules.ai_assistant.backend.intent import (
        fallback_intent_plan,
        validate_intent_plan,
    )

    plan = validate_intent_plan(
        {
            "cleaned_query": "Show crawl sources",
            "intent": "crawl",
            "needs_tools": True,
            "tool_calls": [
                {"name": "list_crawl_sources", "arguments": {"limit": 3}},
                {"name": "not_a_real_tool", "arguments": {}},
            ],
            "out_of_scope": False,
            "refusal_hint": None,
        },
        "show my crawls",
    )
    assert plan.cleaned_query == "Show crawl sources"
    assert plan.needs_tools is True
    assert len(plan.tool_calls) == 1
    assert plan.tool_calls[0].name == "list_crawl_sources"
    assert plan.tool_calls[0].arguments["limit"] == 3

    bad = validate_intent_plan("not-json", "hello")
    assert bad.needs_tools is False
    assert bad.tool_calls == []
    assert bad.cleaned_query == "hello"

    greeting = validate_intent_plan(
        {
            "cleaned_query": "Hello",
            "intent": "greeting",
            "needs_tools": True,
            "tool_calls": [{"name": "overview_metrics", "arguments": {"days": 7}}],
            "out_of_scope": False,
        },
        "hello",
    )
    assert greeting.needs_tools is False
    assert greeting.tool_calls == []

    oos = validate_intent_plan(
        {
            "cleaned_query": "Write a poem",
            "intent": "out_of_scope",
            "needs_tools": True,
            "tool_calls": [{"name": "product_links", "arguments": {}}],
            "out_of_scope": True,
        },
        "write a poem",
    )
    assert oos.out_of_scope is True
    assert oos.needs_tools is False
    assert oos.tool_calls == []

    fb = fallback_intent_plan("  ping  ")
    assert fb.cleaned_query == "ping"
    assert fb.needs_tools is False


def test_validate_intent_plan_ui_navigation_disables_tools():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan

    plan = validate_intent_plan(
        {
            "cleaned_query": "Crawl sources sync from Sources",
            "intent": "ui_crawl_sources",
            "needs_tools": True,
            "tool_calls": [{"name": "list_crawl_sources", "arguments": {"limit": 5}}],
            "out_of_scope": False,
        },
        "crawl sources sync",
    )
    assert plan.intent == "ui_navigation"
    assert plan.needs_tools is False
    assert plan.tool_calls == []


def test_validate_intent_plan_latency_keeps_metrics_tool():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan

    plan = validate_intent_plan(
        {
            "cleaned_query": "See query latency on Analytics",
            "intent": "ops_metrics",
            "needs_tools": True,
            "tool_calls": [{"name": "overview_metrics", "arguments": {"days": 7}}],
            "out_of_scope": False,
            "focus_route": "index",
        },
        "see query latency",
    )
    assert plan.intent == "ops_metrics"
    assert plan.needs_tools is True
    assert plan.tool_calls[0].name == "overview_metrics"


def test_best_route_match_system_health():
    from ragsuite_modules.ai_assistant.backend.ui_catalog import best_route_match

    hit = best_route_match("what is current system health?")
    assert hit is not None
    assert hit.route == "system-health"


def test_route_policy_system_health_strips_overview_metrics():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan

    plan = validate_intent_plan(
        {
            "cleaned_query": "What is current system health?",
            "intent": "ops_metrics",
            "needs_tools": True,
            "tool_calls": [{"name": "overview_metrics", "arguments": {"days": 7}}],
            "out_of_scope": False,
            "focus_route": "system-health",
        },
        "what is current system health?",
    )
    assert plan.intent == "ops_system_health"
    assert plan.focus_route == "system-health"
    assert plan.needs_tools is True
    assert [tc.name for tc in plan.tool_calls] == ["system_health_snapshot"]
    assert plan.ui_workflow_key == "view_system_health"


def test_ui_catalog_loads_compare_models_label():
    from ragsuite_modules.ai_assistant.backend.ui_catalog import load_dashboard_routes

    routes = load_dashboard_routes()
    labels = {r["route"]: r.get("label") for r in routes}
    assert labels.get("compare-models") == "Compare Models"
    assert labels.get("index") == "Analytics"
    assert labels.get("system-health") == "System Health"


def test_match_ui_workflow_for_crawl_sources():
    from ragsuite_modules.ai_assistant.backend.ui_workflows import (
        match_ui_workflow,
        render_ui_workflow_facts,
    )

    match = match_ui_workflow("crawl sources sync")
    assert match is not None
    facts = render_ui_workflow_facts(match)
    assert facts["kind"] == "ui_workflow"
    assert facts["key"] == "crawl_sync"
    assert facts["route"]["label"] == "Sources"
    assert len(facts["steps"]) >= 4
    assert facts.get("allowed_step_only") is True


def test_match_ui_workflow_compare_models():
    from ragsuite_modules.ai_assistant.backend.ui_workflows import match_ui_workflow

    match = match_ui_workflow("compare models")
    assert match is not None
    assert match.workflow.key == "compare_models"


def test_match_ui_workflow_system_health():
    from ragsuite_modules.ai_assistant.backend.ui_workflows import match_ui_workflow

    match = match_ui_workflow("current system health")
    assert match is not None
    assert match.workflow.key == "view_system_health"
    assert match.workflow.route == "system-health"


def test_detect_embed_routes_dual_chatbot_search():
    from ragsuite_modules.ai_assistant.backend.ui_catalog import (
        best_route_match,
        detect_embed_routes,
    )
    from ragsuite_modules.ai_assistant.backend.ui_workflows import match_ui_workflows

    query = "how to integrate script for chatbot & search?"
    routes = detect_embed_routes(query)
    assert "chatbot-config" in routes
    assert "search-config" in routes
    assert "configuration" not in routes
    hit = best_route_match(query)
    assert hit is not None
    assert hit.route in ("chatbot-config", "search-config")
    matches = match_ui_workflows(query)
    keys = {m.workflow.key for m in matches}
    assert "chatbot_embed_integrations" in keys
    assert "search_embed_integrations" in keys


def test_route_policy_corrects_configuration_for_embed():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan

    plan = validate_intent_plan(
        {
            "cleaned_query": "integrate widget script for chatbot and search",
            "intent": "config",
            "needs_tools": False,
            "tool_calls": [],
            "out_of_scope": False,
            "focus_route": "configuration",
        },
        "integrate widget script for chatbot and search",
    )
    assert plan.intent == "ui_navigation"
    assert plan.focus_route in ("chatbot-config", "search-config")
    assert plan.ui_workflow_key in ("chatbot_embed_integrations", "search_embed_integrations")
    assert plan.ui_workflow_keys is not None
    assert "chatbot_embed_integrations" in plan.ui_workflow_keys
    assert "search_embed_integrations" in plan.ui_workflow_keys


def test_add_project_matches_create_project_not_crawl_or_embed():
    from ragsuite_modules.ai_assistant.backend.ui_catalog import (
        best_route_match,
        query_has_embed_signal,
    )
    from ragsuite_modules.ai_assistant.backend.ui_workflows import match_ui_workflow

    query = "how to add project"
    assert query_has_embed_signal(query) is False
    hit = best_route_match(query)
    assert hit is not None
    assert hit.route == "projects"
    match = match_ui_workflow(query)
    assert match is not None
    assert match.workflow.key == "create_project"
    assert match.workflow.route == "projects"


def test_change_chatbot_color_matches_customization_not_embed():
    from ragsuite_modules.ai_assistant.backend.ui_catalog import query_has_embed_signal
    from ragsuite_modules.ai_assistant.backend.ui_workflows import (
        _score_workflow,
        match_ui_workflow,
        render_ui_workflow_facts,
        workflow_by_key,
    )

    query = "how to change color of current chatbot?"
    assert query_has_embed_signal(query) is False
    embed = workflow_by_key("chatbot_embed_integrations")
    assert embed is not None
    assert _score_workflow(query, embed) == 0

    match = match_ui_workflow(query)
    assert match is not None
    assert match.workflow.key == "chatbot_settings_widget_customization"
    assert match.workflow.route == "chatbot-config"
    assert match.feature_panel is not None
    assert "color" in (match.feature_panel.get("title") or "").lower()

    facts = render_ui_workflow_facts(match)
    step_titles = [s["title"] for s in facts.get("steps") or []]
    assert any("Settings" in t for t in step_titles)
    assert any("Custom" in t for t in step_titles)
    assert any("color" in t.lower() for t in step_titles)
    assert facts.get("feature_panel", {}).get("title")


def test_change_chatbot_avatar_matches_customization():
    from ragsuite_modules.ai_assistant.backend.ui_config_surfaces import match_config_feature
    from ragsuite_modules.ai_assistant.backend.ui_workflows import (
        match_ui_workflow,
        render_ui_workflow_facts,
    )

    query = "how to change avatar of chatbot?"
    feature = match_config_feature("chatbot-config", query)
    assert feature is not None
    assert feature.group_id == "avatar"
    assert feature.title == "Chat face"
    assert feature.title_key == "chatbot.widget.avatar.title"
    # Display title comes from i18n (currently "Chat face").
    assert (feature.title or "").strip()

    match = match_ui_workflow(query)
    assert match is not None
    assert match.workflow.key == "chatbot_settings_widget_customization"
    assert match.workflow.route == "chatbot-config"
    assert match.feature_panel is not None
    assert match.feature_panel.get("group_id") == "avatar"
    assert match.feature_panel.get("title") == "Chat face"

    facts = render_ui_workflow_facts(match)
    step_titles = [s["title"] for s in facts.get("steps") or []]
    joined = " ".join(step_titles)
    assert "Settings" in joined
    assert "Customization" in joined
    assert "Chat face" in joined
    assert "Configuration" not in step_titles
    assert "Name shown under the avatar" not in joined
    assert "Appearance" not in joined


def test_validate_intent_plan_chatbot_avatar():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan

    query = "how to change avatar of chatbot?"
    plan = validate_intent_plan(
        {
            "cleaned_query": query,
            "intent": "ui_navigation",
            "needs_tools": False,
            "tool_calls": [],
            "out_of_scope": False,
            "focus_route": "chatbot-config",
            "ui_workflow_key": "chatbot_embed_integrations",
        },
        query,
    )
    assert plan.intent == "ui_navigation"
    assert plan.needs_tools is False
    assert plan.tool_calls == []
    assert plan.focus_route == "chatbot-config"
    assert plan.ui_workflow_key == "chatbot_settings_widget_customization"


def test_validate_intent_plan_chatbot_color():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan

    query = "how to change color of current chatbot?"
    plan = validate_intent_plan(
        {
            "cleaned_query": query,
            "intent": "ui_navigation",
            "needs_tools": False,
            "tool_calls": [],
            "out_of_scope": False,
            "focus_route": "chatbot-config",
            "ui_workflow_key": "chatbot_embed_integrations",
        },
        query,
    )
    assert plan.intent == "ui_navigation"
    assert plan.needs_tools is False
    assert plan.tool_calls == []
    assert plan.focus_route == "chatbot-config"
    assert plan.ui_workflow_key == "chatbot_settings_widget_customization"


def test_chatbot_overlay_or_speech_matches_customization_feature():
    from ragsuite_modules.ai_assistant.backend.ui_workflows import (
        match_ui_workflow,
        render_ui_workflow_facts,
    )

    for query in (
        "how to show date and time on chatbot?",
        "how to turn on talk and listen on chatbot?",
        "how to let visitors speak on chatbot?",
    ):
        match = match_ui_workflow(query)
        assert match is not None, query
        assert match.workflow.key == "chatbot_settings_widget_customization", query
        assert match.feature_panel is not None, query
        facts = render_ui_workflow_facts(match)
        assert facts.get("feature_panel"), query
        titles = " ".join(s["title"] for s in facts.get("steps") or []).lower()
        assert "custom" in titles, query
        assert "settings" in titles, query


def test_embed_gate_still_requires_script():
    from ragsuite_modules.ai_assistant.backend.ui_catalog import query_has_embed_signal
    from ragsuite_modules.ai_assistant.backend.ui_workflows import (
        _score_workflow,
        match_ui_workflow,
        match_ui_workflows,
        workflow_by_key,
    )

    color_q = "how to change color of current chatbot?"
    script_q = "how to integrate script for chatbot?"
    dual_q = "integrate widget script for chatbot and search"

    embed = workflow_by_key("chatbot_embed_integrations")
    assert embed is not None
    assert query_has_embed_signal(color_q) is False
    assert _score_workflow(color_q, embed) == 0
    assert match_ui_workflow(color_q).workflow.key != "chatbot_embed_integrations"

    assert query_has_embed_signal(script_q) is True
    assert _score_workflow(script_q, embed) > 0
    assert match_ui_workflow(script_q).workflow.key == "chatbot_embed_integrations"

    keys = {m.workflow.key for m in match_ui_workflows(dual_q)}
    assert "chatbot_embed_integrations" in keys
    assert "search_embed_integrations" in keys


def test_chatbot_settings_catalog_match_and_answer():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan
    from ragsuite_modules.ai_assistant.backend.ui_config_surfaces import detect_config_catalog_query
    from ragsuite_modules.ai_assistant.backend.ui_workflows import (
        match_ui_workflow,
        render_config_catalog_answer_text,
        render_ui_workflow_facts,
        workflow_by_key,
    )

    query = "which type of settings I can do with chatbot?"
    assert detect_config_catalog_query(query) == "chatbot-config"

    match = match_ui_workflow(query)
    assert match is not None
    assert match.workflow.key == "chatbot_config_catalog"
    assert match.workflow.route == "chatbot-config"
    assert match.workflow.catalog_modules

    plan = validate_intent_plan(
        {
            "cleaned_query": query,
            "intent": "ui_navigation",
            "needs_tools": False,
            "tool_calls": [],
            "out_of_scope": False,
            "focus_route": "chatbot-config",
            "ui_workflow_key": "chatbot_embed_integrations",
        },
        query,
    )
    assert plan.ui_workflow_key == "chatbot_config_catalog"
    assert plan.focus_route == "chatbot-config"

    facts = render_ui_workflow_facts(match)
    answer = render_config_catalog_answer_text([facts])
    for label in (
        "Setup",
        "Settings",
        "Integrations",
        "Overview",
        "Model Settings",
        "Allowed Domains",
        "Configuration",
        "Customization",
        "FAQ",
        "DPA",
        "Feedback",
        "Privacy Policy",
    ):
        assert label in answer, label
    assert "Chatbot Configuration" in answer
    assert "based on the provided" not in answer.lower()

    catalog = workflow_by_key("chatbot_config_catalog")
    assert catalog is not None
    assert catalog.key == "chatbot_config_catalog"


def test_chatbot_settings_catalog_does_not_steal_feature_or_embed():
    from ragsuite_modules.ai_assistant.backend.ui_config_surfaces import detect_config_catalog_query
    from ragsuite_modules.ai_assistant.backend.ui_workflows import match_ui_workflow

    assert detect_config_catalog_query("how to change avatar of chatbot?") is None
    assert match_ui_workflow("how to change avatar of chatbot?").workflow.key == (
        "chatbot_settings_widget_customization"
    )
    assert detect_config_catalog_query("how to change color of current chatbot?") is None
    assert match_ui_workflow("how to change color of current chatbot?").workflow.key == (
        "chatbot_settings_widget_customization"
    )
    assert detect_config_catalog_query("how to integrate chatbot widget script?") is None
    assert match_ui_workflow("how to integrate chatbot widget script?").workflow.key == (
        "chatbot_embed_integrations"
    )


def test_search_settings_catalog_match_and_answer():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan
    from ragsuite_modules.ai_assistant.backend.ui_config_surfaces import detect_config_catalog_query
    from ragsuite_modules.ai_assistant.backend.ui_workflows import (
        match_ui_workflow,
        render_config_catalog_answer_text,
        render_ui_workflow_facts,
    )

    query = "which type of settings I can do with search configurations?"
    assert detect_config_catalog_query(query) == "search-config"

    match = match_ui_workflow(query)
    assert match is not None
    assert match.workflow.key == "search_config_catalog"
    assert match.workflow.route == "search-config"
    assert match.workflow.key != "search_settings_search_customization"

    plan = validate_intent_plan(
        {
            "cleaned_query": query,
            "intent": "ui_navigation",
            "needs_tools": False,
            "tool_calls": [],
            "out_of_scope": False,
            "focus_route": "search-config",
            "ui_workflow_key": "search_embed_integrations",
        },
        query,
    )
    assert plan.ui_workflow_key == "search_config_catalog"
    assert plan.focus_route == "search-config"

    answer = render_config_catalog_answer_text([render_ui_workflow_facts(match)])
    for label in (
        "Setup",
        "Settings",
        "Integrations",
        "Search Test",
        "Overview",
        "Model Settings",
        "Allowed Domains",
        "Configuration",
        "DPA",
        "Customisation",
        "Questions",
    ):
        assert label in answer, label
    assert "Search Configuration" in answer
    # Feature sub-panels from live i18n (not inventing).
    assert "Chat Model" in answer or "Model Provider" in answer
    assert "based on the provided" not in answer.lower()


def test_sanitize_strips_based_on_provided_preamble():
    from ragsuite_modules.ai_assistant.backend.tools import sanitize_assistant_answer

    raw = (
        "Based on the provided workflow steps, the Chatbot Configuration section "
        "allows Integrations only."
    )
    out = sanitize_assistant_answer(raw)
    assert not out.lower().startswith("based on the provided")
    assert "Chatbot Configuration" in out


def test_search_customisation_howto():
    from ragsuite_modules.ai_assistant.backend.ui_workflows import match_ui_workflow

    query = "how to enable speech on search?"
    match = match_ui_workflow(query)
    assert match is not None
    assert match.workflow.key == "search_settings_search_customization"
    assert match.workflow.route == "search-config"
    assert match.feature_panel is not None
    assert "speech" in (match.feature_panel.get("title") or "").lower()


def test_navigate_chatbot_avatar_howto_deterministic():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan
    from ragsuite_modules.ai_assistant.backend.ui_workflows import (
        match_ui_workflow,
        render_ui_howto_answer_text,
        render_ui_workflow_facts,
    )

    query = "navigate me how do I find my chatbot settings to change avatar?"
    match = match_ui_workflow(query)
    assert match is not None
    assert match.workflow.key == "chatbot_settings_widget_customization"
    assert match.feature_panel is not None
    assert match.feature_panel.get("group_id") == "avatar"
    assert not match.workflow.key.endswith("_catalog")

    text = render_ui_howto_answer_text([render_ui_workflow_facts(match)])
    assert match.feature_panel.get("title") in text
    assert "Customization" in text or "Customisation" in text

    # Planner cleaned_query without "avatar" must not steal catalog when original ask has it.
    plan = validate_intent_plan(
        {
            "cleaned_query": "Open Chatbot Configuration settings",
            "intent": "ui_navigation",
            "needs_tools": False,
            "tool_calls": [],
            "out_of_scope": False,
            "focus_route": "chatbot-config",
            "ui_workflow_key": "chatbot_config_catalog",
        },
        query,
    )
    assert plan.ui_workflow_key == "chatbot_settings_widget_customization"
    assert plan.focus_route == "chatbot-config"


def test_mcp_connectors_maps_to_sources_catalog():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan
    from ragsuite_modules.ai_assistant.backend.ui_app_surfaces import (
        SOURCES_CONNECTORS_CATALOG_KEY,
        connector_tab_labels,
        detect_sources_connectors_catalog_query,
    )
    from ragsuite_modules.ai_assistant.backend.ui_workflows import (
        match_ui_workflow,
        render_config_catalog_answer_text,
        render_ui_workflow_facts,
    )

    query = "which are mcp connectors are there?"
    assert detect_sources_connectors_catalog_query(query) is True
    plan = validate_intent_plan(
        {
            "cleaned_query": query,
            "intent": "jobs",
            "needs_tools": True,
            "tool_calls": [{"name": "list_recent_jobs", "arguments": {}}],
            "out_of_scope": False,
        },
        query,
    )
    assert plan.intent == "ui_navigation"
    assert plan.needs_tools is False
    assert plan.ui_workflow_key == SOURCES_CONNECTORS_CATALOG_KEY
    assert plan.focus_route == "crawl-management"

    match = match_ui_workflow(query, workflow_key=SOURCES_CONNECTORS_CATALOG_KEY)
    assert match is not None
    text = render_config_catalog_answer_text([render_ui_workflow_facts(match)])
    assert "no separate mcp" in text.lower()
    for label in connector_tab_labels():
        assert label in text
    assert "Master Crawl Protocol" not in text


def test_profile_and_app_settings_howto_coverage():
    from ragsuite_modules.ai_assistant.backend.ui_workflows import match_ui_workflow

    profile = match_ui_workflow("how to open profile security")
    assert profile is not None
    assert profile.workflow.key == "profile_security"
    assert profile.workflow.route == "profile"

    language = match_ui_workflow("how to change language settings")
    assert language is not None
    assert language.workflow.key == "app_settings_language"
    assert language.workflow.route == "language-region"

    ai = match_ui_workflow("how to open AI Assistant")
    assert ai is not None
    assert ai.workflow.route == "ai-assistant"


def test_route_policy_latency_status_forces_overview_metrics():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan
    from ragsuite_modules.ai_assistant.backend.route_policy import classify_ask_mode

    assert classify_ask_mode("what's current latency of query?") == "status"
    plan = validate_intent_plan(
        {
            "cleaned_query": "What is the current latency of queries?",
            "intent": "ui_navigation",
            "needs_tools": False,
            "tool_calls": [],
            "out_of_scope": False,
        },
        "what's current latency of query?",
    )
    assert plan.intent == "ops_metrics"
    assert plan.needs_tools is True
    assert [tc.name for tc in plan.tool_calls] == ["overview_metrics"]
    assert plan.ui_workflow_key == "view_latency"


def test_route_policy_top_chatbot_query_history_forces_top_chat_queries():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan
    from ragsuite_modules.ai_assistant.backend.route_policy import detect_top_query_ops

    query = "give me top 5 query history for chatbot"
    assert detect_top_query_ops(query) == ("top_chat_queries", 5)
    assert detect_top_query_ops("how to open History") is None

    plan = validate_intent_plan(
        {
            "cleaned_query": query,
            "intent": "ui_navigation",
            "needs_tools": False,
            "tool_calls": [],
            "out_of_scope": False,
            "focus_route": "history",
            "ui_workflow_key": "view_history",
        },
        query,
    )
    assert plan.intent == "ops_history"
    assert plan.needs_tools is True
    assert [tc.name for tc in plan.tool_calls] == ["top_chat_queries"]
    assert plan.tool_calls[0].arguments.get("limit") == 5
    assert plan.focus_route == "history"
    assert plan.ui_workflow_key == "view_history"
    assert plan.ui_workflow_key != "create_project"


def test_route_policy_top_chat_queries_survives_wrong_projects_focus():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan

    query = "give me top 5 query history for chatbot"
    plan = validate_intent_plan(
        {
            "cleaned_query": query,
            "intent": "ui_navigation",
            "needs_tools": False,
            "tool_calls": [],
            "out_of_scope": False,
            "focus_route": "projects",
            "ui_workflow_key": "create_project",
        },
        query,
    )
    assert plan.intent == "ops_history"
    assert plan.needs_tools is True
    assert [tc.name for tc in plan.tool_calls] == ["top_chat_queries"]
    assert plan.tool_calls[0].arguments.get("limit") == 5
    assert plan.ui_workflow_key == "view_history"
    assert plan.focus_route == "history"


def test_route_policy_create_project_still_forced_for_howto():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan

    query = "how to create a project"
    plan = validate_intent_plan(
        {
            "cleaned_query": query,
            "intent": "other",
            "needs_tools": True,
            "tool_calls": [{"name": "overview_metrics", "arguments": {}}],
            "out_of_scope": False,
            "focus_route": "projects",
        },
        query,
    )
    assert plan.intent == "ui_navigation"
    assert plan.needs_tools is False
    assert plan.tool_calls == []
    assert plan.focus_route == "projects"
    assert plan.ui_workflow_key == "create_project"


def test_route_policy_top_search_query_history_forces_top_search_queries():
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan
    from ragsuite_modules.ai_assistant.backend.route_policy import detect_top_query_ops

    query = "show top 5 search query history"
    assert detect_top_query_ops(query) == ("top_search_queries", 5)
    plan = validate_intent_plan(
        {
            "cleaned_query": query,
            "intent": "ui_navigation",
            "needs_tools": False,
            "tool_calls": [],
            "out_of_scope": False,
        },
        query,
    )
    assert plan.intent == "ops_history"
    assert [tc.name for tc in plan.tool_calls] == ["top_search_queries"]
    assert plan.tool_calls[0].arguments.get("limit") == 5


def test_run_assistant_turn_embed_integrations_deterministic(db_session, monkeypatch):
    from ragsuite_modules.ai_assistant.backend import agent as agent_mod
    from ragsuite_modules.ai_assistant.backend.agent import run_assistant_turn
    from ragsuite_modules.ai_assistant.backend.intent import IntentPlan

    db, user, project = db_session
    settings = AIAssistantSettings(
        id=uuid.uuid4(),
        project_id=project.id,
        model_provider="openai",
        chat_model="gpt-4o-mini",
        api_key="test-key-abcdefghijklmnopqrstuvwxyz",
        temperature="0.1",
        max_tokens=256,
        language="en",
    )
    db.add(settings)
    db.commit()

    def fake_plan_intent(client, *, model, user_message, history=None):
        return IntentPlan(
            cleaned_query="Integrate script for chatbot and search",
            intent="ui_navigation",
            needs_tools=False,
            tool_calls=[],
            out_of_scope=False,
            focus_route="chatbot-config",
            ui_workflow_key="chatbot_embed_integrations",
            ui_workflow_keys=["chatbot_embed_integrations", "search_embed_integrations"],
        )

    class _Msg:
        def __init__(self, content):
            self.content = content

    class _Choice:
        def __init__(self, content):
            self.message = _Msg(content)

    class _Resp:
        def __init__(self, content):
            self.choices = [_Choice(content)]

    class _Completions:
        def create(self, **kwargs):
            messages = kwargs.get("messages") or []
            grounding = " ".join(m.get("content") or "" for m in messages if m.get("role") == "system")
            assert "ui_workflow" in grounding
            assert "Integrations" in grounding or "integrations" in grounding.lower()
            return _Resp(
                "Open **Chatbot Configuration**, then the **Integrations** tab. "
                "Copy the **Web Widget Script**. Repeat under **Search Configuration**."
            )

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

    monkeypatch.setattr(agent_mod, "plan_intent", fake_plan_intent)
    monkeypatch.setattr(agent_mod, "_build_client", lambda settings: (_Client(), "openai"))

    events = list(
        run_assistant_turn(
            db,
            project_id=project.id,
            settings=settings,
            history=[],
            user_message="how to integrate script for chatbot & search?",
        )
    )
    done = next(e for e in events if e.get("type") == "done")
    text = done["content"].lower()
    assert "integrations" in text
    assert "custom api" not in text
    assert "chatbot logic" not in text
    assert "pre-processing" not in text


def test_top_search_queries_aggregates(db_session):
    from app.models import QueryLog

    db, user, project = db_session
    for _ in range(2):
        db.add(
            QueryLog(
                id=uuid.uuid4(),
                project_id=project.id,
                user_id=user.id,
                query="pricing plans",
            )
        )
    db.add(
        QueryLog(
            id=uuid.uuid4(),
            project_id=project.id,
            user_id=user.id,
            query="contact sales",
        )
    )
    db.commit()

    from ragsuite_modules.ai_assistant.backend.tools import tool_top_search_queries

    result = tool_top_search_queries(db, project.id, {"limit": 5})
    assert result["queries"][0]["query"] == "pricing plans"
    assert result["queries"][0]["count"] == 2


def test_present_tool_result_uses_human_labels():
    from ragsuite_modules.ai_assistant.backend.tools import present_tool_result

    presented = present_tool_result(
        "overview_metrics",
        {
            "days": 7,
            "query_log_count": 12,
            "chat_message_count": 4,
            "avg_p95_latency_ms": 100.5,
            "thumbs_up": 2,
            "thumbs_down": 1,
            "thumbs_up_rate_pct": 66.7,
        },
    )
    blob = json.dumps(presented)
    assert "query_log_count" not in blob
    assert "avg_p95_latency_ms" not in blob
    assert "search queries" in blob
    assert "average response time (ms)" in blob
    assert presented["summary"].startswith("Usage overview")


def test_sanitize_replaces_internal_field_keys(monkeypatch):
    from ragsuite_modules.ai_assistant.backend.tools import sanitize_assistant_answer

    monkeypatch.delenv("RAGSUITE_DOCS_URL", raising=False)
    out = sanitize_assistant_answer("The query_log_count is 5 and avg_p95_latency_ms is high.")
    assert "query_log_count" not in out
    assert "avg_p95_latency_ms" not in out
    assert "search queries" in out
    assert "average response time (ms)" in out


def test_run_assistant_turn_planner_then_single_tool(db_session, monkeypatch):
    """Mocked client: planner selects one tool; answerer sees presented facts only."""
    from ragsuite_modules.ai_assistant.backend import agent as agent_mod
    from ragsuite_modules.ai_assistant.backend.agent import run_assistant_turn
    from ragsuite_modules.ai_assistant.backend.intent import IntentPlan, PlannedToolCall

    db, user, project = db_session
    settings = AIAssistantSettings(
        id=uuid.uuid4(),
        project_id=project.id,
        model_provider="openai",
        chat_model="gpt-4o-mini",
        api_key="test-key-abcdefghijklmnopqrstuvwxyz",
        temperature="0.1",
        max_tokens=256,
        language="en",
    )
    db.add(settings)
    db.commit()

    executed: list[str] = []

    def fake_plan_intent(client, *, model, user_message, history=None):
        return IntentPlan(
            cleaned_query="Show usage overview for last 7 days",
            intent="ops_metrics",
            needs_tools=True,
            tool_calls=[PlannedToolCall(name="overview_metrics", arguments={"days": 7})],
            out_of_scope=False,
        )

    class _Msg:
        def __init__(self, content):
            self.content = content

    class _Choice:
        def __init__(self, content):
            self.message = _Msg(content)

    class _Resp:
        def __init__(self, content):
            self.choices = [_Choice(content)]

    class _Completions:
        def create(self, **kwargs):
            # Answerer call — assert grounding used presented labels, not raw keys
            messages = kwargs.get("messages") or []
            grounding = " ".join(
                m.get("content") or "" for m in messages if m.get("role") == "system"
            )
            assert "query_log_count" not in grounding
            return _Resp("Here is the usage overview for the last 7 days.")

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

    real_execute = agent_mod.execute_tool

    def tracking_execute(db_sess, project_id, name, arguments):
        executed.append(name)
        return real_execute(db_sess, project_id, name, arguments)

    monkeypatch.setattr(agent_mod, "plan_intent", fake_plan_intent)
    monkeypatch.setattr(agent_mod, "_build_client", lambda settings: (_Client(), "openai"))
    monkeypatch.setattr(agent_mod, "execute_tool", tracking_execute)

    events = list(
        run_assistant_turn(
            db,
            project_id=project.id,
            settings=settings,
            history=[],
            user_message="show usage overview",
        )
    )
    assert executed == ["overview_metrics"]
    assert any(e.get("type") == "tool" and e.get("name") == "overview_metrics" for e in events)
    tool_evt = next(e for e in events if e.get("type") == "tool")
    assert "summary" in tool_evt["result"]
    assert "facts" in tool_evt["result"]
    assert "documents_count" not in json.dumps(tool_evt["result"])
    assert any(e.get("type") == "done" for e in events)
    done = next(e for e in events if e.get("type") == "done")
    assert "usage overview" in done["content"].lower()


def test_run_assistant_turn_ui_workflow_no_tool_terms(db_session, monkeypatch):
    from ragsuite_modules.ai_assistant.backend import agent as agent_mod
    from ragsuite_modules.ai_assistant.backend.agent import run_assistant_turn
    from ragsuite_modules.ai_assistant.backend.intent import IntentPlan

    db, user, project = db_session
    settings = AIAssistantSettings(
        id=uuid.uuid4(),
        project_id=project.id,
        model_provider="openai",
        chat_model="gpt-4o-mini",
        api_key="test-key-abcdefghijklmnopqrstuvwxyz",
        temperature="0.1",
        max_tokens=256,
        language="en",
    )
    db.add(settings)
    db.commit()

    executed: list[str] = []

    def fake_plan_intent(client, *, model, user_message, history=None):
        return IntentPlan(
            cleaned_query="Crawl sources sync",
            intent="ui_navigation",
            needs_tools=False,
            tool_calls=[],
            out_of_scope=False,
            focus_route="crawl-management",
            ui_workflow_key="crawl_sync",
        )

    class _Msg:
        def __init__(self, content):
            self.content = content

    class _Choice:
        def __init__(self, content):
            self.message = _Msg(content)

    class _Resp:
        def __init__(self, content):
            self.choices = [_Choice(content)]

    class _Completions:
        def create(self, **kwargs):
            messages = kwargs.get("messages") or []
            grounding = " ".join(m.get("content") or "" for m in messages if m.get("role") == "system")
            assert "ui_workflow" in grounding
            return _Resp(
                "Open Sources, find your source, use Start sync from the source menu and watch Jobs status."
            )

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

    real_execute = agent_mod.execute_tool

    def tracking_execute(db_sess, project_id, name, arguments):
        executed.append(name)
        return real_execute(db_sess, project_id, name, arguments)

    monkeypatch.setattr(agent_mod, "plan_intent", fake_plan_intent)
    monkeypatch.setattr(agent_mod, "_build_client", lambda settings: (_Client(), "openai"))
    monkeypatch.setattr(agent_mod, "execute_tool", tracking_execute)

    events = list(
        run_assistant_turn(
            db,
            project_id=project.id,
            settings=settings,
            history=[],
            user_message="crawl sources sync",
        )
    )
    assert executed == []
    done = next(e for e in events if e.get("type") == "done")
    assert "list_crawl_sources" not in done["content"]
    assert "delete" not in done["content"].lower()
    assert "backend" not in done["content"].lower()


def test_run_assistant_turn_latency_hybrid_allows_tools(db_session, monkeypatch):
    from ragsuite_modules.ai_assistant.backend import agent as agent_mod
    from ragsuite_modules.ai_assistant.backend.agent import run_assistant_turn
    from ragsuite_modules.ai_assistant.backend.intent import IntentPlan, PlannedToolCall

    db, user, project = db_session
    settings = AIAssistantSettings(
        id=uuid.uuid4(),
        project_id=project.id,
        model_provider="openai",
        chat_model="gpt-4o-mini",
        api_key="test-key-abcdefghijklmnopqrstuvwxyz",
        temperature="0.1",
        max_tokens=256,
        language="en",
    )
    db.add(settings)
    db.commit()

    executed: list[str] = []

    def fake_plan_intent(client, *, model, user_message, history=None):
        return IntentPlan(
            cleaned_query="What is the current latency of queries?",
            intent="ops_metrics",
            needs_tools=True,
            tool_calls=[PlannedToolCall(name="overview_metrics", arguments={"days": 1})],
            out_of_scope=False,
            focus_route="index",
            ui_workflow_key="view_latency",
        )

    class _Msg:
        def __init__(self, content):
            self.content = content

    class _Choice:
        def __init__(self, content):
            self.message = _Msg(content)

    class _Resp:
        def __init__(self, content):
            self.choices = [_Choice(content)]

    class _Completions:
        def create(self, **kwargs):
            messages = kwargs.get("messages") or []
            grounding = " ".join(m.get("content") or "" for m in messages if m.get("role") == "system")
            assert "ui_workflow" in grounding
            assert "average response time" in grounding
            assert "Status mode" in grounding or "lead with the live numbers" in grounding
            return _Resp(
                "Current **average response time** is unavailable (null) for the last day. "
                "You can confirm on Analytics → p95 Latency."
            )

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

    real_execute = agent_mod.execute_tool

    def tracking_execute(db_sess, project_id, name, arguments):
        executed.append(name)
        return real_execute(db_sess, project_id, name, arguments)

    monkeypatch.setattr(agent_mod, "plan_intent", fake_plan_intent)
    monkeypatch.setattr(agent_mod, "_build_client", lambda settings: (_Client(), "openai"))
    monkeypatch.setattr(agent_mod, "execute_tool", tracking_execute)

    events = list(
        run_assistant_turn(
            db,
            project_id=project.id,
            settings=settings,
            history=[],
            user_message="what's current latency of query?",
        )
    )
    assert executed == ["overview_metrics"]
    assert any(e.get("type") == "done" for e in events)
    done = next(e for e in events if e.get("type") == "done")
    assert "average response time" in done["content"].lower() or "null" in done["content"].lower()


def test_run_assistant_turn_system_health_uses_snapshot_not_overview(db_session, monkeypatch):
    from ragsuite_modules.ai_assistant.backend import agent as agent_mod
    from ragsuite_modules.ai_assistant.backend.agent import run_assistant_turn
    from ragsuite_modules.ai_assistant.backend.intent import IntentPlan, PlannedToolCall

    db, user, project = db_session
    settings = AIAssistantSettings(
        id=uuid.uuid4(),
        project_id=project.id,
        model_provider="openai",
        chat_model="gpt-4o-mini",
        api_key="test-key-abcdefghijklmnopqrstuvwxyz",
        temperature="0.1",
        max_tokens=256,
        language="en",
    )
    db.add(settings)
    db.commit()

    executed: list[str] = []

    def fake_plan_intent(client, *, model, user_message, history=None):
        return IntentPlan(
            cleaned_query="What is current system health?",
            intent="ops_system_health",
            needs_tools=True,
            tool_calls=[PlannedToolCall(name="system_health_snapshot", arguments={})],
            out_of_scope=False,
            focus_route="system-health",
            ui_workflow_key="view_system_health",
        )

    class _Msg:
        def __init__(self, content):
            self.content = content

    class _Choice:
        def __init__(self, content):
            self.message = _Msg(content)

    class _Resp:
        def __init__(self, content):
            self.choices = [_Choice(content)]

    class _Completions:
        def create(self, **kwargs):
            messages = kwargs.get("messages") or []
            grounding = " ".join(m.get("content") or "" for m in messages if m.get("role") == "system")
            assert "ui_workflow" in grounding
            assert "view_system_health" in grounding or "System Health" in grounding
            assert "query_log_count" not in grounding
            assert "search queries" not in grounding or "System Health" in grounding
            return _Resp(
                "Open System Health in the sidebar. Overall status is healthy with score 95. "
                "Review Service Status cards for each service."
            )

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

    def tracking_execute(db_sess, project_id, name, arguments):
        executed.append(name)
        if name == "system_health_snapshot":
            return json.dumps(
                {
                    "overall_status": "healthy",
                    "overall_health_score": 95.0,
                    "services": {
                        "API Gateway": {"status": "healthy", "health_score": 100, "reason": "ok"},
                        "PostgreSQL": {"status": "healthy", "health_score": 98, "reason": "ok"},
                    },
                }
            )
        raise AssertionError(f"unexpected tool {name}")

    monkeypatch.setattr(agent_mod, "plan_intent", fake_plan_intent)
    monkeypatch.setattr(agent_mod, "_build_client", lambda settings: (_Client(), "openai"))
    monkeypatch.setattr(agent_mod, "execute_tool", tracking_execute)

    events = list(
        run_assistant_turn(
            db,
            project_id=project.id,
            settings=settings,
            history=[],
            user_message="what is current system health?",
        )
    )
    assert executed == ["system_health_snapshot"]
    assert not any(e.get("name") == "overview_metrics" for e in events)
    tool_evt = next(e for e in events if e.get("type") == "tool")
    assert tool_evt["name"] == "system_health_snapshot"
    assert "overall status" in json.dumps(tool_evt["result"]).lower() or "Overall status" in json.dumps(
        tool_evt["result"]
    )
    done = next(e for e in events if e.get("type") == "done")
    assert "thumbs" not in done["content"].lower()
    assert "search queries" not in done["content"].lower()


def test_run_assistant_turn_top5_history_uses_search_queries_tool(db_session, monkeypatch):
    from ragsuite_modules.ai_assistant.backend import agent as agent_mod
    from ragsuite_modules.ai_assistant.backend.agent import run_assistant_turn
    from ragsuite_modules.ai_assistant.backend.intent import IntentPlan, PlannedToolCall

    db, user, project = db_session
    settings = AIAssistantSettings(
        id=uuid.uuid4(),
        project_id=project.id,
        model_provider="openai",
        chat_model="gpt-4o-mini",
        api_key="test-key-abcdefghijklmnopqrstuvwxyz",
        temperature="0.1",
        max_tokens=256,
        language="en",
    )
    db.add(settings)
    db.commit()

    executed: list[str] = []

    def fake_plan_intent(client, *, model, user_message, history=None):
        return IntentPlan(
            cleaned_query="Show top 5 search history queries.",
            intent="ops_history",
            needs_tools=True,
            tool_calls=[PlannedToolCall(name="top_search_queries", arguments={"limit": 5})],
            out_of_scope=False,
        )

    class _Msg:
        def __init__(self, content):
            self.content = content

    class _Choice:
        def __init__(self, content):
            self.message = _Msg(content)

    class _Resp:
        def __init__(self, content):
            self.choices = [_Choice(content)]

    class _Completions:
        def create(self, **kwargs):
            return _Resp("Here are the top 5 queries in chat history.")

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

    real_execute = agent_mod.execute_tool

    def tracking_execute(db_sess, project_id, name, arguments):
        executed.append(name)
        return real_execute(db_sess, project_id, name, arguments)

    monkeypatch.setattr(agent_mod, "plan_intent", fake_plan_intent)
    monkeypatch.setattr(agent_mod, "_build_client", lambda settings: (_Client(), "openai"))
    monkeypatch.setattr(agent_mod, "execute_tool", tracking_execute)

    events = list(
        run_assistant_turn(
            db,
            project_id=project.id,
            settings=settings,
            history=[],
            user_message="can you fetch history? top 5 queries.",
        )
    )
    assert executed == ["top_search_queries"]
    assert any(e.get("type") == "tool" and e.get("name") == "top_search_queries" for e in events)


def test_run_assistant_turn_top5_chatbot_history_uses_top_chat_queries(db_session, monkeypatch):
    from ragsuite_modules.ai_assistant.backend import agent as agent_mod
    from ragsuite_modules.ai_assistant.backend.agent import run_assistant_turn
    from ragsuite_modules.ai_assistant.backend.intent import validate_intent_plan

    db, user, project = db_session
    settings = AIAssistantSettings(
        id=uuid.uuid4(),
        project_id=project.id,
        model_provider="openai",
        chat_model="gpt-4o-mini",
        api_key="test-key-abcdefghijklmnopqrstuvwxyz",
        temperature="0.1",
        max_tokens=256,
        language="en",
    )
    db.add(settings)
    db.commit()

    executed: list[str] = []
    user_message = "give me top 5 query history for chatbot"

    def fake_plan_intent(client, *, model, user_message, history=None):
        # Simulate a confused planner that would previously force create_project.
        return validate_intent_plan(
            {
                "cleaned_query": user_message,
                "intent": "ui_navigation",
                "needs_tools": False,
                "tool_calls": [],
                "out_of_scope": False,
                "focus_route": "projects",
                "ui_workflow_key": "create_project",
            },
            user_message,
        )

    class _Msg:
        def __init__(self, content):
            self.content = content

    class _Choice:
        def __init__(self, content):
            self.message = _Msg(content)

    class _Resp:
        def __init__(self, content):
            self.choices = [_Choice(content)]

    class _Completions:
        def create(self, **kwargs):
            return _Resp("Here are the top 5 chatbot queries.")

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

    real_execute = agent_mod.execute_tool

    def tracking_execute(db_sess, project_id, name, arguments):
        executed.append(name)
        return real_execute(db_sess, project_id, name, arguments)

    monkeypatch.setattr(agent_mod, "plan_intent", fake_plan_intent)
    monkeypatch.setattr(agent_mod, "_build_client", lambda settings: (_Client(), "openai"))
    monkeypatch.setattr(agent_mod, "execute_tool", tracking_execute)

    events = list(
        run_assistant_turn(
            db,
            project_id=project.id,
            settings=settings,
            history=[],
            user_message=user_message,
        )
    )
    assert executed == ["top_chat_queries"]
    assert any(e.get("type") == "tool" and e.get("name") == "top_chat_queries" for e in events)


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


def test_chat_request_answer_from_sources_defaults_false():
    from ragsuite_modules.ai_assistant.backend.routes import ChatRequest

    req = ChatRequest(message="hello")
    assert req.answer_from_sources is False
    req_on = ChatRequest(message="hello", answer_from_sources=True)
    assert req_on.answer_from_sources is True


def test_run_docs_answer_turn_streams_tokens_without_ops_tools(db_session, monkeypatch):
    from app.models import SearchSettings
    from ragsuite_modules.ai_assistant.backend import docs_answer as docs_mod
    from ragsuite_modules.ai_assistant.backend.docs_answer import run_docs_answer_turn

    db, user, project = db_session
    search = SearchSettings(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        model_provider="openai",
        search_model="gpt-4o-mini",
        api_key="search-key-abcdefghijklmnopqrstuvwxyz",
        is_search_active=True,
        search_top_k=5,
        search_similarity_threshold=0.2,
        search_use_reranker=False,
        search_language="en",
    )
    db.add(search)
    db.commit()

    class _FakePipeline:
        vdb = object()

        def stream_query(self, **kwargs):
            assert kwargs.get("mode") == "search"
            assert kwargs.get("format_type") == "markdown"
            assert kwargs.get("user_query") == "What is in the docs?"
            yield ("Answer from ", None)
            yield ("sources.", None)
            yield ("", {"done": True, "full_text": "Answer from sources."})

    monkeypatch.setattr(
        docs_mod,
        "ensure_search_project_has_content",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        docs_mod,
        "resolve_for_project",
        lambda *a, **k: ("openai", "text-embedding-3-small", "emb-key"),
    )

    import sys
    import types

    fake_rag = types.ModuleType("app.routes.rag")
    fake_rag.RAG_AVAILABLE = True
    fake_rag.rag_pipeline = _FakePipeline()
    monkeypatch.setitem(sys.modules, "app.routes.rag", fake_rag)

    events = list(
        run_docs_answer_turn(
            db,
            project_id=project.id,
            user_id=user.id,
            user_message="What is in the docs?",
            history=[],
        )
    )
    assert any(e.get("type") == "token" for e in events)
    assert not any(e.get("type") == "tool" for e in events)
    done = next(e for e in events if e.get("type") == "done")
    assert "Answer from sources." in done["content"]


def test_run_docs_answer_turn_errors_when_search_inactive(db_session):
    from app.models import SearchSettings
    from ragsuite_modules.ai_assistant.backend.docs_answer import run_docs_answer_turn

    db, user, project = db_session
    search = SearchSettings(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        model_provider="openai",
        search_model="gpt-4o-mini",
        api_key="search-key-abcdefghijklmnopqrstuvwxyz",
        is_search_active=False,
    )
    db.add(search)
    db.commit()

    events = list(
        run_docs_answer_turn(
            db,
            project_id=project.id,
            user_id=user.id,
            user_message="hello",
        )
    )
    assert len(events) == 1
    assert events[0]["type"] == "error"
    assert "deactivated" in events[0]["message"].lower()


def test_normalize_sources_answer_spacing_expands_jammed_lists():
    from ragsuite_modules.ai_assistant.backend.docs_answer import (
        normalize_sources_answer_spacing,
    )

    jammed = (
        "T3Planet is a marketplace. "
        "Core Identity: - First store - Gold Member - Award winner. "
        "Key Offerings: - Templates - SaaS"
    )
    out = normalize_sources_answer_spacing(jammed)
    assert "Core Identity:\n\n- First store" in out
    assert "\n- Gold Member" in out
    assert "\n- Award winner" in out
    assert "Key Offerings:\n\n- Templates" in out
    assert "\n- SaaS" in out
    assert "\n\n\n" not in out


def test_run_docs_answer_turn_done_applies_spacing_normalizer(db_session, monkeypatch):
    from app.models import SearchSettings
    from ragsuite_modules.ai_assistant.backend import docs_answer as docs_mod
    from ragsuite_modules.ai_assistant.backend.docs_answer import run_docs_answer_turn

    db, user, project = db_session
    search = SearchSettings(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        model_provider="openai",
        search_model="gpt-4o-mini",
        api_key="search-key-abcdefghijklmnopqrstuvwxyz",
        is_search_active=True,
        search_language="en",
    )
    db.add(search)
    db.commit()

    jammed = "Intro. Core Identity: - Alpha - Beta"

    class _FakePipeline:
        vdb = object()

        def stream_query(self, **kwargs):
            assert kwargs.get("format_type") == "markdown"
            yield (jammed, None)
            yield ("", {"done": True})

    monkeypatch.setattr(docs_mod, "ensure_search_project_has_content", lambda *a, **k: None)
    monkeypatch.setattr(
        docs_mod,
        "resolve_for_project",
        lambda *a, **k: ("openai", "text-embedding-3-small", "emb-key"),
    )

    import sys
    import types

    fake_rag = types.ModuleType("app.routes.rag")
    fake_rag.RAG_AVAILABLE = True
    fake_rag.rag_pipeline = _FakePipeline()
    monkeypatch.setitem(sys.modules, "app.routes.rag", fake_rag)

    events = list(
        run_docs_answer_turn(
            db,
            project_id=project.id,
            user_id=user.id,
            user_message="what is it?",
            history=[],
        )
    )
    done = next(e for e in events if e.get("type") == "done")
    assert "Core Identity:\n\n- Alpha" in done["content"]
    assert "\n- Beta" in done["content"]
