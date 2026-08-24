from app.routes.widget import infer_embed_surface
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


def test_skips_localhost_and_ip():
    assert build_embed_frame_ancestors(["localhost", "127.0.0.1", "10.0.0.8"]) == SELF_ONLY


def test_infer_embed_surface_from_query_or_path():
    assert infer_embed_surface("search", "/embed/chatbot") == "search"
    assert infer_embed_surface("chatbot", None) == "chat"
    assert infer_embed_surface(None, "/embed/search?projectId=x") == "search"
    assert infer_embed_surface(None, "/embed/chatbot") == "chat"
