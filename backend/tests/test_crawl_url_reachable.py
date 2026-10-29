"""Pre-crawl reachability check treats rate limiting as reachable."""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from app.services.crawler import validate_url_reachable


def _serve(status: int):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            self.send_response(status)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


@pytest.fixture
def allow_loopback_ssrf(monkeypatch):
    """Status-code tests use a loopback server; SSRF rejection is covered separately."""
    monkeypatch.setattr("app.platform.safe_http.block_ssrf", lambda _url: None)


@pytest.mark.parametrize("status,ok", [(200, True), (429, True), (503, True), (404, False), (500, False)])
def test_reachability_by_status(status, ok, allow_loopback_ssrf):
    server = _serve(status)
    try:
        valid, message = validate_url_reachable(f"http://127.0.0.1:{server.server_port}/", timeout=5)
    finally:
        server.shutdown()
    assert valid is ok, message


def test_reachability_rejects_loopback():
    valid, message = validate_url_reachable("http://127.0.0.1/", timeout=2)
    assert valid is False
    assert "restricted" in message.lower()


def _serve_body(status: int, body: bytes):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            self.send_response(status)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def test_reachability_allows_homepage_larger_than_probe_cap(allow_loopback_ssrf):
    server = _serve_body(200, b"<html>" + (b"x" * 20_000) + b"</html>")
    try:
        valid, message = validate_url_reachable(f"http://127.0.0.1:{server.server_port}/", timeout=5)
    finally:
        server.shutdown()
    assert valid is True, message


def test_reachability_still_rejects_large_http_error(allow_loopback_ssrf):
    server = _serve_body(404, b"missing" + (b"y" * 20_000))
    try:
        valid, message = validate_url_reachable(f"http://127.0.0.1:{server.server_port}/", timeout=5)
    finally:
        server.shutdown()
    assert valid is False
    assert "404" in message
