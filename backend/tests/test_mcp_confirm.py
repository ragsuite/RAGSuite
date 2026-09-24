"""Confirmation tokens, resolver, envelope, and idempotency."""
from __future__ import annotations

import json
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()


def _no_redis(monkeypatch):
    from ragsuite_modules.mcp.backend import confirmations, idempotency

    monkeypatch.setattr(confirmations, "_redis", lambda: None)
    monkeypatch.setattr(idempotency, "_redis", lambda: None)
    confirmations._memory.clear()
    idempotency._memory.clear()


def test_token_preview_execute_reuse_mismatch_and_cancel(monkeypatch):
    _no_redis(monkeypatch)
    from ragsuite_modules.mcp.backend.confirmations import cancel_token, consume_token, issue_token

    args = {"project_id": "p1", "confirm": True}
    token, ttl = issue_token(api_key_id="k1", user_id=9, tool="delete_project", arguments=args)
    assert ttl == 600
    consume_token(token, api_key_id="k1", user_id=9, tool="delete_project", arguments=args)
    try:
        consume_token(token, api_key_id="k1", user_id=9, tool="delete_project", arguments=args)
        raised = False
    except ValueError as exc:
        raised = str(exc) == "invalid"
    assert raised

    wrong_tool, _ttl = issue_token(api_key_id="k1", user_id=9, tool="delete_project", arguments=args)
    try:
        consume_token(wrong_tool, api_key_id="k1", user_id=9, tool="delete_document", arguments=args)
        assert False
    except ValueError as exc:
        assert str(exc) == "wrong_action"
    wrong_key, _ttl = issue_token(api_key_id="k1", user_id=9, tool="delete_project", arguments=args)
    try:
        consume_token(wrong_key, api_key_id="k2", user_id=9, tool="delete_project", arguments=args)
        assert False
    except ValueError as exc:
        assert str(exc) == "wrong_actor"

    changed, _ttl = issue_token(api_key_id="k1", user_id=9, tool="delete_project", arguments=args)
    try:
        consume_token(changed, api_key_id="k1", user_id=9, tool="delete_project", arguments={"project_id": "p2"})
        assert False
    except ValueError as exc:
        assert str(exc) == "args_changed"

    pending, _ttl = issue_token(api_key_id="k1", user_id=9, tool="delete_project", arguments=args)
    assert cancel_token(pending, api_key_id="k1", user_id=9) is True
    try:
        consume_token(pending, api_key_id="k1", user_id=9, tool="delete_project", arguments=args)
        assert False
    except ValueError as exc:
        assert str(exc) == "invalid"


def test_expired_token_is_rejected(monkeypatch):
    _no_redis(monkeypatch)
    from ragsuite_modules.mcp.backend import confirmations

    token, _ttl = confirmations.issue_token(
        api_key_id="k1", user_id=9, tool="delete_project", arguments={"project_id": "p1"}
    )
    expires, body = confirmations._memory[token]
    confirmations._memory[token] = (0, body)
    try:
        confirmations.consume_token(
            token, api_key_id="k1", user_id=9, tool="delete_project", arguments={"project_id": "p1"}
        )
        assert False
    except ValueError as exc:
        assert str(exc) == "invalid"
    assert expires > 0


def test_confirm_true_alone_on_delete_is_a_preview():
    from ragsuite_modules.mcp.backend import tools_platform
    from ragsuite_modules.mcp.backend.access import McpActor
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    actor = McpActor(user=SimpleNamespace(id=9, org_id=1), auth_project_id=pid, api_key_id=pid, accessible_project_ids=[pid])
    token = _mcp_auth_ctx.set(McpAuthContext(project_id=str(pid), api_key_id=pid, user_id=9))
    try:
        with (
            patch.object(tools_platform, "_db_session", return_value=MagicMock()),
            patch.object(tools_platform, "load_actor", return_value=actor),
        ):
            payload = json.loads(tools_platform.delete_document(document_id=str(pid), confirm=True))
        assert payload["ok"] is False
        assert payload["code"] == "confirmation_required"
        assert payload["confirmation_token"]
        assert "error" not in payload or payload.get("requires_confirmation") is True
    finally:
        _mcp_auth_ctx.reset(token)


def test_envelope_keeps_existing_keys():
    from ragsuite_modules.mcp.backend.responses import envelope_err, envelope_ok

    ok = envelope_ok({"ok": True, "project_id": "abc"})
    assert ok["ok"] is True
    assert ok["success"] is True
    assert ok["project_id"] == "abc"
    assert "message" in ok
    err = envelope_err("Missing permission 'x'", code="forbidden")
    assert err["ok"] is False
    assert err["code"] == "forbidden"
    assert err["error"] == "Missing permission 'x'"
    assert "permission" not in err["message"].lower() or "don't have permission" in err["message"].lower()


def test_resolver_one_many_and_none(monkeypatch):
    from ragsuite_modules.mcp.backend import resolve as resolver
    from ragsuite_modules.mcp.backend.access import McpActor

    actor = McpActor(user=SimpleNamespace(id=1, org_id=1), auth_project_id=None, api_key_id="k", accessible_project_ids=[])
    monkeypatch.setattr(resolver, "_projects", lambda *args, **kwargs: [{"id": "1", "name": "Docs", "type": "project"}])
    one = resolver.resolve_named(MagicMock(), actor, "project", "Docs")
    assert one["match"] == "one"
    monkeypatch.setattr(
        resolver,
        "_projects",
        lambda *args, **kwargs: [
            {"id": "1", "name": "Docs", "type": "project"},
            {"id": "2", "name": "Docs 2", "type": "project"},
        ],
    )
    many = resolver.resolve_named(MagicMock(), actor, "project", "Docs")
    assert many["match"] == "many"
    assert many["code"] == "ambiguous"
    monkeypatch.setattr(resolver, "_projects", lambda *args, **kwargs: [])
    none = resolver.resolve_named(MagicMock(), actor, "project", "Missing")
    assert none["match"] == "none"


def test_idempotent_store_returns_the_first_result(monkeypatch):
    _no_redis(monkeypatch)
    from ragsuite_modules.mcp.backend.idempotency import get_cached, store

    assert get_cached("k", "create_project", "same") is None
    store("k", "create_project", "same", '{"ok": true, "message": "already exists"}')
    assert "already exists" in get_cached("k", "create_project", "same")


def test_active_project_refused_when_user_has_no_projects_left():
    from ragsuite_modules.mcp.backend.access import McpActor, McpToolError, resolve_project_id

    active = uuid.uuid4()
    actor = McpActor(user=SimpleNamespace(id=1), auth_project_id=active, api_key_id="k", accessible_project_ids=[])
    for requested in (None, str(active)):
        try:
            resolve_project_id(actor, requested)
            assert False
        except McpToolError as exc:
            assert exc.code == "forbidden_project"


def test_active_project_outside_access_is_refused():
    from ragsuite_modules.mcp.backend.access import McpActor, McpToolError, resolve_project_id

    allowed = uuid.uuid4()
    active = uuid.uuid4()
    actor = McpActor(
        user=SimpleNamespace(id=1),
        auth_project_id=active,
        api_key_id="k",
        accessible_project_ids=[allowed],
    )
    try:
        resolve_project_id(actor, str(active))
        assert False
    except McpToolError as exc:
        assert exc.code == "forbidden_project"
