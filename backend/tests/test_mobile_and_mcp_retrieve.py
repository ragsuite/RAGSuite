"""Unit tests for project mobile API keys and MCP multi-project retrieve helpers."""
from __future__ import annotations

import hashlib
import uuid
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException


def test_issue_mobile_key_sets_scope_and_project():
    from app.routes.api_keys import MOBILE_KEY_SCOPE, _issue_mobile_key

    user = SimpleNamespace(id=9)
    project = SimpleNamespace(id=uuid.uuid4())
    db = MagicMock()

    row, token = _issue_mobile_key(db, user, project)

    assert row.key_scope == MOBILE_KEY_SCOPE
    assert row.project_id == project.id
    assert row.created_by_id == 9
    assert token.startswith("rgs_live_")
    assert row.key_hash == hashlib.sha256(token.encode()).hexdigest()
    db.add.assert_called_once()
    db.commit.assert_called()


def test_merge_retrieve_results_sorts_and_caps():
    from app.routes.retrieve import _merge_retrieve_results

    per_project = [
        (
            "proj-a",
            {
                "results": [
                    {"text": "a1", "score": 40, "metadata": {}},
                    {"text": "a2", "score": 90, "metadata": {}},
                ]
            },
        ),
        (
            "proj-b",
            {
                "results": [
                    {"text": "b1", "score": 80, "metadata": {}},
                ]
            },
        ),
    ]
    merged = _merge_retrieve_results(per_project, top_k=2)
    assert [r["text"] for r in merged["results"]] == ["a2", "b1"]
    assert merged["results"][0]["rank"] == 1
    assert merged["results"][0]["metadata"]["project_id"] == "proj-a"
    assert merged["results"][1]["metadata"]["project_id"] == "proj-b"
    assert merged["retrieval_meta"]["project_count"] == 2


def test_resolve_project_id_or_user_accepts_mcp_user_without_project():
    from app.platform.auth import _resolve_project_id_or_user

    key_id = uuid.uuid4()
    api_key = SimpleNamespace(
        id=key_id,
        key="rgs_live_mcp_secret_value",
        key_hash=hashlib.sha256(b"rgs_live_mcp_secret_value").hexdigest(),
        is_active=True,
        expires_at=None,
        project_id=None,
        key_scope="mcp_user",
        created_by_id=42,
        request_count=0,
    )
    db = MagicMock()
    query = MagicMock()
    query.filter.return_value.first.return_value = api_key
    db.query.return_value = query
    db.execute = MagicMock()
    db.commit = MagicMock()

    request = MagicMock()
    auth = _resolve_project_id_or_user(
        request,
        authorization="Bearer rgs_live_mcp_secret_value",
        x_project_id=None,
        x_widget_mode=None,
        x_request_domain=None,
        x_widget_token=None,
        project_id=None,
        db=db,
        access_token=None,
    )
    assert auth["type"] == "mcp_user"
    assert auth["user_id"] == 42
    assert auth["api_key"].id == key_id


def test_resolve_project_id_or_user_accepts_mobile_scope():
    from app.platform.auth import _resolve_project_id_or_user

    project_id = uuid.uuid4()
    api_key = SimpleNamespace(
        id=uuid.uuid4(),
        key="rgs_live_mobile_secret_value",
        key_hash=hashlib.sha256(b"rgs_live_mobile_secret_value").hexdigest(),
        is_active=True,
        expires_at=None,
        project_id=project_id,
        key_scope="mobile",
        created_by_id=7,
        request_count=0,
    )
    db = MagicMock()
    query = MagicMock()
    query.filter.return_value.first.return_value = api_key
    db.query.return_value = query
    db.execute = MagicMock()
    db.commit = MagicMock()

    request = MagicMock()
    auth = _resolve_project_id_or_user(
        request,
        authorization="Bearer rgs_live_mobile_secret_value",
        x_project_id=None,
        x_widget_mode=None,
        x_request_domain=None,
        x_widget_token=None,
        project_id=None,
        db=db,
        access_token=None,
    )
    assert auth["type"] == "api_key"
    assert auth["api_key"].project_id == project_id


def test_resolve_search_project_rejects_mcp_user():
    from app.services.search_run_context import resolve_search_project

    with pytest.raises(HTTPException) as exc:
        resolve_search_project(MagicMock(), {"type": "mcp_user", "user_id": 1})
    assert exc.value.status_code == 403


def test_mobile_key_rejected_for_mcp_asgi():
    from app.platform.module_bootstrap import ensure_ragsuite_modules_path

    ensure_ragsuite_modules_path()
    from ragsuite_modules.mcp.backend.auth_asgi import PROJECT_KEY_REJECTED, _resolve_api_key

    key = SimpleNamespace(
        is_active=True,
        expires_at=None,
        key_scope="mobile",
        project_id=uuid.uuid4(),
        request_count=0,
        id="m",
        created_by_id=1,
        rate_limit=None,
    )
    db = MagicMock()
    query = MagicMock()
    query.filter.return_value.first.return_value = key
    db.query.return_value = query
    with patch("app.db.SessionLocal", return_value=db):
        ctx, err = _resolve_api_key("rgs_live_mobile_not_for_mcp")
    assert ctx is None
    assert err == PROJECT_KEY_REJECTED
