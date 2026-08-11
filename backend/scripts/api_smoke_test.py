#!/usr/bin/env python3
"""
Smoke-test all FastAPI operations from the OpenAPI schema.

Usage (from backend/):
  .venv/bin/python scripts/api_smoke_test.py
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

# backend/ on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from starlette.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PUBLIC_PATH_PREFIXES = (
    "/api/v1/health",
    "/api/v1/crawl/auth/",
    "/docs",
    "/openapi.json",
    "/redoc",
)
PUBLIC_EXACT = {"/"}
SKIP_METHODS = {"options", "head", "trace"}
PLACEHOLDER = "00000000-0000-0000-0000-000000000001"
INT_PLACEHOLDER = "1"


@dataclass
class OpResult:
    method: str
    path: str
    status: int
    category: str
    detail: str | None = None


def _fill_path(path: str) -> str:
    return re.sub(r"\{[^}]+\}", PLACEHOLDER, path)


def _is_public(path: str) -> bool:
    if path in PUBLIC_EXACT:
        return True
    return any(path.startswith(p) for p in PUBLIC_PATH_PREFIXES)


def _category(status: int, path: str, is_public: bool) -> str:
    if status >= 500:
        return "server_error"
    if is_public:
        if 200 <= status < 300:
            return "public_ok"
        if status in (404, 405):
            return "public_not_found"
        return "public_unexpected"
    if status in (401, 403):
        return "auth_required"
    if status == 422:
        return "validation"
    if status in (400, 404, 405, 409, 429):
        return "client_error"
    if 200 <= status < 300:
        return "unexpected_success"
    return "other"


def _minimal_body(method: str, path: str) -> Any:
    if method not in ("post", "put", "patch"):
        return None
    if "auth/login" in path:
        return {"username": "nonexistent_user", "password": "wrong-password-123"}
    if "auth/register" in path:
        return {
            "username": "smoke_test_user_x",
            "email": "smoke_test_x@example.invalid",
            "password": "SmokeTest123!x",
        }
    if "auth/verify-email" in path:
        return {"email": "smoke_test_x@example.invalid", "otp": "000000"}
    if "auth/resend-verification" in path:
        return {"email": "smoke_test_x@example.invalid"}
    return {}


def run_smoke() -> dict[str, Any]:
    client = TestClient(app, raise_server_exceptions=False)
    schema = app.openapi()
    paths = schema.get("paths", {})
    results: list[OpResult] = []

    for path, ops in sorted(paths.items()):
        url = _fill_path(path)
        is_public = _is_public(path)
        for method, spec in ops.items():
            m = method.lower()
            if m in SKIP_METHODS:
                continue
            body = _minimal_body(m, path)
            kwargs: dict[str, Any] = {}
            if body is not None:
                kwargs["json"] = body
            if "{project_id}" in path or "{project_uuid}" in path:
                url = url.replace(PLACEHOLDER, INT_PLACEHOLDER)
            response = getattr(client, m)(url, **kwargs)
            cat = _category(response.status_code, path, is_public)
            detail = None
            try:
                data = response.json()
                if isinstance(data, dict) and "detail" in data:
                    d = data["detail"]
                    detail = d if isinstance(d, str) else str(d)[:200]
            except Exception:
                detail = (response.text or "")[:200] or None
            results.append(
                OpResult(
                    method=m.upper(),
                    path=path,
                    status=response.status_code,
                    category=cat,
                    detail=detail,
                )
            )

    by_cat: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        by_cat[r.category].append(asdict(r))

    return {
        "total_operations": len(results),
        "summary": {k: len(v) for k, v in sorted(by_cat.items())},
        "by_category": dict(by_cat),
        "server_errors": by_cat.get("server_error", []),
        "public_unexpected": by_cat.get("public_unexpected", []),
    }


def main() -> int:
    report = run_smoke()
    out_path = Path(__file__).resolve().parents[1] / "api_smoke_report.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"summary": report["summary"], "total": report["total_operations"]}, indent=2))
    print(f"\nFull report: {out_path}")
    if report["server_errors"]:
        print(f"\nServer errors ({len(report['server_errors'])}):")
        for item in report["server_errors"][:25]:
            print(f"  {item['method']} {item['path']} -> {item['status']}")
        if len(report["server_errors"]) > 25:
            print(f"  ... and {len(report['server_errors']) - 25} more")
    return 1 if report["server_errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
