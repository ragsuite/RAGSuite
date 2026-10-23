"""Path → Project access permission mapping (frontend/backend sync)."""

import pytest

from app.platform.auth import (
    PERMISSION_EXEMPT_PATH_PREFIXES,
    _is_permission_exempt_path,
    _permission_for_request_path,
    _permissions_for_request_path,
)
from app.services.project_permissions import has_effective_permission


def test_chatbot_prefix_not_swallowed_by_chat():
    assert _permission_for_request_path("/api/v1/chatbot/settings") == "chatbot_settings:read"
    assert _permission_for_request_path("/api/v1/chatbot/settings", "PUT") == "chatbot_settings:write"
    assert _permission_for_request_path("/api/v1/chatbot/integrations") == "chatbot_integrations:read"
    assert _permission_for_request_path("/api/v1/chatbot/training/active") == "chatbot_chat:read"
    assert _permission_for_request_path("/api/v1/chatbot/activate") == "chatbot_chat:read"
    assert _permission_for_request_path("/api/v1/chatbot/activate", "POST") == "chatbot_chat:write"


def test_chat_runtime_is_chatbot_chat_read_via_post():
    assert _permissions_for_request_path("/api/v1/chat/message", "POST") == ("chatbot_chat:read",)
    assert _permissions_for_request_path("/api/v1/chat/message", "GET") == ("chatbot_chat:read",)


def test_shared_history_is_history_module():
    assert _permission_for_request_path("/api/v1/chat/history") == "history:read"
    assert _permission_for_request_path("/api/v1/search/history") == "history:read"
    assert _permission_for_request_path("/api/v1/chat/history/export") == "history:write"
    assert _permission_for_request_path("/api/v1/chat/history", "DELETE") == "history:write"


def test_documents_and_crawl_granular():
    assert _permission_for_request_path("/api/v1/documents/text") == "documents_text:read"
    assert _permission_for_request_path("/api/v1/documents/text", "POST") == "documents_text:write"
    assert _permission_for_request_path("/api/v1/documents/qa-pairs") == "documents_qa:read"
    assert _permission_for_request_path("/api/v1/documents/upload") == "documents:read"
    assert _permission_for_request_path("/api/v1/documents/upload", "POST") == "documents:write"
    assert _permissions_for_request_path("/api/v1/crawl/sites") == ("crawl_domain:read", "crawl_sitemap:read")
    assert _permissions_for_request_path("/api/v1/crawl/sites", "POST") == (
        "crawl_domain:write",
        "crawl_sitemap:write",
    )


def test_model_configuration_own_module_method_aware():
    assert _permissions_for_request_path("/api/v1/model-configuration/providers") == (
        "model_configuration:read",
    )
    assert _permissions_for_request_path("/api/v1/model-configuration/providers", "PUT") == (
        "model_configuration:write",
    )
    assert "chatbot_settings:write" not in (
        _permissions_for_request_path("/api/v1/model-configuration/providers", "PUT") or ()
    )


def test_ai_assistant_read_vs_write():
    assert _permissions_for_request_path("/api/v1/ai-assistant/settings") == ("ai_assistant:read",)
    assert _permissions_for_request_path("/api/v1/ai-assistant/settings", "PUT") == ("ai_assistant:write",)
    assert _permissions_for_request_path("/api/v1/ai-assistant/sessions", "POST") == ("ai_assistant:read",)


def test_voice_pilot_settings_accepts_chatbot_settings_or_voice_pilot():
    assert _permissions_for_request_path("/api/v1/voice-pilot/settings") == (
        "voice_pilot:read",
        "chatbot_settings:read",
    )
    assert _permissions_for_request_path("/api/v1/voice-pilot/settings", "PUT") == (
        "voice_pilot:write",
        "chatbot_settings:write",
    )
    assert _permissions_for_request_path("/api/v1/voice-pilot/voices") == (
        "voice_pilot:read",
        "chatbot_settings:read",
    )


def test_search_settings_vs_use_vs_compare():
    assert _permission_for_request_path("/api/v1/search/configuration") == "search_settings:read"
    assert _permission_for_request_path("/api/v1/search/configuration", "POST") == "search_settings:write"
    assert _permission_for_request_path("/api/v1/search/query", "GET") == "search_use:read"
    assert _permission_for_request_path("/api/v1/search/query", "POST") == "search_use:read"
    assert _permission_for_request_path("/api/v1/search/activate", "PUT") == "search_use:write"
    assert _permission_for_request_path("/api/v1/search/compare/stream", "POST") == "compare:read"


def test_system_health_audit_and_profile_are_gated():
    assert _permission_for_request_path("/api/v1/system-health") == "system_health:read"
    assert _permission_for_request_path("/api/v1/audit-events") == "audit_logs:read"
    assert _permission_for_request_path("/api/v1/audit-events/export") == "audit_logs:write"
    assert _permission_for_request_path("/api/v1/user/profile") == "profile:read"
    assert _permission_for_request_path("/api/v1/user/profile", "PUT") == "profile:write"
    assert _permission_for_request_path("/api/v1/user/profile/password", "PUT") == "profile:write"
    assert _permission_for_request_path("/api/v1/compliance/deletion-receipts") == "audit_logs:read"
    assert _permission_for_request_path("/api/v1/compliance/retention/projects") == "settings_data_retention:read"
    assert not _is_permission_exempt_path("/api/v1/system-health")
    assert not _is_permission_exempt_path("/api/v1/audit-events")
    assert not _is_permission_exempt_path("/api/v1/user/profile")
    assert not _is_permission_exempt_path("/api/v1/mcp-setup/servers")


def test_mcp_setup_is_mcp_module():
    assert _permission_for_request_path("/api/v1/mcp-setup/servers") == "mcp:read"
    assert _permission_for_request_path("/api/v1/mcp-setup/servers", "POST") == "mcp:write"


def test_api_keys_method_aware():
    assert _permission_for_request_path("/api/v1/api-keys") == "mcp:read"
    assert _permission_for_request_path("/api/v1/api-keys", "POST") == "mcp:write"
    assert _permission_for_request_path("/api/v1/api-keys/abc/reveal") == "mcp:write"
    assert _permission_for_request_path("/api/v1/mcp-setup/workspace-keys") == "mcp:read"
    assert _permission_for_request_path("/api/v1/mcp-setup/workspace-key", "POST") == "mcp:write"
    assert _permission_for_request_path("/api/v1/mcp-setup/workspace-key/abc", "PATCH") == "mcp:write"
    assert _permission_for_request_path("/api/v1/mcp-setup/workspace-key/abc", "DELETE") == "mcp:write"
    assert _permission_for_request_path("/api/v1/mcp-setup/workspace-key/abc/reveal") == "mcp:read"


def test_every_api_v1_route_is_mapped_or_exempt():
    from fastapi.routing import APIRoute

    from app.main import app

    unknown: list[str] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        path = route.path
        if not path.startswith("/api/v1"):
            continue
        template = path.split("{", 1)[0]
        if _is_permission_exempt_path(path) or _is_permission_exempt_path(template):
            continue
        if _permissions_for_request_path(path) is not None:
            continue
        if _permissions_for_request_path(template.rstrip("/") or path) is not None:
            continue
        unknown.append(f"{sorted(route.methods)} {path}")
    assert unknown == [], f"Unmapped /api/v1 routes (add a mapping or exempt prefix): {unknown}"


def test_exempt_list_covers_known_open_surfaces():
    for prefix in (
        "/api/v1/projects",
        "/api/v1/org",
        "/api/v1/mcp",
    ):
        assert any(prefix.startswith(item) or item.startswith(prefix) for item in PERMISSION_EXEMPT_PATH_PREFIXES)


@pytest.mark.parametrize(
    "granted,method,path,allowed",
    [
        (["chatbot_chat:read"], "GET", "/api/v1/chatbot/training/active", True),
        (["chatbot_chat:read"], "POST", "/api/v1/chatbot/activate", False),
        (["chatbot_chat:write"], "POST", "/api/v1/chatbot/activate", True),
        (["chatbot_chat:read"], "POST", "/api/v1/chat/message", True),
        (["history:read"], "GET", "/api/v1/chat/history", True),
        (["history:read"], "DELETE", "/api/v1/chat/history", False),
        (["history:write"], "DELETE", "/api/v1/chat/history", True),
        (["model_configuration:read"], "GET", "/api/v1/model-configuration/providers", True),
        (["model_configuration:read"], "PUT", "/api/v1/model-configuration/providers", False),
        (["model_configuration:write"], "PUT", "/api/v1/model-configuration/providers", True),
        (["search_use:read"], "POST", "/api/v1/search/query", True),
        (["search_use:read"], "GET", "/api/v1/search/query", True),
        (["search_use:read"], "PUT", "/api/v1/search/activate", False),
        (["search_use:write"], "PUT", "/api/v1/search/activate", True),
        (["search_use:read"], "POST", "/api/v1/search/configuration", False),
        (["search_settings:write"], "POST", "/api/v1/search/configuration", True),
        (["mcp:read"], "GET", "/api/v1/api-keys", True),
        (["mcp:read"], "POST", "/api/v1/api-keys", False),
        (["mcp:write"], "GET", "/api/v1/api-keys/abc/reveal", True),
        (["api_keys:read"], "GET", "/api/v1/api-keys", True),
        (["api_keys:read"], "POST", "/api/v1/api-keys", False),
        (["api_keys:write"], "GET", "/api/v1/api-keys/abc/reveal", True),
        (["mcp:read"], "GET", "/api/v1/mcp-setup/workspace-keys", True),
        (["mcp:read"], "GET", "/api/v1/mcp-setup/workspace-key/abc/reveal", True),
        (["mcp:read"], "POST", "/api/v1/mcp-setup/workspace-key", False),
        (["mcp:read"], "DELETE", "/api/v1/mcp-setup/workspace-key/abc", False),
        (["mcp:write"], "DELETE", "/api/v1/mcp-setup/workspace-key/abc", True),
        (["profile:read"], "GET", "/api/v1/user/profile", True),
        (["profile:read"], "PUT", "/api/v1/user/profile", False),
        (["profile:write"], "PUT", "/api/v1/user/profile", True),
        (["audit_logs:read"], "GET", "/api/v1/audit-events", True),
        (["audit_logs:read"], "GET", "/api/v1/audit-events/export", False),
        (["audit_logs:write"], "GET", "/api/v1/audit-events/export", True),
        (["system_health:read"], "GET", "/api/v1/system-health", True),
        (["documents:read"], "PUT", "/api/v1/documents/x/answers", False),
        (["documents:write"], "PUT", "/api/v1/documents/x/answers", True),
        (["project:admin"], "DELETE", "/api/v1/chat/history", True),
        ([], "GET", "/api/v1/chatbot/training/active", False),
        (["chatbot_settings:read"], "GET", "/api/v1/voice-pilot/settings", True),
        (["chatbot_settings:read"], "PUT", "/api/v1/voice-pilot/settings", False),
        (["chatbot_settings:write"], "PUT", "/api/v1/voice-pilot/settings", True),
        (["voice_pilot:read"], "GET", "/api/v1/voice-pilot/settings", True),
        (["voice_pilot:read"], "PUT", "/api/v1/voice-pilot/settings", False),
        (["voice_pilot:write"], "PUT", "/api/v1/voice-pilot/settings", True),
        (["chatbot_chat:read"], "GET", "/api/v1/voice-pilot/settings", False),
    ],
)
def test_role_method_matrix(granted, method, path, allowed):
    required = _permissions_for_request_path(path, method)
    assert required, f"unmapped {method} {path}"
    assert any(has_effective_permission(granted, item) for item in required) is allowed
