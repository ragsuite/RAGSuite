"""Audit detail route must not shadow sibling static paths such as ``/export``."""
from __future__ import annotations

import uuid

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from app.auth import get_current_user_required
from app.db import get_db
from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()

from ragsuite_modules.audit_basic.backend.routes import router as audit_router  # noqa: E402


class _EmptyQuery:
    def filter(self, *_args):
        return self

    def first(self):
        return None


class _EmptyDb:
    def query(self, *_args):
        return _EmptyQuery()


@pytest.fixture
def client() -> TestClient:
    sibling = APIRouter(prefix="/api/v1/audit-events")

    @sibling.get("/export")
    async def sibling_export():
        return {"route": "export"}

    app = FastAPI()
    app.include_router(audit_router)
    app.include_router(sibling)
    app.dependency_overrides[get_db] = lambda: _EmptyDb()
    app.dependency_overrides[get_current_user_required] = lambda: object()
    return TestClient(app)


def test_export_path_reaches_sibling_route_even_when_registered_later(client):
    response = client.get("/api/v1/audit-events/export")
    assert response.status_code == 200
    assert response.json() == {"route": "export"}


def test_uuid_path_still_reaches_detail_route(client):
    response = client.get(f"/api/v1/audit-events/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Audit event not found"


def test_non_uuid_detail_path_is_not_routed(client):
    response = client.get("/api/v1/audit-events/not-a-uuid")
    assert response.status_code == 404
    assert response.json()["detail"] == "Not Found"
