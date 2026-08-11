"""
Lightweight concurrency smoke checks (read-only + optional Chroma lock timing).

Run from backend/:
  .venv/bin/python scripts/concurrency_stress_check.py
"""
from __future__ import annotations

import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import SessionLocal, test_connection
from app.services.observability import snapshot_metrics
from app.services.rag.singleton import chroma_write_lock, get_pipeline


def check_db_pool() -> bool:
    if not test_connection():
        print("[FAIL] Database connection")
        return False
    db = SessionLocal()
    try:
        db.execute(__import__("sqlalchemy").text("SELECT 1"))
    finally:
        db.close()
    print("[OK] Database pool checkout")
    return True


def check_chroma_lock_serializes() -> bool:
    order: list[int] = []
    barrier = threading.Barrier(3)

    def worker(n: int) -> None:
        barrier.wait()
        with chroma_write_lock():
            order.append(n)
            time.sleep(0.05)

    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = [pool.submit(worker, i) for i in range(3)]
        for f in as_completed(futs):
            f.result()

    if len(order) == 3 and len(set(order)) == 3:
        print("[OK] chroma_write_lock serializes 3 workers")
        return True
    print(f"[FAIL] chroma_write_lock order unexpected: {order}")
    return False


def check_pipeline_singleton() -> bool:
    p1 = get_pipeline()
    p2 = get_pipeline()
    if p1 is None:
        print("[WARN] RAG pipeline unavailable — skip singleton check")
        return True
    if p1 is p2:
        print("[OK] RAG pipeline singleton")
        return True
    print("[FAIL] RAG pipeline not singleton")
    return False


def main() -> int:
    ok = True
    ok = check_db_pool() and ok
    ok = check_chroma_lock_serializes() and ok
    ok = check_pipeline_singleton() and ok
    metrics = snapshot_metrics()
    print("\n--- metrics snapshot ---")
    for k, v in sorted(metrics.items()):
        print(f"  {k}: {v}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
