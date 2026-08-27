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


def test_infer_embed_surface_from_query_or_path():
    assert infer_embed_surface("search", "/embed/chatbot") == "search"
    assert infer_embed_surface("chatbot", None) == "chat"
    assert infer_embed_surface(None, "/embed/search?projectId=x") == "search"
    assert infer_embed_surface(None, "/embed/chatbot") == "chat"
