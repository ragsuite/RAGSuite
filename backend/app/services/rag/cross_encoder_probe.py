"""Measure the reranker's per-candidate cost in a short-lived child process.

Importing torch and loading the model costs about 1 GB per API process, and that memory is
not given back when the model is dropped. Measuring in a child keeps it out of the API
processes on hosts too slow to rerank within the budget. The result is shared through
Redis per model and host shape: one process measures while the others wait, and restarts
reuse it.
"""
from __future__ import annotations

import logging
import os
import platform
import re
import subprocess
import sys
import time
from typing import Any, Optional

from ..redis_client import get_redis

logger = logging.getLogger(__name__)

RESULT_TTL_SECONDS = 7 * 24 * 3600
LOCK_SECONDS = 300
CHILD_TIMEOUT_SECONDS = 240
POLL_SECONDS = 2.0
_RESULT_RE = re.compile(r"PAIR_MS=([0-9.]+)")
_CHILD = r"""
import sys, time
from sentence_transformers import CrossEncoder
source, max_length, n = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
model = CrossEncoder(source, device="cpu", max_length=max_length)
passage = " ".join(["product details price specification warranty"] * (max_length // 5))
pairs = [("which model has the longest battery life", passage)] * n
model.predict(pairs[:1], show_progress_bar=False)
started = time.perf_counter()
model.predict(pairs, show_progress_bar=False)
print("PAIR_MS=%.3f" % ((time.perf_counter() - started) * 1000 / n))
"""


def _key(model_id: str, max_length: int) -> str:
    return f"ragsuite:reranker_pair_ms:{model_id}:{max_length}:{platform.machine()}:{os.cpu_count()}"


def _read(client: Any, key: str) -> Optional[float]:
    if client is None:
        return None
    try:
        raw = client.get(key)
        return float(raw) if raw is not None else None
    except Exception:
        return None


def _run_child(source: str, max_length: int, pairs: int) -> Optional[float]:
    try:
        done = subprocess.run(
            [sys.executable, "-c", _CHILD, source, str(max_length), str(pairs)],
            capture_output=True, text=True, timeout=CHILD_TIMEOUT_SECONDS,
            env={**os.environ, "TOKENIZERS_PARALLELISM": "false"},
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning("Reranker probe could not run: %s", exc)
        return None
    found = _RESULT_RE.search(done.stdout or "")
    if not found:
        logger.warning("Reranker probe failed (exit %s): %s", done.returncode, (done.stderr or "")[-300:])
        return None
    return float(found.group(1))


def measure(source: str, model_id: str, max_length: int, pairs: int) -> Optional[float]:
    """Milliseconds per candidate on this host, or None when it could not be measured."""
    client = get_redis()
    key = _key(model_id, max_length)
    known = _read(client, key)
    if known is not None:
        return known
    lock = key + ":lock"
    try:
        owner = client is None or bool(client.set(lock, "1", nx=True, ex=LOCK_SECONDS))
    except Exception:
        owner = True
    if not owner:
        deadline = time.monotonic() + LOCK_SECONDS
        while time.monotonic() < deadline:
            time.sleep(POLL_SECONDS)
            known = _read(client, key)
            if known is not None:
                return known
            try:
                if not client.exists(lock):
                    return _read(client, key)
            except Exception:
                return None
        return None
    try:
        value = _run_child(source, max_length, pairs)
        if value is not None and client is not None:
            client.set(key, f"{value:.3f}", ex=RESULT_TTL_SECONDS)
        return value
    finally:
        if client is not None:
            try:
                client.delete(lock)
            except Exception:
                pass
