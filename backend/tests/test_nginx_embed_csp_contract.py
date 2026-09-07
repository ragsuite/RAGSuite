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


def test_nginx_embed_forwards_parent_origin_header():
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert "proxy_set_header X-Embed-Parent-Origin $embed_parent;" in text
    assert text.count("proxy_set_header X-Embed-Parent-Origin $embed_parent;") >= 2
