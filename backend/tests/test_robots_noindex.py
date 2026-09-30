"""Every API response tells search engines not to index or follow it."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.db import get_db
from app.main import app


def test_api_responses_carry_noindex_nofollow():
    def _noop_db():
        yield None

    app.dependency_overrides[get_db] = _noop_db
    try:
        client = TestClient(app)
        ok = client.get("/api/v1/widget/embed-frame-policy")
        missing = client.get("/api/v1/definitely-not-a-route")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert ok.status_code == 200
    assert ok.headers.get("x-robots-tag") == "noindex, nofollow"
    assert missing.status_code == 404
    assert missing.headers.get("x-robots-tag") == "noindex, nofollow"
