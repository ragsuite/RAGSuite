#!/usr/bin/env python3
"""
Verify local env for multi-tenant scaling tests (roadmap Sprints 1–4).

  cd backend && .venv/bin/python scripts/scaling_test_setup.py
  .venv/bin/python scripts/scaling_test_setup.py --seed-org
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal, test_connection
from app.settings import settings


def _check_redis() -> bool:
    try:
        from app.services.redis_client import get_redis

        r = get_redis()
        if r is None:
            print("[WARN] Redis not configured — ENABLE_REDIS_ADMISSION will use DB fallback")
            return True
        r.ping()
        print("[OK] Redis ping")
        return True
    except Exception as exc:
        print(f"[FAIL] Redis: {exc}")
        return False


def _check_chroma_http() -> bool:
    import os

    mode = (os.environ.get("CHROMA_MODE") or "local").lower()
    if mode != "http":
        print("[WARN] CHROMA_MODE is not http — per-collection lock disabled")
        return True
    host = os.environ.get("CHROMA_HOST", "127.0.0.1")
    port = os.environ.get("CHROMA_PORT", "8001")
    try:
        import urllib.error
        import urllib.request

        for path in ("/api/v2/heartbeat", "/api/v1/heartbeat", "/"):
            try:
                urllib.request.urlopen(f"http://{host}:{port}{path}", timeout=3)
                print(f"[OK] Chroma HTTP at {host}:{port}")
                return True
            except urllib.error.HTTPError as exc:
                if exc.code < 500:
                    print(f"[OK] Chroma HTTP at {host}:{port} (reachable)")
                    return True
        print(f"[FAIL] Chroma HTTP not reachable at {host}:{port}")
        return False
    except Exception as exc:
        print(f"[WARN] Chroma HTTP ({host}:{port}): {exc}")
        print("       Start with ./start.sh or: chroma run --host 127.0.0.1 --port 8001 --path rag_db_local")
        return True


def _print_settings() -> None:
    keys = [
        "enable_durable_jobs",
        "run_inline_worker",
        "enable_chroma_per_collection_lock",
        "enable_redis_admission",
        "job_worker_threads",
        "job_worker_crawl_threads",
        "max_concurrent_crawls_per_user",
        "max_concurrent_ingest_per_project",
        "max_queued_ingest_per_project",
        "crawl_ingest_batch_size_jobs",
    ]
    print("\n--- active settings ---")
    for k in keys:
        print(f"  {k} = {getattr(settings, k, '?')}")


def _seed_test_org() -> None:
    from app.models import Organization

    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.slug == "scale_test").first()
        if not org:
            org = Organization(
                id=2,
                name="Scale Test Org",
                slug="scale_test",
                max_queued_ingest_per_project=2,
                max_concurrent_ingest_per_project=1,
            )
            db.add(org)
            db.commit()
            print("[OK] Created org id=2 slug=scale_test (ingest cap=2 queued, 1 concurrent)")
        else:
            org.max_queued_ingest_per_project = 2
            org.max_concurrent_ingest_per_project = 1
            db.commit()
            print("[OK] Updated org scale_test caps for testing")
        print(
            "\nTo test org quotas: UPDATE users SET org_id = 2 WHERE id = <your_test_user_id>;"
        )
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--seed-org",
        action="store_true",
        help="Create/update scale_test org with low ingest caps",
    )
    args = parser.parse_args()

    ok = True
    if not test_connection():
        print("[FAIL] Database")
        ok = False
    else:
        print("[OK] Database")

    ok = _check_redis() and ok
    ok = _check_chroma_http() and ok
    _print_settings()

    if args.seed_org:
        try:
            _seed_test_org()
        except Exception as exc:
            print(f"[FAIL] seed org: {exc}")
            ok = False

    print("\nNext: ./start.sh  (or worker + API separately)")
    print("Guide: docs/scaling-test-setup.md")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
