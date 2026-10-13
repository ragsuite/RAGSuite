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


@pytest.mark.parametrize("status,ok", [(200, True), (429, True), (503, True), (404, False), (500, False)])
def test_reachability_by_status(status, ok):
    server = _serve(status)
    try:
        valid, message = validate_url_reachable(f"http://127.0.0.1:{server.server_port}/", timeout=5)
    finally:
        server.shutdown()
    assert valid is ok, message
