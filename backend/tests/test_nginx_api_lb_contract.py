"""Nginx /api load-balancer contract (UI/embed unchanged; workers never public)."""
from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
NGINX_CONF = REPO_ROOT / "docker" / "nginx.conf"
API_PROXY = REPO_ROOT / "docker" / "nginx-api-proxy.conf"
DOCKERFILE = REPO_ROOT / "docker" / "frontend.Dockerfile"


def test_upstream_api_points_at_backend_only():
    text = NGINX_CONF.read_text(encoding="utf-8")
    resolver = (REPO_ROOT / "docker" / "nginx-docker-resolver.conf").read_text(encoding="utf-8")
    assert "resolver 127.0.0.11" in resolver
    assert "backend:8000" in text
    assert "set $api_upstream backend:8000;" in text
    assert "proxy_pass http://$api_upstream;" in text
    assert "worker" not in text.lower() or "Workers are never listed" in text


def test_web_location_api_and_public_9090_listener():
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert "location /api/" in text
    assert "listen 9090;" in text
    assert "proxy_pass http://$api_upstream;" in text
    assert "proxy_pass http://backend:8000" not in text
    assert "proxy_pass http://api;" not in text


def test_sse_and_upload_proxy_settings():
    snippet = API_PROXY.read_text(encoding="utf-8")
    assert "proxy_buffering off;" in snippet
    assert "proxy_http_version 1.1;" in snippet
    assert "client_max_body_size 1024m;" in snippet
    assert "proxy_read_timeout 3600s;" in snippet
    dockerfile = DOCKERFILE.read_text(encoding="utf-8")
    assert "nginx-api-proxy.conf" in dockerfile
    assert "nginx-docker-resolver.conf" in dockerfile
    assert "EXPOSE 80 9090" in dockerfile


def test_embed_policy_uses_api_upstream():
    text = NGINX_CONF.read_text(encoding="utf-8")
    assert (
        "proxy_pass http://$api_upstream/api/v1/widget/embed-frame-policy?project_id=$embed_project&surface=search;"
        in text
    )
    assert (
        "proxy_pass http://$api_upstream/api/v1/widget/embed-frame-policy?project_id=$embed_project&surface=chat;"
        in text
    )
    assert "docker-resolver.conf" in text or "include /etc/nginx/snippets/docker-resolver.conf;" in text
