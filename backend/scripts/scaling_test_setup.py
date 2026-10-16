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


def _check_vector_store() -> bool:
    try:
        from app.services.rag.vector_store.health import vector_store_status

        status = vector_store_status(include_counts=False)
    except Exception as exc:
        print(f"[FAIL] Vector store (pgvector): {exc}")
        return False
    if not status.get("healthy"):
        print(f"[FAIL] Vector store (pgvector): {status.get('message', 'unhealthy')}")
        return False
    print(f"[OK] Vector store (pgvector {status.get('pgvector_version')})")
    return True


def _print_settings() -> None:
    keys = [
        "enable_durable_jobs",
        "run_inline_worker",
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
    ok = _check_vector_store() and ok
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
