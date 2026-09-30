"""Contract tests for Docker nginx embed CSP fail-open / wipe guards."""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
NGINX_CONF = REPO_ROOT / "docker" / "nginx.conf"
NGINX_CSP_MAP = REPO_ROOT / "docker" / "nginx-embed-csp-map.conf"


def test_nginx_embed_csp_map_fail_open_on_empty_upstream():
    text = NGINX_CSP_MAP.read_text(encoding="utf-8")
    assert "map $embed_csp_upstream $embed_csp" in text
    assert '""' in text and "frame-ancestors *" in text
    assert "default $embed_csp_upstream" in text


def test_nginx_embed_concat_capture_includes_snake_case():
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert (
        'set $embed_project "${arg_projectid}${arg_project_id}${embed_project}";'
        in text
    )
    assert (
        'set $embed_parent "${arg_parentorigin}${arg_parent_origin}${embed_parent}";'
        in text
    )
    # Official loaders use camelCase; snake_case is defense in depth.
    assert text.count(
        'set $embed_project "${arg_projectid}${arg_project_id}${embed_project}";'
    ) >= 3


def test_nginx_embed_forbids_plain_project_arg_wipe():
    text = NGINX_CONF.read_text(encoding="utf-8")
    # Strip comments so historical notes mentioning the bad pattern do not fail.
    code = "\n".join(
        line for line in text.splitlines() if not line.lstrip().startswith("#")
    )
    assert "set $embed_project $arg_projectid;" not in code
    assert "set $embed_parent $arg_parentorigin;" not in code


def test_nginx_embed_uses_upstream_var_then_mapped_csp():
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert "auth_request_set $embed_csp_upstream $upstream_http_x_embed_csp;" in text
    assert "add_header Content-Security-Policy $embed_csp always;" in text
    # Must not assign auth_request_set directly onto $embed_csp (bypasses empty map).
    assert "auth_request_set $embed_csp $upstream_http_x_embed_csp;" not in text


def test_nginx_embed_without_policy_fail_open():
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert "location @embed_without_policy" in text
    assert 'add_header Content-Security-Policy "frame-ancestors *" always;' in text


def test_nginx_embed_auth_request_has_no_args_suffix():
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert "auth_request /internal/embed-policy-search;" in text
    assert "auth_request /internal/embed-policy-chat;" in text
    assert not re.search(r"auth_request\s+/internal/embed-policy[^;]*\?\$args", text)


NGINX_ROBOTS = REPO_ROOT / "docker" / "nginx-robots-noindex.conf"
FRONTEND_DOCKERFILE = REPO_ROOT / "docker" / "frontend.Dockerfile"
ROBOTS_INCLUDE = "include /etc/nginx/snippets/robots-noindex.conf;"


def _location_blocks(text: str) -> list[tuple[str, str]]:
    """(header, body) for each top-level location block in the server config."""
    blocks = []
    for match in re.finditer(r"^\s*location\s+([^{]+)\{", text, re.M):
        depth, i = 1, match.end()
        while depth and i < len(text):
            depth += {"{": 1, "}": -1}.get(text[i], 0)
            i += 1
        blocks.append((match.group(1).strip(), text[match.end() : i - 1]))
    return blocks


def test_robots_noindex_snippet_and_dockerfile_copy():
    assert 'add_header X-Robots-Tag "noindex, nofollow" always;' in NGINX_ROBOTS.read_text(encoding="utf-8")
    dockerfile = FRONTEND_DOCKERFILE.read_text(encoding="utf-8")
    assert "COPY docker/nginx-robots-noindex.conf /etc/nginx/snippets/robots-noindex.conf" in dockerfile


def test_robots_noindex_included_at_server_level_and_every_add_header_location():
    text = NGINX_CONF.read_text(encoding="utf-8")
    server_level = text.split("location", 1)[0]
    assert ROBOTS_INCLUDE in server_level
    missing = [
        header
        for header, body in _location_blocks(text)
        if re.search(r"^\s*add_header\b", body, re.M) and ROBOTS_INCLUDE not in body
    ]
    assert missing == []


def test_nginx_embed_forwards_parent_origin_header():
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert "proxy_set_header X-Embed-Parent-Origin $embed_parent;" in text
    assert text.count("proxy_set_header X-Embed-Parent-Origin $embed_parent;") >= 2
