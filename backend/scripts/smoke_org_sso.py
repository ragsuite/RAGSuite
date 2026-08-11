#!/usr/bin/env python3
"""Smoke/integration tests for Organization + SSO endpoints against running backend."""

from __future__ import annotations

import json
import sys
import uuid

import httpx

BASE = "http://localhost:9090/api/v1"
ADMIN_USER = "orgadmin"
ADMIN_PASS = "TestAdmin123!"


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
        print(f"\n{'='*50}")
        print(f"Results: {self.passed}/{total} passed, {self.failed} failed")
        if self.errors:
            print("\nFailures:")
            for e in self.errors:
                print(e)
        return 0 if self.failed == 0 else 1


def main() -> int:
    c = Check()
    client = httpx.Client(base_url=BASE, timeout=30.0, follow_redirects=False)

    print("=== Public / Auth guards ===")

    r = client.get("/health/ping")
    c.ok("GET /health/ping", r.status_code == 200 and r.json().get("status") == "ok")

    r = client.get("/crawl/auth/public-config")
    c.ok("GET /crawl/auth/public-config", r.status_code == 200)
    cfg = r.json()
    c.ok("public-config registration_enabled=false", cfg.get("registration_enabled") is False)

    r = client.get("/org")
    c.ok("GET /org without auth → 401", r.status_code == 401)

    r = client.post("/crawl/auth/register", json={
        "username": f"hack_{uuid.uuid4().hex[:6]}",
        "email": f"hack_{uuid.uuid4().hex[:6]}@example.com",
        "password": "password123",
    })
    c.ok("POST /crawl/auth/register → 403", r.status_code == 403)

    r = client.get("/auth/sso/discover", params={"email": "nobody@example.com"})
    c.ok("GET /auth/sso/discover (SSO off)", r.status_code == 200)
    c.ok("discover sso_enabled=false when global off", r.json().get("sso_enabled") is False)

    r = client.get("/auth/sso/start", params={"org_slug": "default"})
    c.ok("GET /auth/sso/start when global off → 404", r.status_code == 404)

    print("\n=== Login ===")
    r = client.post("/crawl/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    c.ok("POST /crawl/auth/login", r.status_code == 200, r.text[:200])
    token = r.json().get("access_token") if r.status_code == 200 else None
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    print("\n=== Organization endpoints (org admin) ===")

    r = client.get("/org", headers=headers)
    c.ok("GET /org", r.status_code == 200, r.text[:200])
    org = r.json() if r.status_code == 200 else {}

    r = client.put("/org", headers=headers, json={"name": org.get("name", "Default")})
    c.ok("PUT /org", r.status_code == 200, r.text[:200])

    r = client.get("/org/users", headers=headers)
    c.ok("GET /org/users", r.status_code == 200)
    users = r.json().get("users", []) if r.status_code == 200 else []

    member_username = f"member_{uuid.uuid4().hex[:6]}"
    member_email = f"{member_username}@acme.com"
    r = client.post("/org/users", headers=headers, json={
        "username": member_username,
        "email": member_email,
        "role": "member",
        "temporary_password": "TempPass123!",
        "project_assignments": [],
    })
    c.ok("POST /org/users (member)", r.status_code == 201, r.text[:300])
    new_member_id = r.json().get("id") if r.status_code == 201 else None

    r = client.post("/org/users", headers=headers, json={
        "username": f"adminhack_{uuid.uuid4().hex[:6]}",
        "email": f"adminhack_{uuid.uuid4().hex[:6]}@acme.com",
        "role": "org_admin",
        "temporary_password": "TempPass123!",
    })
    c.ok("POST /org/users can create another org_admin", r.status_code == 201)

    if new_member_id:
        r = client.patch(f"/org/users/{new_member_id}", headers=headers, json={"job_title": "QA"})
        c.ok(f"PATCH /org/users/{new_member_id}", r.status_code == 200)

        r = client.get(f"/org/users/{new_member_id}/projects", headers=headers)
        c.ok(f"GET /org/users/{new_member_id}/projects", r.status_code == 200)

        r = client.put(f"/org/users/{new_member_id}/projects", headers=headers, json={
            "user_id": new_member_id,
            "assignments": [],
        })
        c.ok(f"PUT /org/users/{new_member_id}/projects", r.status_code == 200)

    r = client.get("/org/projects", headers=headers)
    c.ok("GET /org/projects", r.status_code == 200)

    r = client.post("/org/projects", headers=headers, json={"name": f"Org Project {uuid.uuid4().hex[:4]}"})
    c.ok("POST /org/projects", r.status_code == 201, r.text[:200])

    print("\n=== SSO admin endpoints ===")

    r = client.get("/org/sso", headers=headers)
    c.ok("GET /org/sso", r.status_code == 200)

    r = client.put("/org/sso", headers=headers, json={
        "enabled": False,
        "client_id": "test-google-client-id",
        "client_secret": "test-google-client-secret",
        "email_domains": ["acme.com"],
    })
    c.ok("PUT /org/sso", r.status_code == 200, r.text[:300])
    c.ok("PUT /org/sso stores config", r.status_code == 200 and r.json().get("client_id") == "test-google-client-id")

    r = client.post("/org/sso/test", headers=headers)
    c.ok("POST /org/sso/test", r.status_code == 200)

    r = client.put("/org/sso", headers=headers, json={
        "enabled": True,
        "client_id": "test-google-client-id",
        "client_secret": "test-google-client-secret",
        "email_domains": ["acme.com"],
    })
    c.ok("PUT /org/sso enable", r.status_code == 200)
    c.ok("sso still off in public-config without SSO_ENABLED env", client.get("/crawl/auth/public-config").json().get("sso_enabled") is False)

    print("\n=== Member cannot access admin routes ===")
    if new_member_id:
        mr = client.post("/crawl/auth/login", json={"username": member_username, "password": "TempPass123!"})
        member_token = mr.json().get("access_token") if mr.status_code == 200 else None
        if member_token:
            mh = {"Authorization": f"Bearer {member_token}"}
            r = client.get("/org", headers=mh)
            c.ok("GET /org as member", r.status_code == 200)
            r = client.get("/org/users", headers=mh)
            c.ok("GET /org/users as member → 403", r.status_code == 403)
            r = client.get("/org/sso", headers=mh)
            c.ok("GET /org/sso as member → 403", r.status_code == 403)

    print("\n=== Projects ACL ===")
    r = client.get("/projects", headers=headers)
    c.ok("GET /projects as org admin", r.status_code == 200)

    client.close()
    return c.summary()


if __name__ == "__main__":
    sys.exit(main())
