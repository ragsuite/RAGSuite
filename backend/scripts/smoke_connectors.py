#!/usr/bin/env python3
"""Smoke tests for all five connectors against a running backend (:9090)."""

from __future__ import annotations

import os
import sys
import uuid

import httpx

BASE = os.environ.get("RAGSUITE_API_BASE", "http://localhost:9090/api/v1")
ADMIN_USER = os.environ.get("RAGSUITE_SMOKE_USER", "orgadmin")
ADMIN_PASS = os.environ.get("RAGSUITE_SMOKE_PASS", "TestAdmin123!")


class Check:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0
        self.errors: list[str] = []

    def ok(self, name: str, cond: bool, detail: str = "") -> None:
        if cond:
            self.passed += 1
            print(f"  PASS  {name}")
        else:
            self.failed += 1
            msg = f"  FAIL  {name}" + (f" — {detail}" if detail else "")
            print(msg)
            self.errors.append(msg)

    def summary(self) -> int:
        total = self.passed + self.failed
        print(f"\n{'=' * 50}")
        print(f"Results: {self.passed}/{total} passed, {self.failed} failed")
        if self.errors:
            print("\nFailures:")
            for e in self.errors:
                print(e)
        return 0 if self.failed == 0 else 1


CONNECTORS = {
    "google_drive": {
        "browse": ("/browse", {"parent_id": "root"}),
        "sources": {"folders": [], "files": []},
        "settings": {"cadence_minutes": 30, "max_files": 50, "max_size_mb": 25},
        "redirect_suffix": "/connectors/google_drive/auth/callback",
    },
    "notion": {
        "browse": ("/search", {"query": ""}),
        "sources": {"pages": [], "databases": []},
        "settings": {"cadence_minutes": 30, "max_pages": 50},
        "redirect_suffix": "/connectors/notion/auth/callback",
    },
    "confluence": {
        "browse": ("/spaces", {}),
        "sources": {"spaces": [], "pages": []},
        "settings": {"cadence_minutes": 30, "max_pages": 50},
        "redirect_suffix": "/connectors/confluence/auth/callback",
    },
    "sharepoint": {
        "browse": ("/sites", {"query": "*"}),
        "sources": {"sites": [], "drives": []},
        "settings": {"cadence_minutes": 30, "max_files": 50},
        "redirect_suffix": "/connectors/sharepoint/auth/callback",
    },
    "slack": {
        "browse": ("/channels", {}),
        "sources": {"channels": []},
        "settings": {"cadence_minutes": 30, "max_messages": 100},
        "redirect_suffix": "/connectors/slack/auth/callback",
    },
}


def smoke_connector(
    auth_client: httpx.Client,
    anon_client: httpx.Client,
    check: Check,
    *,
    connector: str,
    project_id: str,
    headers: dict[str, str],
) -> None:
    print(f"\n=== {connector} ===")
    cfg = CONNECTORS[connector]
    prefix = f"/connectors/{connector}"
    redirect_uri = f"http://localhost:9090/api/v1{cfg['redirect_suffix']}"

    # Unauthenticated should be rejected (no cookies/session leakage).
    r = anon_client.get(f"{prefix}/status", params={"project_id": project_id})
    check.ok(f"{connector} GET /status without auth → 401", r.status_code == 401, r.text[:120])

    # Credentials upsert + status.
    r = auth_client.post(
        f"{prefix}/credentials",
        headers=headers,
        json={
            "project_id": project_id,
            "client_id": f"smoke-client-{connector}-abcdefgh",
            "client_secret": f"smoke-secret-{connector}-abcdefghij",
            "redirect_uri": redirect_uri,
        },
    )
    check.ok(
        f"{connector} POST /credentials",
        r.status_code == 200 and r.json().get("configured") is True,
        r.text[:200],
    )

    r = auth_client.get(
        f"{prefix}/credentials/status",
        headers=headers,
        params={"project_id": project_id},
    )
    check.ok(
        f"{connector} GET /credentials/status",
        r.status_code == 200 and r.json().get("configured") is True,
        r.text[:200],
    )

    # Auth start should return a provider authorize URL.
    r = auth_client.get(f"{prefix}/auth/start", headers=headers, params={"project_id": project_id})
    auth_url = r.json().get("auth_url") if r.status_code == 200 else None
    check.ok(
        f"{connector} GET /auth/start → auth_url",
        r.status_code == 200 and isinstance(auth_url, str) and auth_url.startswith("http"),
        r.text[:220],
    )

    # Not connected → null status.
    r = auth_client.get(f"{prefix}/status", headers=headers, params={"project_id": project_id})
    body = r.json() if r.status_code == 200 else None
    check.ok(
        f"{connector} GET /status when disconnected",
        r.status_code == 200 and body is None,
        r.text[:120],
    )

    # Connected-required endpoints should 404.
    browse_path, browse_params = cfg["browse"]
    r = auth_client.get(
        f"{prefix}{browse_path}",
        headers=headers,
        params={"project_id": project_id, **browse_params},
    )
    check.ok(f"{connector} browse while disconnected → 404", r.status_code == 404, r.text[:160])

    r = auth_client.post(
        f"{prefix}/sources",
        headers=headers,
        json={"project_id": project_id, **cfg["sources"]},
    )
    check.ok(f"{connector} POST /sources while disconnected → 404", r.status_code == 404, r.text[:160])

    r = auth_client.post(
        f"{prefix}/settings",
        headers=headers,
        json={"project_id": project_id, "settings": cfg["settings"]},
    )
    check.ok(f"{connector} POST /settings while disconnected → 404", r.status_code == 404, r.text[:160])

    r = auth_client.post(f"{prefix}/sync", headers=headers, params={"project_id": project_id})
    check.ok(f"{connector} POST /sync while disconnected → 404", r.status_code == 404, r.text[:160])

    r = auth_client.get(f"{prefix}/jobs", headers=headers, params={"project_id": project_id})
    check.ok(
        f"{connector} GET /jobs while disconnected → []",
        r.status_code == 200 and r.json() == [],
        r.text[:160],
    )

    r = auth_client.post(f"{prefix}/disconnect", headers=headers, params={"project_id": project_id})
    check.ok(
        f"{connector} POST /disconnect when not connected",
        r.status_code == 200 and "message" in (r.json() or {}),
        r.text[:160],
    )


def main() -> int:
    check = Check()
    # Separate clients so session cookies from login never leak into unauth checks.
    auth_client = httpx.Client(base_url=BASE, timeout=30.0, follow_redirects=False)
    anon_client = httpx.Client(base_url=BASE, timeout=30.0, follow_redirects=False)

    print("=== Health / Login ===")
    r = anon_client.get("/health/ping")
    check.ok("GET /health/ping", r.status_code == 200 and r.json().get("status") == "ok", r.text[:120])

    r = auth_client.post("/crawl/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    check.ok("POST /crawl/auth/login", r.status_code == 200, r.text[:200])
    if r.status_code != 200:
        return check.summary()

    token = r.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}

    # Always create an owned project — connectors require Project.owner_id == current_user.
    name = f"smoke-connectors-{uuid.uuid4().hex[:6]}"
    r = auth_client.post(
        "/projects",
        headers=headers,
        json={"name": name, "description": "connector smoke"},
    )
    check.ok("POST /projects (create smoke project)", r.status_code in (200, 201), r.text[:200])
    if r.status_code not in (200, 201):
        return check.summary()
    project_id = str(r.json().get("id"))
    print(f"Using project_id={project_id}")

    for connector in CONNECTORS:
        smoke_connector(
            auth_client,
            anon_client,
            check,
            connector=connector,
            project_id=project_id,
            headers=headers,
        )

    # OpenAPI should expose all connector prefixes.
    print("\n=== OpenAPI route registration ===")
    openapi_base = BASE.rsplit("/api/v1", 1)[0] or "http://localhost:9090"
    r = httpx.get(f"{openapi_base}/openapi.json", timeout=30.0)
    if r.status_code == 200:
        paths = r.json().get("paths") or {}
        for connector in CONNECTORS:
            expected = f"/api/v1/connectors/{connector}/status"
            check.ok(f"openapi has {expected}", expected in paths)
    else:
        check.ok("openapi.json available", False, f"HTTP {r.status_code}")

    return check.summary()


if __name__ == "__main__":
    sys.exit(main())
