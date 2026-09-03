from uuid import uuid4
from unittest.mock import MagicMock

from app.routes.widget import _parse_project_id, infer_embed_surface
from app.services.embed_frame_ancestors import (
    LOOPBACK_CSP_SOURCES,
    SELF_ONLY,
    build_embed_frame_ancestors,
)
from app.services.integration_domains import get_domains_for_project


def test_empty_domains_are_self_only():
    assert build_embed_frame_ancestors(None) == SELF_ONLY
    assert build_embed_frame_ancestors([]) == SELF_ONLY


def test_apex_includes_www_https_only():
    policy = build_embed_frame_ancestors(["ragsuite.de"])
    assert policy.startswith("frame-ancestors 'self' ")
    assert "https://ragsuite.de" in policy
    assert "https://www.ragsuite.de" in policy
    assert "http://" not in policy


def test_www_includes_apex():
    policy = build_embed_frame_ancestors(["https://www.kunde.example.de/path"])
    assert "https://www.kunde.example.de" in policy
    assert "https://kunde.example.de" in policy


def test_object_url_and_wildcard():
    policy = build_embed_frame_ancestors(
        [
            {"url": "https://shop.example.de"},
            "*.partner.example.de",
        ]
    )
    assert "https://shop.example.de" in policy
    assert "https://www.shop.example.de" in policy
    assert "https://*.partner.example.de" in policy


def test_normalized_url_and_hostname_objects():
    policy = build_embed_frame_ancestors(
        [
            {
                "normalizedUrl": "https://t3karma-v14.thebetaspace.com/elements/elements-1/accordions/",
            },
        ]
    )
    assert "https://t3karma-v14.thebetaspace.com" in policy
    assert "https://www.t3karma-v14.thebetaspace.com" in policy

    hostname_policy = build_embed_frame_ancestors(
        [{"hostname": "t3karma-v14.thebetaspace.com"}]
    )
    assert "https://t3karma-v14.thebetaspace.com" in hostname_policy


def test_honors_loopback_skips_other_ips():
    policy = build_embed_frame_ancestors(["localhost", "127.0.0.1", "10.0.0.8"])
    for source in LOOPBACK_CSP_SOURCES:
        assert source in policy
    assert "10.0.0.8" not in policy
    assert policy.startswith("frame-ancestors 'self' ")


def test_loopback_with_public_domain():
    policy = build_embed_frame_ancestors(
        ["https://ragsuite.de", "https://localhost//*", "https://127.0.0.1//*"]
    )
    assert "https://ragsuite.de" in policy
    assert "https://www.ragsuite.de" in policy
    for source in LOOPBACK_CSP_SOURCES:
        assert source in policy


def test_by_project_domains_do_not_leak_across_projects():
    project_a = uuid4()
    project_b = uuid4()
    keys = {
        "chatbot_domains": ["https://legacy-all.example"],
        "search_domains": [],
        "by_project": {
            str(project_a): {
                "chatbot_domains": ["https://a.example", "https://localhost//*"],
                "search_domains": [],
            },
            str(project_b): {
                "chatbot_domains": ["https://hospital.example", "https://b.example"],
                "search_domains": [],
            },
        },
    }
    domains_a = get_domains_for_project(keys, project_a, "chatbot")
    domains_b = get_domains_for_project(keys, project_b, "chatbot")
    policy_a = build_embed_frame_ancestors(domains_a)
    policy_b = build_embed_frame_ancestors(domains_b)

    assert "https://a.example" in policy_a
    assert "http://localhost:*" in policy_a
    assert "hospital.example" not in policy_a
    assert "b.example" not in policy_a
    assert "legacy-all.example" not in policy_a

    assert "https://hospital.example" in policy_b
    assert "https://b.example" in policy_b
    assert "a.example" not in policy_b
    assert "localhost" not in policy_b


def test_missing_project_id_parses_as_none():
    assert _parse_project_id(None) is None
    assert _parse_project_id("") is None
    assert _parse_project_id("   ") is None
    assert _parse_project_id("not-a-uuid") is None


def test_embed_frame_policy_missing_project_is_self_only():
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    def _noop_db():
        yield None

    app.dependency_overrides[get_db] = _noop_db
    try:
        client = TestClient(app)
        response = client.get("/api/v1/widget/embed-frame-policy")
        assert response.status_code == 200
        assert response.headers.get("x-embed-csp") == SELF_ONLY

        invalid = client.get(
            "/api/v1/widget/embed-frame-policy",
            headers={"X-Embed-Project-Id": "not-a-uuid"},
        )
        assert invalid.status_code == 200
        assert invalid.headers.get("x-embed-csp") == SELF_ONLY
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_embed_frame_policy_lookup_exception_is_503_not_self_only():
    """Infra blips must 503 so nginx fail-opens; never 200 SELF_ONLY (false deny)."""
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    project_id = uuid4()
    db = MagicMock()

    def _query(_model):
        chain = MagicMock()
        chain.filter.return_value.first.side_effect = RuntimeError("db blip")
        return chain

    db.query.side_effect = _query

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get(
            "/api/v1/widget/embed-frame-policy",
            params={"project_id": str(project_id), "surface": "chat"},
        )
        assert response.status_code == 503
        assert response.headers.get("x-embed-csp") != SELF_ONLY
        # Body may be FastAPI HTTPException detail — must not look like a deny policy.
        assert SELF_ONLY not in (response.headers.get("x-embed-csp") or "")
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_embed_frame_policy_unknown_project_is_self_only():
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    project_id = uuid4()
    db = MagicMock()

    def _query(_model):
        chain = MagicMock()
        chain.filter.return_value.first.return_value = None
        return chain

    db.query.side_effect = _query

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        response = client.get(
            "/api/v1/widget/embed-frame-policy",
            params={"project_id": str(project_id)},
        )
        assert response.status_code == 200
        assert response.headers.get("x-embed-csp") == SELF_ONLY
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_embed_frame_policy_endpoint_uses_per_project_domains():
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    project_a = uuid4()
    project_b = uuid4()
    project = MagicMock()
    project.id = project_a
    project.owner_id = 42

    embed_config = MagicMock()
    embed_config.keys = {
        "chatbot_domains": ["https://legacy-all.example"],
        "search_domains": [],
        "by_project": {
            str(project_a): {
                "chatbot_domains": ["https://a.example"],
                "search_domains": [],
            },
            str(project_b): {
                "chatbot_domains": ["https://hospital.example"],
                "search_domains": [],
            },
        },
    }

    db = MagicMock()

    def _query(model):
        chain = MagicMock()
        if model.__name__ == "Project":
            chain.filter.return_value.first.return_value = project
        else:
            chain.filter.return_value.first.return_value = embed_config
        return chain

    db.query.side_effect = _query

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        response = client.get(
            "/api/v1/widget/embed-frame-policy",
            params={"project_id": str(project_a), "surface": "chat"},
        )
        assert response.status_code == 200
        policy = response.headers.get("x-embed-csp") or ""
        assert "https://a.example" in policy
        assert "hospital.example" not in policy
        assert "legacy-all.example" not in policy
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_parse_parent_origin_rejects_junk():
    from app.services.embed_frame_ancestors import parse_parent_origin

    assert parse_parent_origin(None) is None
    assert parse_parent_origin("") is None
    assert parse_parent_origin("javascript:alert(1)") is None
    assert parse_parent_origin("not-a-url") is None
    assert parse_parent_origin("ftp://files.example") is None
    assert parse_parent_origin("https://user:pass@evil.example") is None
    assert parse_parent_origin("https://staging.accesstive.com") == "https://staging.accesstive.com"
    assert parse_parent_origin("https://Staging.Accesstive.com/path") == "https://staging.accesstive.com"


def test_parent_on_allowlist_csp_is_narrow():
    from app.services.embed_frame_ancestors import build_embed_frame_ancestors_for_parent

    domains = [
        "https://staging.accesstive.com",
        "https://staging.t3planet.de",
        "https://ragsuite.de",
    ]
    policy = build_embed_frame_ancestors_for_parent(
        domains, "https://staging.accesstive.com"
    )
    assert policy == "frame-ancestors 'self' https://staging.accesstive.com"
    assert "t3planet" not in policy
    assert "ragsuite" not in policy


def test_parent_not_on_allowlist_is_self_only():
    from app.services.embed_frame_ancestors import build_embed_frame_ancestors_for_parent

    policy = build_embed_frame_ancestors_for_parent(
        ["https://staging.accesstive.com"],
        "https://evil.example",
    )
    assert policy == SELF_ONLY


def test_missing_parent_uses_full_allowlist_legacy():
    """Helper for narrow CSP; route uses full list when parent unresolved."""
    from app.services.embed_frame_ancestors import build_embed_frame_ancestors_for_parent

    domains = ["https://a.example", "https://b.example"]
    full = build_embed_frame_ancestors(domains)
    assert "https://a.example" in full
    assert "https://b.example" in full
    # Unusable parent → SELF_ONLY at helper; route skips helper when unresolved.
    assert build_embed_frame_ancestors_for_parent(domains, None) == SELF_ONLY
    assert build_embed_frame_ancestors_for_parent(domains, "javascript:x") == SELF_ONLY


def test_parent_www_apex_and_wildcard_match():
    from app.services.embed_frame_ancestors import (
        build_embed_frame_ancestors_for_parent,
        parent_allowed_for_domains,
    )

    assert parent_allowed_for_domains(
        "https://www.ragsuite.de", ["https://ragsuite.de"]
    )
    assert parent_allowed_for_domains(
        "https://ragsuite.de", ["https://www.ragsuite.de"]
    )
    assert parent_allowed_for_domains(
        "https://foo.partner.example.de", ["*.partner.example.de"]
    )
    assert not parent_allowed_for_domains(
        "https://partner.example.de", ["*.partner.example.de"]
    )
    loopback = build_embed_frame_ancestors_for_parent(
        ["localhost"], "http://localhost:3000"
    )
    for source in LOOPBACK_CSP_SOURCES:
        assert source in loopback


def test_parent_origin_from_embed_path():
    from app.services.embed_frame_ancestors import parent_origin_from_embed_path

    assert (
        parent_origin_from_embed_path(
            "/embed/chatbot?projectId=x&parentOrigin=https%3A%2F%2Fstaging.accesstive.com"
        )
        == "https://staging.accesstive.com"
    )
    assert parent_origin_from_embed_path("/embed/search?projectId=x") is None


def test_embed_frame_policy_narrows_via_x_original_uri():
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    project_id = uuid4()
    project = MagicMock()
    project.id = project_id
    project.owner_id = 7

    embed_config = MagicMock()
    embed_config.keys = {
        "chatbot_domains": [],
        "search_domains": [],
        "by_project": {
            str(project_id): {
                "chatbot_domains": [
                    "https://staging.accesstive.com",
                    "https://staging.t3planet.de",
                    "https://ragsuite.de",
                ],
                "search_domains": [],
            },
        },
    }

    db = MagicMock()

    def _query(model):
        chain = MagicMock()
        if model.__name__ == "Project":
            chain.filter.return_value.first.return_value = project
        else:
            chain.filter.return_value.first.return_value = embed_config
        return chain

    db.query.side_effect = _query

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    try:
        client = TestClient(app)
        # Narrow: parent on allowlist via X-Original-URI query
        narrow = client.get(
            "/api/v1/widget/embed-frame-policy",
            params={"project_id": str(project_id), "surface": "chat"},
            headers={
                "X-Original-URI": (
                    f"/embed/chatbot?projectId={project_id}"
                    "&parentOrigin=https%3A%2F%2Fstaging.accesstive.com"
                ),
            },
        )
        assert narrow.status_code == 200
        policy = narrow.headers.get("x-embed-csp") or ""
        assert policy == "frame-ancestors 'self' https://staging.accesstive.com"
        assert "t3planet" not in policy
        assert "ragsuite" not in policy

        # Deny: parent present but not allowed
        denied = client.get(
            "/api/v1/widget/embed-frame-policy",
            params={"project_id": str(project_id), "surface": "chat"},
            headers={
                "X-Original-URI": (
                    f"/embed/chatbot?projectId={project_id}"
                    "&parentOrigin=https%3A%2F%2Fevil.example"
                ),
            },
        )
        assert denied.status_code == 200
        assert denied.headers.get("x-embed-csp") == SELF_ONLY

        # Legacy: no parent → full allowlist
        legacy = client.get(
            "/api/v1/widget/embed-frame-policy",
            params={"project_id": str(project_id), "surface": "chat"},
            headers={"X-Original-URI": f"/embed/chatbot?projectId={project_id}"},
        )
        assert legacy.status_code == 200
        legacy_policy = legacy.headers.get("x-embed-csp") or ""
        assert "https://staging.accesstive.com" in legacy_policy
        assert "https://staging.t3planet.de" in legacy_policy
        assert "https://ragsuite.de" in legacy_policy
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_infer_embed_surface_from_query_or_path():
    assert infer_embed_surface("search", "/embed/chatbot") == "search"
    assert infer_embed_surface("chatbot", None) == "chat"
    assert infer_embed_surface(None, "/embed/search?projectId=x") == "search"
    assert infer_embed_surface(None, "/embed/chatbot") == "chat"
