"""Tests for outbound RAGSuite MCP Connector (auth + tools)."""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()


def test_project_api_key_rejected_for_mcp():
    from ragsuite_modules.mcp.backend.auth_asgi import PROJECT_KEY_REJECTED, _resolve_api_key

    key = SimpleNamespace(
        is_active=True,
        expires_at=None,
        key_scope="project",
        project_id="11111111-1111-1111-1111-111111111111",
        request_count=0,
        id="k",
        created_by_id=1,
        rate_limit=None,
    )
    db = MagicMock()
    query = MagicMock()
    query.filter.return_value.first.return_value = key
    db.query.return_value = query
    with patch("app.db.SessionLocal", return_value=db):
        ctx, err = _resolve_api_key("rgs_live_not_mcp")
    assert ctx is None
    assert err == PROJECT_KEY_REJECTED


def test_search_without_active_project_asks_for_project():
    from ragsuite_modules.mcp.backend import tools_service
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    token = _mcp_auth_ctx.set(McpAuthContext(project_id="", api_key_id=1, user_id=9, workspace=True))
    try:
        payload = json.loads(tools_service.search_knowledge("hello"))
    finally:
        _mcp_auth_ctx.reset(token)
    assert payload["ok"] is False
    assert payload["code"] == "project_required"


def test_issue_workspace_key_has_no_project():
    from ragsuite_modules.mcp.backend.routes import _issue_workspace_key

    user = SimpleNamespace(id=3)
    db = MagicMock()
    row, token = _issue_workspace_key(db, user)
    assert row.project_id is None
    assert row.key_scope == "mcp_user"
    assert row.name == "MCP"
    assert token.startswith("rgs_live_")
    db.add.assert_called_once()


def test_create_workspace_key_allows_another():
    from ragsuite_modules.mcp.backend.routes import WorkspaceKeyCreateIn, create_workspace_key

    user = SimpleNamespace(id=3)
    db = MagicMock()
    request = MagicMock()
    request.base_url = "http://testserver/"
    first = create_workspace_key(request, WorkspaceKeyCreateIn(name="Cursor"), db, user)
    second = create_workspace_key(request, WorkspaceKeyCreateIn(name="Claude"), db, user)
    assert first.secret and second.secret
    assert first.secret != second.secret
    names = [call.args[0].name for call in db.add.call_args_list]
    assert names == ["Cursor", "Claude"]


def test_list_workspace_keys_includes_inactive():
    import uuid
    from datetime import datetime

    from ragsuite_modules.mcp.backend.routes import list_workspace_keys

    rows = [
        SimpleNamespace(
            id=uuid.uuid4(),
            name="One",
            key="rgs_live_" + "a" * 24,
            is_active=True,
            created_at=datetime(2026, 1, 1),
            last_used_at=None,
            request_count=2,
        ),
        SimpleNamespace(
            id=uuid.uuid4(),
            name="Two",
            key="rgs_live_" + "b" * 24,
            is_active=False,
            created_at=datetime(2026, 1, 2),
            last_used_at=None,
            request_count=0,
        ),
    ]
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = rows
    items = list_workspace_keys(db, SimpleNamespace(id=3))
    assert [item.name for item in items] == ["One", "Two"]
    assert items[0].is_active is True
    assert items[1].is_active is False
    assert "secret" not in items[0].model_dump()


def test_inactive_mcp_key_rejected():
    from ragsuite_modules.mcp.backend.auth_asgi import _resolve_api_key

    key = SimpleNamespace(
        is_active=False,
        expires_at=None,
        key_scope="mcp_user",
        project_id=None,
        request_count=0,
        id="k",
        created_by_id=1,
        rate_limit=None,
    )
    db = MagicMock()
    query = MagicMock()
    query.filter.return_value.first.return_value = key
    db.query.return_value = query
    with patch("app.db.SessionLocal", return_value=db):
        ctx, err = _resolve_api_key("rgs_live_inactive")
    assert ctx is None
    assert err == "Invalid or inactive MCP key"


def test_delete_workspace_key_removes_only_that_key():
    import uuid

    from ragsuite_modules.mcp.backend.routes import delete_workspace_key

    row = SimpleNamespace(id=uuid.uuid4())
    other = SimpleNamespace(id=uuid.uuid4())
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = row
    delete_workspace_key(row.id, db, SimpleNamespace(id=3))
    db.delete.assert_called_once_with(row)
    assert other.id not in [call.args[0].id for call in db.delete.call_args_list]


def test_project_api_key_cannot_be_deleted_or_revealed_via_mcp_routes():
    import uuid

    import pytest
    from fastapi import HTTPException

    from ragsuite_modules.mcp.backend.routes import delete_workspace_key, reveal_workspace_key

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    user = SimpleNamespace(id=3)
    key_id = uuid.uuid4()
    with pytest.raises(HTTPException) as deleted:
        delete_workspace_key(key_id, db, user)
    assert deleted.value.status_code == 404
    with pytest.raises(HTTPException) as revealed:
        reveal_workspace_key(key_id, db, user)
    assert revealed.value.status_code == 404


def test_reveal_rejects_inactive_mcp_key():
    import uuid

    import pytest
    from fastapi import HTTPException

    from ragsuite_modules.mcp.backend.routes import reveal_workspace_key

    row = SimpleNamespace(id=uuid.uuid4(), is_active=False, key="rgs_live_secret")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = row
    with pytest.raises(HTTPException) as exc:
        reveal_workspace_key(row.id, db, SimpleNamespace(id=3))
    assert exc.value.status_code == 409
    assert db.delete.called is False


def test_set_active_project_requires_confirm():
    from ragsuite_modules.mcp.backend import tools_platform
    from ragsuite_modules.mcp.backend.access import McpActor
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx
    import uuid

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    token = _mcp_auth_ctx.set(McpAuthContext(project_id="", api_key_id=pid, user_id=9, workspace=True))
    try:
        actor = McpActor(
            user=SimpleNamespace(id=9, org_id=1),
            auth_project_id=None,
            api_key_id=pid,
            accessible_project_ids=[pid],
        )
        with (
            patch.object(tools_platform, "_db_session", return_value=MagicMock()),
            patch.object(tools_platform, "load_actor", return_value=actor),
        ):
            payload = json.loads(tools_platform.set_active_project(project_id=str(pid), confirm=False))
        assert payload["ok"] is False
        assert payload["code"] == "confirm_required"
    finally:
        _mcp_auth_ctx.reset(token)


def test_set_active_project_switches_workspace_project():
    from ragsuite_modules.mcp.backend import tools_platform
    from ragsuite_modules.mcp.backend.access import McpActor
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx
    import uuid

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    key_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    project = SimpleNamespace(id=pid, name="RAGSuite", is_active=True)
    key = SimpleNamespace(id=key_id, key_scope="mcp_user", mcp_active_project_id=None)
    user = SimpleNamespace(id=9, org_id=1)
    db = MagicMock()

    def query_side(model):
        result = MagicMock()
        name = getattr(model, "__name__", "")
        if name == "APIKey":
            result.filter.return_value.first.return_value = key
        elif name == "Project":
            result.filter.return_value.first.return_value = project
        return result

    db.query.side_effect = query_side
    token = _mcp_auth_ctx.set(McpAuthContext(project_id="", api_key_id=key_id, user_id=9, workspace=True))
    try:
        actor = McpActor(
            user=user,
            auth_project_id=None,
            api_key_id=key_id,
            accessible_project_ids=[pid],
        )
        with (
            patch.object(tools_platform, "_db_session", return_value=db),
            patch.object(tools_platform, "load_actor", return_value=actor),
            patch.object(tools_platform, "require_permission"),
            patch.object(tools_platform, "audit_mcp"),
            patch("app.platform.auth.set_user_active_project", return_value=project) as activate,
            patch("app.services.notification_service.create_notification"),
        ):
            payload = json.loads(tools_platform.set_active_project(project_id=str(pid), confirm=True))
        assert payload["ok"] is True
        assert payload["project_name"] == "RAGSuite"
        assert payload["is_active"] is True
        assert key.mcp_active_project_id == pid
        activate.assert_called_once_with(db, user, project)
    finally:
        _mcp_auth_ctx.reset(token)


def test_mcp_auth_requires_bearer():
    import asyncio

    from ragsuite_modules.mcp.backend.auth_asgi import McpApiKeyAuthMiddleware

    inner_called = {"ok": False}

    async def inner(scope, receive, send):
        inner_called["ok"] = True

    mw = McpApiKeyAuthMiddleware(inner)

    sent = []

    async def send(message):
        sent.append(message)

    async def receive():
        return {"type": "http.disconnect"}

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/",
        "headers": [],
    }

    asyncio.run(mw(scope, receive, send))
    assert inner_called["ok"] is False
    assert any(m.get("type") == "http.response.start" and m.get("status") == 401 for m in sent)


def test_query_result_dedupe_collapses_same_url_chunk():
    from app.services.rag.rag import Retriever

    docs = ["a", "a-dup", "b"]
    ids = ["1", "2", "3"]
    metas = [
        {"url": "https://Example.com/page/", "chunk_index": 0},
        {"url": "https://example.com/page", "chunk_index": 0},
        {"url": "https://example.com/other", "chunk_index": 0},
    ]
    dists = [0.2, 0.1, 0.3]
    out_docs, _ids, out_metas, out_dists = Retriever._dedupe_ranked_results(
        docs, ids, metas, dists, top_k=5
    )
    assert len(out_docs) == 2
    assert out_dists[0] == 0.1  # better score kept for duplicate URL
    assert out_metas[0]["url"] == "https://example.com/page"


def test_search_knowledge_uses_project_from_auth_context():
    from ragsuite_modules.mcp.backend import tools_service
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    token = _mcp_auth_ctx.set(
        McpAuthContext(project_id="11111111-1111-1111-1111-111111111111", api_key_id=1, user_id=9)
    )
    try:
        fake_pipeline = MagicMock()
        fake_pipeline.retrieve_only.return_value = {
            "results": [
                {
                    "text": "chunk",
                    "score": 90,
                    "rank": 1,
                    "metadata": {
                        "document_id": "doc-1",
                        "chunk_index": 0,
                        "url": "https://example.com/a",
                        "title": "A",
                    },
                }
            ],
            "retrieval_meta": {},
        }
        fake_db = MagicMock()
        fake_db.query.return_value.filter.return_value.first.return_value = None

        with (
            patch.object(tools_service, "_db_session", return_value=fake_db),
            patch.object(tools_service, "_embedding_for_project", return_value=(None, None, None)),
            patch(
                "app.services.rag.singleton.get_pipeline",
                return_value=fake_pipeline,
            ),
            patch.object(tools_service, "_log_mcp_query"),
        ):
            raw = tools_service.search_knowledge("refund policy", top_k=3)
        payload = json.loads(raw)
        assert payload["project_id"] == "11111111-1111-1111-1111-111111111111"
        assert len(payload["results"]) == 1
        assert payload["results"][0]["document_id"] == "doc-1"
        assert payload["results"][0]["score"] == 90
        fake_pipeline.retrieve_only.assert_called_once()
        assert fake_pipeline.retrieve_only.call_args.kwargs["project_id"] == (
            "11111111-1111-1111-1111-111111111111"
        )
        assert fake_pipeline.retrieve_only.call_args.kwargs["top_k"] == 3
    finally:
        _mcp_auth_ctx.reset(token)


def test_search_knowledge_honors_top_k_over_chat_settings():
    """Default tool top_k=5 must not be replaced by chatbot chat_top_k (often 8)."""
    from ragsuite_modules.mcp.backend import tools_service
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    token = _mcp_auth_ctx.set(
        McpAuthContext(project_id="11111111-1111-1111-1111-111111111111", api_key_id=1, user_id=9)
    )
    try:
        fake_pipeline = MagicMock()
        fake_pipeline.retrieve_only.return_value = {
            "results": [
                {
                    "text": f"c{i}",
                    "score": 90 - i,
                    "rank": i + 1,
                    "metadata": {"url": f"https://ex.com/{i}", "chunk_index": 0},
                }
                for i in range(8)
            ],
            "retrieval_meta": {"fused_count": 8},
        }
        chat_settings = SimpleNamespace(
            chat_use_reranker=False,
            chat_similarity_threshold=None,
            chat_top_k=8,
            chatbot_language=None,
        )
        fake_db = MagicMock()
        fake_db.query.return_value.filter.return_value.first.return_value = chat_settings

        with (
            patch.object(tools_service, "_db_session", return_value=fake_db),
            patch.object(tools_service, "_embedding_for_project", return_value=(None, None, None)),
            patch("app.services.rag.singleton.get_pipeline", return_value=fake_pipeline),
            patch.object(tools_service, "_log_mcp_query"),
        ):
            raw = tools_service.search_knowledge("overview", top_k=5)
        payload = json.loads(raw)
        assert payload["top_k"] == 5
        assert len(payload["results"]) == 5
        assert fake_pipeline.retrieve_only.call_args.kwargs["top_k"] == 5
    finally:
        _mcp_auth_ctx.reset(token)


def test_search_knowledge_filters_by_source_id():
    from ragsuite_modules.mcp.backend import tools_service
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    token = _mcp_auth_ctx.set(
        McpAuthContext(project_id="11111111-1111-1111-1111-111111111111", api_key_id=1, user_id=9)
    )
    try:
        fake_pipeline = MagicMock()
        fake_pipeline.retrieve_only.return_value = {
            "results": [
                {
                    "text": "keep",
                    "score": 90,
                    "metadata": {"crawl_source_id": "src-a", "url": "https://a/1", "title": "A"},
                },
                {
                    "text": "drop",
                    "score": 80,
                    "metadata": {"crawl_source_id": "src-b", "url": "https://b/1", "title": "B"},
                },
            ],
            "retrieval_meta": {},
        }
        fake_db = MagicMock()
        fake_db.query.return_value.filter.return_value.first.return_value = None

        with (
            patch.object(tools_service, "_db_session", return_value=fake_db),
            patch.object(tools_service, "_embedding_for_project", return_value=(None, None, None)),
            patch("app.services.rag.singleton.get_pipeline", return_value=fake_pipeline),
            patch.object(tools_service, "_log_mcp_query"),
        ):
            raw = tools_service.search_knowledge("x", top_k=5, source_id="src-a")
        payload = json.loads(raw)
        assert len(payload["results"]) == 1
        assert payload["results"][0]["text"] == "keep"
        assert fake_pipeline.retrieve_only.call_args.kwargs["top_k"] == 15
    finally:
        _mcp_auth_ctx.reset(token)


def test_ask_knowledge_returns_answer_and_citations():
    from ragsuite_modules.mcp.backend import tools_service
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    token = _mcp_auth_ctx.set(
        McpAuthContext(project_id="11111111-1111-1111-1111-111111111111", api_key_id=1, user_id=9)
    )
    try:
        fake_pipeline = MagicMock()
        fake_pipeline.query.return_value = {
            "summary": "Refunds within 30 days.",
            "raw_contexts": ["Policy text"],
            "raw_contexts_metadatas": [{"title": "Policy", "url": "https://example.com/p"}],
            "raw_chunk_similarity_pct": [77],
            "retrieval_meta": {},
        }
        project = SimpleNamespace(id="11111111-1111-1111-1111-111111111111")
        chat_settings = SimpleNamespace(
            model_provider="openai",
            chat_model="gpt-4o-mini",
            api_key="sk-test",
            chat_use_reranker=False,
            chat_similarity_threshold=0.5,
            chat_temperature=0.2,
            chat_top_p=None,
            chat_best_of=None,
            chat_frequency_penalty=None,
            chat_presence_penalty=None,
            chat_top_k=8,
            chatbot_language="en",
        )
        fake_db = MagicMock()

        def _query(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if "Project" in name:
                q.filter.return_value.first.return_value = project
            else:
                q.filter.return_value.first.return_value = chat_settings
            return q

        fake_db.query.side_effect = _query

        with (
            patch.object(tools_service, "_db_session", return_value=fake_db),
            patch.object(tools_service, "_embedding_for_project", return_value=(None, None, None)),
            patch("app.services.rag.singleton.get_pipeline", return_value=fake_pipeline),
            patch(
                "app.utils.api_key.resolve_runtime_llm_api_key",
                return_value="sk-resolved",
            ),
            patch.object(tools_service, "_log_mcp_query"),
        ):
            raw = tools_service.ask_knowledge("What is the refund policy?", top_k=5)
        payload = json.loads(raw)
        assert "30 days" in payload["answer"]
        assert payload["citations"]
        assert payload["citations"][0]["title"] == "Policy"
        assert payload["citations"][0]["score"] == 77
        assert payload["top_k"] == 5
        assert payload["format"] == "brief"
        kwargs = fake_pipeline.query.call_args.kwargs
        assert kwargs["top_k"] == 5
        assert kwargs["similarity_threshold"] == 0.45  # clamped
        assert kwargs["llm_config"]["chat_model"] == "gpt-4o-mini"
        assert kwargs["llm_config"]["provider"] == "openai"
        assert kwargs["llm_config"]["api_key"] == "sk-resolved"
    finally:
        _mcp_auth_ctx.reset(token)


def test_ask_knowledge_citations_only_skips_llm():
    from ragsuite_modules.mcp.backend import tools_service
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    token = _mcp_auth_ctx.set(
        McpAuthContext(project_id="11111111-1111-1111-1111-111111111111", api_key_id=1, user_id=9)
    )
    try:
        fake_pipeline = MagicMock()
        fake_pipeline.retrieve_only.return_value = {
            "results": [
                {
                    "text": "snippet body",
                    "score": 88,
                    "metadata": {"title": "Doc", "url": "https://ex.com", "document_id": "d1"},
                }
            ],
            "retrieval_meta": {"confidence_score": 88},
        }
        project = SimpleNamespace(id="11111111-1111-1111-1111-111111111111")
        fake_db = MagicMock()

        def _query(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if "Project" in name:
                q.filter.return_value.first.return_value = project
            else:
                q.filter.return_value.first.return_value = None
            return q

        fake_db.query.side_effect = _query

        with (
            patch.object(tools_service, "_db_session", return_value=fake_db),
            patch.object(tools_service, "_embedding_for_project", return_value=(None, None, None)),
            patch("app.services.rag.singleton.get_pipeline", return_value=fake_pipeline),
            patch.object(tools_service, "_log_mcp_query"),
        ):
            raw = tools_service.ask_knowledge("q", format="citations_only")
        payload = json.loads(raw)
        assert payload["answer"] == ""
        assert payload["format"] == "citations_only"
        assert payload["citations"][0]["score"] == 88
        fake_pipeline.query.assert_not_called()
        fake_pipeline.retrieve_only.assert_called_once()
    finally:
        _mcp_auth_ctx.reset(token)


def test_list_sources_and_connector_status():
    from ragsuite_modules.mcp.backend import tools_service
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    token = _mcp_auth_ctx.set(
        McpAuthContext(project_id="11111111-1111-1111-1111-111111111111", api_key_id=1, user_id=9)
    )
    try:
        source = SimpleNamespace(
            id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            name="Docs",
            base_url="https://docs.example.com",
            status=SimpleNamespace(value="active"),
            documents_count=12,
            last_crawl_at=None,
            updated_at=None,
        )
        fake_db = MagicMock()

        # list_sources uses query().filter().order_by().limit().all()
        crawl_q = MagicMock()
        crawl_q.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
            source
        ]
        upload_q = MagicMock()
        upload_q.filter.return_value.scalar.return_value = 3

        def _query_list(model):
            name = getattr(model, "__name__", str(model))
            if "CrawlSource" in name:
                return crawl_q
            return upload_q

        fake_db.query.side_effect = _query_list

        with patch.object(tools_service, "_db_session", return_value=fake_db):
            raw = tools_service.list_sources()
        payload = json.loads(raw)
        assert payload["crawl_sources"][0]["name"] == "Docs"
        assert payload["uploads"]["count"] == 3

        # connector_status
        status_db = MagicMock()
        count_q = MagicMock()
        count_q.filter.return_value.scalar.return_value = 2
        count_q.join.return_value.filter.return_value.scalar.return_value = 10
        chat_q = MagicMock()
        chat_q.filter.return_value.first.return_value = SimpleNamespace(
            model_provider="openai", chat_model="gpt-4o-mini"
        )

        def _query_status(model):
            name = getattr(model, "__name__", str(model))
            if "ChatbotSettings" in name:
                return chat_q
            return count_q

        status_db.query.side_effect = _query_status

        with (
            patch.object(tools_service, "_db_session", return_value=status_db),
            patch.object(tools_service, "_embedding_for_project", return_value=("openai", "text-embedding-3-small", None)),
            patch("app.services.rag.singleton.get_pipeline", return_value=MagicMock()),
        ):
            raw_status = tools_service.connector_status()
        status = json.loads(raw_status)
        assert status["ok"] is True
        assert status["llm_configured"] is True
        assert status["embedding_model"] == "text-embedding-3-small"
    finally:
        _mcp_auth_ctx.reset(token)


def test_mcp_setup_template_url_helper():
    from ragsuite_modules.mcp.backend.routes import _claude_snippet, _cursor_snippet
    from ragsuite_modules.mcp.backend.server import (
        MCP_PUBLIC_PATH,
        _build_transport_security,
        _hostname_from_url,
    )

    cursor = _cursor_snippet("https://example.com/api/v1/mcp/", "rgs_live_test")
    assert "https://example.com/api/v1/mcp/" in cursor
    assert "rgs_live_test" in cursor
    assert "Authorization" in cursor
    assert "ngrok-skip-browser-warning" not in cursor
    claude = _claude_snippet("https://example.com/api/v1/mcp/", "rgs_live_test")
    assert '"type": "http"' in claude
    assert MCP_PUBLIC_PATH.endswith("/")
    assert _hostname_from_url("https://payphone-trusting-tidbit.ngrok-free.dev/api/v1") == (
        "payphone-trusting-tidbit.ngrok-free.dev"
    )

    with patch("app.settings.settings.public_api_base_url", "https://payphone.ngrok-free.dev/api/v1"):
        security = _build_transport_security()
    assert "payphone.ngrok-free.dev" in security.allowed_hosts
    assert "127.0.0.1:*" in security.allowed_hosts


def test_platform_tools_registered_and_no_connect_oauth():
    from ragsuite_modules.mcp.backend.tools_platform import PLATFORM_TOOLS, get_platform_tools

    names = {name for _, name, _ in PLATFORM_TOOLS}
    assert "list_projects" in names
    assert "create_project" in names
    assert "recent_queries" in names
    assert "create_crawl_source" in names
    assert "sync_connector" in names
    assert "delete_project" in names
    assert "delete_crawl_source" in names
    assert "delete_document" in names
    assert "connect_connector" not in names
    # EE tools are not in the CE base list
    assert "analytics_overview" not in names
    assert "compare_models_status" not in names
    # get_platform_tools may add EE when modules are present
    all_names = {name for _, name, _ in get_platform_tools()}
    assert names.issubset(all_names)


def test_ee_tools_conditional_on_modules():
    from ragsuite_modules.mcp.backend import tools_platform

    with patch.object(tools_platform, "_module_loaded", return_value=False):
        assert tools_platform.optional_ee_tools() == []
    with patch.object(tools_platform, "_module_loaded", side_effect=lambda mid: mid == "analytics"):
        ee = tools_platform.optional_ee_tools()
        assert [n for _, n, _ in ee] == ["analytics_overview"]
    with patch.object(tools_platform, "_module_loaded", side_effect=lambda mid: mid == "compare_models"):
        ee = tools_platform.optional_ee_tools()
        assert [n for _, n, _ in ee] == ["compare_models_status"]


def test_write_requires_confirm():
    from ragsuite_modules.mcp.backend import tools_platform
    from ragsuite_modules.mcp.backend.access import McpActor
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx
    import uuid

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    token = _mcp_auth_ctx.set(McpAuthContext(project_id=str(pid), api_key_id=pid, user_id=9))
    try:
        user = SimpleNamespace(id=9, org_id=1)
        actor = McpActor(
            user=user,
            auth_project_id=pid,
            api_key_id=pid,
            accessible_project_ids=[pid],
        )
        fake_db = MagicMock()
        with (
            patch.object(tools_platform, "_db_session", return_value=fake_db),
            patch.object(tools_platform, "load_actor", return_value=actor),
        ):
            raw = tools_platform.create_project(project_name="Demo", confirm=False)
        payload = json.loads(raw)
        assert payload["ok"] is False
        assert payload["code"] == "confirm_required"
    finally:
        _mcp_auth_ctx.reset(token)


def test_list_projects_and_forbidden_project_id():
    from ragsuite_modules.mcp.backend import tools_platform
    from ragsuite_modules.mcp.backend.access import McpActor
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx
    import uuid

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    other = uuid.UUID("22222222-2222-2222-2222-222222222222")
    token = _mcp_auth_ctx.set(McpAuthContext(project_id=str(pid), api_key_id=pid, user_id=9))
    try:
        user = SimpleNamespace(id=9, org_id=1)
        actor = McpActor(
            user=user,
            auth_project_id=pid,
            api_key_id=pid,
            accessible_project_ids=[pid],
        )
        project = SimpleNamespace(
            id=pid, name="Main", description="", is_active=True, org_id=1, owner_id=9
        )
        fake_db = MagicMock()
        q = MagicMock()
        q.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [project]
        fake_db.query.return_value = q

        with (
            patch.object(tools_platform, "_db_session", return_value=fake_db),
            patch.object(tools_platform, "load_actor", return_value=actor),
        ):
            raw = tools_platform.list_projects()
        payload = json.loads(raw)
        assert payload["ok"] is True
        assert payload["projects"][0]["name"] == "Main"

        with (
            patch.object(tools_platform, "_db_session", return_value=fake_db),
            patch.object(tools_platform, "load_actor", return_value=actor),
        ):
            denied = json.loads(tools_platform.get_project(project_id=str(other)))
        assert denied["ok"] is False
        assert denied["code"] == "forbidden_project"
    finally:
        _mcp_auth_ctx.reset(token)


def test_create_project_schema_uses_project_name_not_name():
    import inspect
    from ragsuite_modules.mcp.backend.tools_platform import create_project, create_crawl_source

    create_params = inspect.signature(create_project).parameters
    assert "project_name" in create_params
    assert "name" not in create_params
    crawl_params = inspect.signature(create_crawl_source).parameters
    assert "source_name" in crawl_params
    assert "name" not in crawl_params


def test_create_project_with_confirm():
    from ragsuite_modules.mcp.backend import tools_platform
    from ragsuite_modules.mcp.backend.access import McpActor
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx
    import uuid

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    token = _mcp_auth_ctx.set(McpAuthContext(project_id=str(pid), api_key_id=pid, user_id=9))
    try:
        user = SimpleNamespace(id=9, org_id=1)
        actor = McpActor(
            user=user,
            auth_project_id=pid,
            api_key_id=pid,
            accessible_project_ids=[pid],
        )
        new_id = uuid.UUID("33333333-3333-3333-3333-333333333333")
        org = SimpleNamespace(id=1, max_projects=0)
        fake_db = MagicMock()

        def _query(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if "Organization" in name:
                q.filter.return_value.first.return_value = org
            elif "Project" in name:
                q.filter.return_value.first.return_value = None
                q.filter.return_value.count.return_value = 1
                q.filter.return_value.update.return_value = None
            else:
                q.filter.return_value.all.return_value = []
            return q

        fake_db.query.side_effect = _query
        held = {}

        def add(obj):
            held["p"] = obj

        def flush():
            p = held.get("p")
            if p is not None:
                p.id = new_id

        def refresh(obj):
            obj.id = new_id

        fake_db.add.side_effect = add
        fake_db.flush.side_effect = flush
        fake_db.refresh.side_effect = refresh

        with (
            patch.object(tools_platform, "_db_session", return_value=fake_db),
            patch.object(tools_platform, "load_actor", return_value=actor),
            patch.object(tools_platform, "can_create_project", return_value=True),
            patch.object(tools_platform, "audit_mcp"),
            patch("app.auth.is_org_admin_user", return_value=False),
            patch("app.services.notification_service.create_notification"),
        ):
            raw = tools_platform.create_project(project_name="Demo", confirm=True)
        payload = json.loads(raw)
        assert payload["ok"] is True
        assert payload["project_id"] == str(new_id)
        assert "API key" in payload["note"]
    finally:
        _mcp_auth_ctx.reset(token)


def _actor_for(pid):
    import uuid

    from ragsuite_modules.mcp.backend.access import McpActor
    from ragsuite_modules.mcp.backend.auth_asgi import McpAuthContext, _mcp_auth_ctx

    user = SimpleNamespace(id=9, org_id=1)
    actor = McpActor(user=user, auth_project_id=pid, api_key_id=pid, accessible_project_ids=[pid])
    token = _mcp_auth_ctx.set(McpAuthContext(project_id=str(pid), api_key_id=pid, user_id=9))
    return token, actor, uuid


def test_create_crawl_source_missing_fields_does_not_insert():
    import json
    import uuid

    from ragsuite_modules.mcp.backend import tools_platform

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    token, actor, _uuid = _actor_for(pid)
    fake_db = MagicMock()
    try:
        with (
            patch.object(tools_platform, "_db_session", return_value=fake_db),
            patch.object(tools_platform, "load_actor", return_value=actor),
        ):
            raw = tools_platform.create_crawl_source(source_name="Docs", confirm=True)
        payload = json.loads(raw)
        assert payload["ok"] is False
        assert payload["code"] == "fields_required"
        assert "cadence" in payload["missing"]
        assert "allowlist_json" in payload["missing"]
        assert "denylist_json" in payload["missing"]
        assert "start_after_create" in payload["missing"]
        fake_db.add.assert_not_called()
    finally:
        from ragsuite_modules.mcp.backend.auth_asgi import _mcp_auth_ctx

        _mcp_auth_ctx.reset(token)


def test_create_crawl_source_full_form_does_not_start():
    import json
    import uuid

    from ragsuite_modules.mcp.backend import tools_platform

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    source_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    token, actor, _uuid = _actor_for(pid)
    fake_db = MagicMock()
    held = {}

    def add(obj):
        held["source"] = obj

    def flush():
        if held.get("source") is not None:
            held["source"].id = source_id

    fake_db.add.side_effect = add
    fake_db.flush.side_effect = flush
    try:
        with (
            patch.object(tools_platform, "_db_session", return_value=fake_db),
            patch.object(tools_platform, "load_actor", return_value=actor),
            patch.object(tools_platform, "require_permission"),
            patch.object(tools_platform, "audit_mcp"),
            patch("app.security_utils.block_ssrf"),
            patch("app.services.crawl_source_embedding.crawl_create_ingest_targets", return_value=["search"]),
            patch("app.services.crawler.get_crawl_content_length_limit", return_value=1000),
            patch(
                "app.services.crawler.DEFAULT_CRAWL_SETTINGS",
                {"max_pages": 10, "max_runtime_minutes": 5, "max_links_per_page": 5, "delay_seconds": 0},
            ),
            patch("app.services.crawl_orchestration.start_crawl_for_source") as start_crawl,
        ):
            raw = tools_platform.create_crawl_source(
                source_name="Docs",
                base_url="https://docs.example.com",
                depth=2,
                cadence="weekly",
                allowlist_json='["/docs"]',
                denylist_json="[]",
                start_after_create=False,
                project_id=str(pid),
                confirm=True,
            )
        payload = json.loads(raw)
        assert payload["ok"] is True
        assert payload["start_after_create"] is False
        assert payload["cadence"] == "WEEKLY"
        assert "not crawling" in payload["note"]
        start_crawl.assert_not_called()
        assert held["source"].allowlist == ["/docs"]
        assert held["source"].denylist == []
    finally:
        from ragsuite_modules.mcp.backend.auth_asgi import _mcp_auth_ctx

        _mcp_auth_ctx.reset(token)


def test_delete_project_requires_confirm():
    import json
    import uuid

    from ragsuite_modules.mcp.backend import tools_platform

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    token, actor, _uuid = _actor_for(pid)
    fake_db = MagicMock()
    try:
        with (
            patch.object(tools_platform, "_db_session", return_value=fake_db),
            patch.object(tools_platform, "load_actor", return_value=actor),
            patch("app.services.project_deletion_service.delete_project_related_rows") as deleter,
        ):
            raw = tools_platform.delete_project(project_id=str(pid), confirm=False)
        payload = json.loads(raw)
        assert payload["ok"] is False
        assert payload["code"] == "confirmation_required"
        assert payload["confirmation_token"]
        assert payload["requires_confirmation"] is True
        deleter.assert_not_called()
    finally:
        from ragsuite_modules.mcp.backend.auth_asgi import _mcp_auth_ctx

        _mcp_auth_ctx.reset(token)


def test_delete_active_project_refused():
    import json
    import uuid

    from ragsuite_modules.mcp.backend import tools_platform

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    token, actor, _uuid = _actor_for(pid)
    project = SimpleNamespace(id=pid, name="Live", is_active=True)
    fake_db = MagicMock()
    fake_db.query.return_value.filter.return_value.first.return_value = project
    try:
        with (
            patch.object(tools_platform, "_db_session", return_value=fake_db),
            patch.object(tools_platform, "load_actor", return_value=actor),
            patch.object(tools_platform, "require_permission"),
            patch("app.services.project_deletion_service.delete_project_related_rows") as deleter,
        ):
            preview = json.loads(tools_platform.delete_project(project_id=str(pid), confirm=True))
            raw = tools_platform.delete_project(
                project_id=str(pid),
                confirm=True,
                confirmation_token=preview["confirmation_token"],
            )
        payload = json.loads(raw)
        assert preview["code"] == "confirmation_required"
        assert payload["ok"] is False
        assert payload["code"] == "active_project"
        deleter.assert_not_called()
    finally:
        from ragsuite_modules.mcp.backend.auth_asgi import _mcp_auth_ctx

        _mcp_auth_ctx.reset(token)


def test_chatbot_settings_rejects_api_key_without_changes():
    import json
    import uuid

    from ragsuite_modules.mcp.backend import tools_platform

    pid = uuid.UUID("11111111-1111-1111-1111-111111111111")
    token, actor, _uuid = _actor_for(pid)
    fake_db = MagicMock()
    try:
        with (
            patch.object(tools_platform, "_db_session", return_value=fake_db),
            patch.object(tools_platform, "load_actor", return_value=actor),
            patch.object(tools_platform, "require_permission"),
        ):
            raw = tools_platform.update_chatbot_settings(
                fields_json='{"api_key":"sk-secret","welcome_message":"Hello"}',
                confirm=True,
            )
        payload = json.loads(raw)
        assert payload["ok"] is False
        assert payload["code"] == "fields_rejected"
        assert "api_key" in payload["rejected"]
        fake_db.commit.assert_not_called()
        fake_db.add.assert_not_called()
    finally:
        from ragsuite_modules.mcp.backend.auth_asgi import _mcp_auth_ctx

        _mcp_auth_ctx.reset(token)
