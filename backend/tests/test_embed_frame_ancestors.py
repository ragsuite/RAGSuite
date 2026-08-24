from app.routes.widget import _parse_project_id, infer_embed_surface
from app.services.embed_frame_ancestors import SELF_ONLY, build_embed_frame_ancestors


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


def test_skips_localhost_and_ip():
    assert build_embed_frame_ancestors(["localhost", "127.0.0.1", "10.0.0.8"]) == SELF_ONLY


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


def test_infer_embed_surface_from_query_or_path():
    assert infer_embed_surface("search", "/embed/chatbot") == "search"
    assert infer_embed_surface("chatbot", None) == "chat"
    assert infer_embed_surface(None, "/embed/search?projectId=x") == "search"
    assert infer_embed_surface(None, "/embed/chatbot") == "chat"
