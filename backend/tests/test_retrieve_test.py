"""POST /api/v1/search/retrieve-test — no LLM, admin JWT."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.auth import get_current_user_required
from app.db import get_db
from app.main import app


def test_retrieve_test_unauth_401():
    client = TestClient(app)
    response = client.post("/api/v1/search/retrieve-test", json={"query": "hello", "surface": "chat"})
    assert response.status_code == 401


def test_retrieve_test_empty_query_422():
    user = SimpleNamespace(id=1)

    def _user():
        return user

    def _db():
        yield MagicMock()

    app.dependency_overrides[get_current_user_required] = _user
    app.dependency_overrides[get_db] = _db
    try:
        client = TestClient(app)
        response = client.post("/api/v1/search/retrieve-test", json={"query": "", "surface": "chat"})
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user_required, None)
        app.dependency_overrides.pop(get_db, None)


def test_retrieve_test_hits_capped_at_top_k():
    user = SimpleNamespace(id=1)
    project = SimpleNamespace(id="11111111-1111-1111-1111-111111111111")

    def _user():
        return user

    def _db():
        yield MagicMock()

    payload = {
        "results": [
            {"text": f"chunk {i}", "score": 90 - i, "rank": i + 1, "metadata": {"title": "T", "url": "https://x.test"}}
            for i in range(12)
        ]
    }

    app.dependency_overrides[get_current_user_required] = _user
    app.dependency_overrides[get_db] = _db
    try:
        with patch(
            "app.routes.search_models._resolve_project_for_search_models",
            return_value=project,
        ), patch(
            "app.services.retrieve_test.resolve_for_project",
            return_value=("openai", "text-embedding-3-small", "k"),
        ), patch(
            "app.services.retrieve_test.read_project_chatbot_settings",
            return_value=SimpleNamespace(
                chat_top_k=5,
                chat_similarity_threshold=0.45,
                chat_threshold_preset="balanced",
                chat_use_reranker=False,
                chat_rerank_candidates=64,
            ),
        ), patch(
            "app.services.retrieve_test.get_pipeline",
        ) as get_pipeline:
            pipeline = MagicMock()
            pipeline.retrieve_only.return_value = payload
            get_pipeline.return_value = pipeline
            client = TestClient(app)
            response = client.post(
                "/api/v1/search/retrieve-test",
                json={"query": "warranty", "surface": "chat"},
            )
        assert response.status_code == 200
        body = response.json()
        hits = body.get("hits") or body.get("data", {}).get("hits") or body["hits"]
        assert len(hits) <= 5
        assert all("preview" in hit and "score" in hit for hit in hits)
        pipeline.retrieve_only.assert_called_once()
        assert pipeline.retrieve_only.call_args.kwargs["top_k"] == 5
    finally:
        app.dependency_overrides.pop(get_current_user_required, None)
        app.dependency_overrides.pop(get_db, None)
