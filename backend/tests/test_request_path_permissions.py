"""Path → Project access permission mapping (frontend/backend sync)."""

from app.platform.auth import _permission_for_request_path, _permissions_for_request_path


def test_chatbot_prefix_not_swallowed_by_chat():
    assert _permission_for_request_path("/api/v1/chatbot/settings") == "chatbot:settings"
    assert _permission_for_request_path("/api/v1/chatbot/integrations") == "chatbot:integrations"
    assert _permission_for_request_path("/api/v1/chatbot/training/active") == "chat:use"
    assert _permission_for_request_path("/api/v1/chatbot/activate") == "chat:use"


def test_chat_runtime_accepts_any_chatbot_leaf():
    assert _permissions_for_request_path("/api/v1/chat/message") == (
        "chat:use",
        "chatbot:settings",
        "chatbot:integrations",
    )


def test_documents_and_crawl_granular():
    assert _permission_for_request_path("/api/v1/documents/text") == "documents:text"
    assert _permission_for_request_path("/api/v1/documents/qa-pairs") == "documents:qa_pairs"
    assert _permission_for_request_path("/api/v1/documents/upload") == "documents:document"
    assert _permission_for_request_path("/api/v1/crawl/sites") == "crawl:manage"


def test_model_configuration_any_of():
    assert _permissions_for_request_path("/api/v1/model-configuration/providers") == (
        "model_configuration:manage",
        "chatbot:settings",
        "search:settings",
    )


def test_ai_assistant_single_switch_any_of():
    assert _permissions_for_request_path("/api/v1/ai-assistant/settings") == (
        "ai_assistant:use",
        "ai_assistant:settings",
    )
    assert _permissions_for_request_path("/api/v1/ai-assistant/sessions") == (
        "ai_assistant:use",
        "ai_assistant:settings",
    )


def test_search_settings_vs_use_vs_compare():
    assert _permission_for_request_path("/api/v1/search/configuration") == "search:settings"
    assert _permission_for_request_path("/api/v1/search/query") == "search:use"
    assert _permission_for_request_path("/api/v1/search/compare/stream") == "compare:use"


def test_system_health_and_audit_are_ungated():
    assert _permissions_for_request_path("/api/v1/system-health") is None
    assert _permissions_for_request_path("/api/v1/audit-events") is None
