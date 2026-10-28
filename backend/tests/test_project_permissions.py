"""Unit tests for project permission helpers."""

from app.services.project_permissions import (
    CANONICAL_PROJECT_PERMISSIONS,
    DEFAULT_CREATOR_MEMBER_PERMISSIONS,
    MODULE_CATALOG,
    has_effective_permission,
    migrate_member_permissions,
    normalize_member_permissions,
    user_can_create_project,
)


def test_write_implies_read():
    assert has_effective_permission(["model_configuration:write"], "model_configuration:read")
    assert has_effective_permission(["chatbot_settings:write"], "chatbot_settings:read")
    assert not has_effective_permission(["model_configuration:read"], "model_configuration:write")


def test_search_use_write_is_catalogued_and_legacy_stays_read():
    assert MODULE_CATALOG["search_use"] == ("read", "write")
    assert "search_use:write" in CANONICAL_PROJECT_PERMISSIONS
    assert "search_use:write" in DEFAULT_CREATOR_MEMBER_PERMISSIONS
    assert has_effective_permission(["search_use:write"], "search_use:read")
    assert not has_effective_permission(["search_use:read"], "search_use:write")
    assert has_effective_permission(["search:use"], "search_use:read")
    assert not has_effective_permission(["search:use"], "search_use:write")
    assert "search_use:read" in normalize_member_permissions(["search:use"])
    assert "search_use:write" not in normalize_member_permissions(["search:use"])


def test_profile_health_audit_are_catalogued():
    for module in ("system_health", "audit_logs"):
        assert MODULE_CATALOG[module] == ("read", "write")
        assert f"{module}:write" in CANONICAL_PROJECT_PERMISSIONS
        assert f"{module}:write" in DEFAULT_CREATOR_MEMBER_PERMISSIONS
    assert "profile" not in MODULE_CATALOG
    assert "profile:write" not in DEFAULT_CREATOR_MEMBER_PERMISSIONS
    assert "profile:read" in CANONICAL_PROJECT_PERMISSIONS
    assert "profile:write" in CANONICAL_PROJECT_PERMISSIONS
    assert has_effective_permission(["profile:general"], "profile:write")
    assert has_effective_permission(["compliance:view_receipts"], "audit_logs:read")
    assert "profile:write" in normalize_member_permissions(["profile:security"])
    assert "audit_logs:read" in normalize_member_permissions(["compliance:view_receipts"])


def test_legacy_chat_use_maps_to_read_not_write():
    assert has_effective_permission(["chat:use"], "chatbot_chat:read")
    assert has_effective_permission(["chat:use"], "chat:use")
    assert not has_effective_permission(["chat:use"], "chatbot_chat:write")


def test_legacy_settings_maps_to_write():
    assert has_effective_permission(["chatbot:settings"], "chatbot_settings:write")
    assert has_effective_permission(["chatbot:settings"], "chatbot_settings:read")
    assert has_effective_permission(["chatbot_settings:write"], "chatbot:settings")
    assert has_effective_permission(["search:settings"], "search_settings:write")
    assert has_effective_permission(["model_configuration:manage"], "model_configuration:write")
    assert has_effective_permission(["model_configuration:write"], "model_configuration:manage")


def test_compare_use_is_standalone():
    assert not has_effective_permission(["chat:use", "search:use"], "compare:use")
    assert not has_effective_permission(["chat:use", "search:use"], "compare:read")
    assert has_effective_permission(["compare:use"], "compare:read")
    assert has_effective_permission(["compare:read"], "compare:use")


def test_normalize_drops_unknown_admin_and_connectors():
    perms = normalize_member_permissions(
        [
            "project:admin",
            "project:create",
            "analytics:read",
            "bogus:perm",
            "connectors:manage",
            "connectors:gmail",
            "profile:general",
        ]
    )
    assert "project:admin" not in perms
    assert "project:create" not in perms
    assert "bogus:perm" not in perms
    assert "connectors:manage" not in perms
    assert "connectors:gmail" not in perms
    assert "profile:general" not in perms
    assert "profile:write" in perms
    assert "analytics:read" in perms
    assert "project:read" in perms


def test_normalize_rewrites_legacy_strings():
    perms = normalize_member_permissions(
        ["project:read", "chat:use", "chatbot:settings", "model_configuration:manage", "crawl:domain"]
    )
    assert "chatbot_chat:read" in perms
    assert "chatbot_settings:write" in perms
    assert "model_configuration:write" in perms
    assert "crawl_domain:write" in perms
    assert "chat:use" not in perms
    assert "chatbot:settings" not in perms
    assert "model_configuration:manage" not in perms
    # Redundant read is omitted when write is stored.
    assert "chatbot_settings:read" not in perms
    assert "model_configuration:read" not in perms


def test_user_can_create_project():
    assert not user_can_create_project(["project:create"], is_org_admin=False)
    assert not user_can_create_project(["project:read"], is_org_admin=False)
    assert user_can_create_project([], is_org_admin=True)


def test_normalize_workspace_permissions():
    from app.services.project_permissions import normalize_workspace_permissions

    assert normalize_workspace_permissions(["project:create", "analytics:read"]) == ["project:create"]
    assert normalize_workspace_permissions(["bogus"]) == []


def test_sources_granular_and_legacy_umbrellas():
    assert has_effective_permission(["crawl:manage"], "crawl_domain:write")
    assert has_effective_permission(["crawl:manage"], "crawl_sitemap:read")
    assert has_effective_permission(["crawl_domain:write"], "crawl:manage")
    assert has_effective_permission(["documents:manage"], "documents_text:write")
    assert has_effective_permission(["documents_qa:write"], "documents:manage")
    assert not has_effective_permission(["documents_text:write"], "documents:write")
    assert not has_effective_permission(["documents:text"], "documents:document")


def test_api_keys_legacy_rewrites_to_mcp():
    read_only = normalize_member_permissions(["api_keys:read"])
    assert "mcp:read" in read_only
    assert "mcp:write" not in read_only
    assert "api_keys:read" not in read_only
    assert has_effective_permission(["api_keys:read"], "mcp:read")
    assert not has_effective_permission(["api_keys:read"], "mcp:write")

    write = normalize_member_permissions(["api_keys:write"])
    assert "mcp:write" in write
    assert "mcp:read" not in write
    assert has_effective_permission(["api_keys:write"], "mcp:read")
    assert has_effective_permission(["api_keys:write"], "mcp:write")
    assert has_effective_permission(["mcp:write"], "api_keys:read")


def test_model_configuration_permission_known():
    assert "model_configuration:write" in normalize_member_permissions(
        ["project:read", "model_configuration:manage"]
    )


def test_ai_assistant_write_implies_read_but_read_does_not_write():
    assert has_effective_permission(["ai_assistant:use"], "ai_assistant:read")
    assert not has_effective_permission(["ai_assistant:use"], "ai_assistant:write")
    assert has_effective_permission(["ai_assistant:settings"], "ai_assistant:write")
    assert has_effective_permission(["ai_assistant:settings"], "ai_assistant:use")
    assert has_effective_permission(["ai_assistant:write"], "ai_assistant:settings")


def test_migrate_matches_normalize_and_preserves_effective_access():
    legacy = [
        "project:read",
        "chat:use",
        "search:use",
        "chatbot:settings",
        "history:read",
        "analytics:read",
        "api_keys:manage",
        "connectors:gmail",
    ]
    migrated = migrate_member_permissions(legacy)
    assert migrated == normalize_member_permissions(legacy)
    assert "connectors:gmail" not in migrated
    assert has_effective_permission(migrated, "chatbot_chat:read")
    assert has_effective_permission(migrated, "chatbot_settings:write")
    assert has_effective_permission(migrated, "mcp:read")
    assert has_effective_permission(migrated, "mcp:write")
    assert has_effective_permission(migrated, "api_keys:read")
    assert "mcp:write" in migrated
    assert "api_keys:write" not in migrated
    assert has_effective_permission(legacy, "chatbot_settings:write")
    assert has_effective_permission(legacy, "api_keys:read")
    assert has_effective_permission(legacy, "mcp:write")
