"""MCP action policy coverage."""
from __future__ import annotations

from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()


def test_every_registered_platform_tool_has_a_policy():
    from ragsuite_modules.mcp.backend.policy import POLICIES
    from ragsuite_modules.mcp.backend.tools_platform import get_platform_tools

    missing = [name for _fn, name, _desc in get_platform_tools() if name not in POLICIES]
    assert missing == []


def test_token_classes_are_destructive():
    from ragsuite_modules.mcp.backend.policy import TOKEN_CLASSES, policy_for

    for name in ("delete_project", "delete_document", "bulk_update_documents", "invite_member", "disconnect_connector"):
        policy = policy_for(name)
        assert policy is not None
        assert policy.action in TOKEN_CLASSES
        assert policy.needs_token is True


def test_reads_do_not_need_a_token():
    from ragsuite_modules.mcp.backend.policy import policy_for

    for name in ("list_projects", "describe_capabilities", "list_documents"):
        policy = policy_for(name)
        assert policy is not None
        assert policy.read_only is True
        assert policy.needs_token is False
        assert policy.entitlement is None


def test_analytics_reads_are_enterprise_gated():
    from ragsuite_modules.mcp.backend.policy import policy_for

    for name in ("search_analytics", "chat_analytics", "overview_metrics"):
        policy = policy_for(name)
        assert policy.read_only is True
        assert policy.entitlement == "analytics"
