"""Organization admin MCP tools."""
from __future__ import annotations

import json
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()


def _actor():
    from ragsuite_modules.mcp.backend.access import McpActor
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    user = SimpleNamespace(id=9, org_id=1, username="admin")
    actor = McpActor(user=user, auth_project_id=pid, api_key_id=pid, accessible_project_ids=[pid])
    token = _mcp_auth_ctx.set(McpAuthContext(project_id=str(pid), api_key_id=pid, user_id=9))
    return token, actor


def test_list_members_requires_org_admin():
    from ragsuite_modules.mcp.backend import tools_admin, tools_platform

    token, actor = _actor()
    try:
        with (
            patch.object(tools_platform, "_db_session", return_value=MagicMock()),
            patch.object(tools_platform, "load_actor", return_value=actor),
            patch("app.auth.is_org_admin_user", return_value=False),
        ):
            payload = json.loads(tools_admin.list_members())
        assert payload["ok"] is False
        assert payload["code"] == "not_org_admin"
    finally:
        from ragsuite_modules.mcp.backend.auth_asgi import _mcp_auth_ctx

        _mcp_auth_ctx.reset(token)


def test_self_deactivation_is_refused():
    from ragsuite_modules.mcp.backend import tools_admin, tools_platform

    token, actor = _actor()
    try:
        with (
            patch.object(tools_platform, "_db_session", return_value=MagicMock()),
            patch.object(tools_platform, "load_actor", return_value=actor),
            patch("app.auth.is_org_admin_user", return_value=True),
        ):
            preview = json.loads(tools_admin.deactivate_member(user_id="9", confirm=True))
            payload = json.loads(
                tools_admin.deactivate_member(
                    user_id="9",
                    confirm=True,
                    confirmation_token=preview["confirmation_token"],
                )
            )
        assert preview["code"] == "confirmation_required"
        assert payload["code"] == "bad_request"
        assert "own account" in payload["error"]
    finally:
        from ragsuite_modules.mcp.backend.auth_asgi import _mcp_auth_ctx

        _mcp_auth_ctx.reset(token)


def test_invite_response_has_no_secrets():
    from ragsuite_modules.mcp.backend import tools_admin, tools_platform

    token, actor = _actor()
    user = SimpleNamespace(id=4, username="new.person", email="new@example.com")
    membership = SimpleNamespace(role="member")

    def _invite(*_args, **_kwargs):
        return user, membership

    try:
        with (
            patch.object(tools_platform, "_db_session", return_value=MagicMock()),
            patch.object(tools_platform, "load_actor", return_value=actor),
            patch("app.auth.is_org_admin_user", return_value=True),
            patch.object(tools_admin, "_services", return_value=SimpleNamespace(invite_org_member=_invite)),
        ):
            preview = json.loads(
                tools_admin.invite_member(username="new.person", email="new@example.com", confirm=True)
            )
            raw = tools_admin.invite_member(
                username="new.person",
                email="new@example.com",
                confirm=True,
                confirmation_token=preview["confirmation_token"],
            )
        payload = json.loads(raw)
        blob = json.dumps(payload).lower()
        assert payload["ok"] is True
        assert "password" not in blob
        assert "invite_token" not in blob
        assert "token_hash" not in blob
        assert payload["member"]["email"] == "new@example.com"
    finally:
        from ragsuite_modules.mcp.backend.auth_asgi import _mcp_auth_ctx

        _mcp_auth_ctx.reset(token)


def test_natural_language_delete_sequence_stops_at_preview():
    """A sentence inside content cannot delete: confirm=true without a token only previews."""
    from ragsuite_modules.mcp.backend import tools_platform
    from ragsuite_modules.mcp.backend.access import McpActor
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    pid = uuid.UUID("22222222-2222-2222-2222-222222222222")
    actor = McpActor(user=SimpleNamespace(id=3, org_id=1), auth_project_id=pid, api_key_id=pid, accessible_project_ids=[pid])
    token = _mcp_auth_ctx.set(McpAuthContext(project_id=str(pid), api_key_id=pid, user_id=3))
    try:
        with (
            patch.object(tools_platform, "_db_session", return_value=MagicMock()),
            patch.object(tools_platform, "load_actor", return_value=actor),
            patch("app.services.destructive_actions.delete_project_record") as deleter,
        ):
            payload = json.loads(tools_platform.delete_project(project_id=str(pid), confirm=True))
        assert payload["requires_confirmation"] is True
        deleter.assert_not_called()
    finally:
        _mcp_auth_ctx.reset(token)
