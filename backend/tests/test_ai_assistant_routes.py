"""Admin Assistant HTTP routes must be mounted (401 without auth, never unmatched 404)."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.platform.extension_loader import load_extensions, loaded_extension_ids
from app.platform.module_loader import reset_registry, skipped_extensions

_BOOTSTRAP_PATHS = (
    "/api/v1/ai-assistant/capabilities",
    "/api/v1/ai-assistant/settings",
    "/api/v1/ai-assistant/sessions",
)


def test_ai_assistant_bootstrap_routes_are_mounted():
    reset_registry()
    try:
        app = FastAPI()
        load_extensions(app)
        assert "ai_assistant" in loaded_extension_ids(), skipped_extensions().get("ai_assistant")
        client = TestClient(app)
        for path in _BOOTSTRAP_PATHS:
            response = client.get(path, params={"project_id": "11111111-1111-1111-1111-111111111111"})
            assert response.status_code != 404, f"{path} must be registered"
            assert response.status_code in (401, 403), f"{path} unexpected {response.status_code}: {response.text}"
    finally:
        reset_registry()
