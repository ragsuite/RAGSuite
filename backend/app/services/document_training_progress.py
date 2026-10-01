"""
Per-document training progress shared between ingest workers and the Documents API.

Workers (upload ingest, retrain/reindex) write a small record per document while it is
queued, read, embedded and saved; ``GET /documents`` reads them back so the UI can show a
progress bar with an ETA. Records live in Redis because the worker and API are separate
processes. Without Redis an in-process dict is used, which only helps single-process
deploys; progress is then simply absent across processes — training itself is unaffected.

Every write is best-effort: progress reporting must never fail or slow an ingest.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any, Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)

KEY_PREFIX = "ragsuite:doc_training:"
ACTIVE_TTL_SECONDS = 2 * 60 * 60
QUEUED_TTL_SECONDS = 12 * 60 * 60
WRITE_INTERVAL_SECONDS = 1.0
MIN_ETA_FRACTION = 0.02
# Longer than the embed rate-limit retry cap so slow-but-alive runs keep their bar.
STALE_ACTIVE_SECONDS = 20 * 60

MODE_TRAIN = "train"
MODE_RETRAIN = "retrain"

STAGE_QUEUED = "queued"
STAGE_READING = "reading"
STAGE_TRAINING = "training"
STAGE_SAVING = "saving"

_PERCENT_READING = 3
_PERCENT_TRAINING_FLOOR = 5
_PERCENT_TRAINING_SPAN = 92
_PERCENT_CEILING = 99

_memory: Dict[str, tuple[float, Dict[str, Any]]] = {}
_memory_lock = threading.Lock()


def _redis():
    try:
        from .redis_client import get_redis

        return get_redis()
    except Exception:
        return None


def _key(document_id: str) -> str:
    return f"{KEY_PREFIX}{str(document_id).lower()}"


def _write(document_id: str, record: Dict[str, Any], ttl: int) -> None:
    client = _redis()
    if client is not None:
        try:
            client.set(_key(document_id), json.dumps(record), ex=ttl)
            return
        except Exception as exc:
            logger.debug("Training progress write failed for %s: %s", document_id, exc)
    with _memory_lock:
        _memory[_key(document_id)] = (time.time() + ttl, record)


def _read_many(document_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not document_ids:
        return {}
    keys = [_key(doc_id) for doc_id in document_ids]
    raw_values: List[Optional[str]] = []
    client = _redis()
    if client is not None:
        try:
            raw_values = list(client.mget(keys))
        except Exception as exc:
            logger.debug("Training progress read failed: %s", exc)
            raw_values = []
    found: Dict[str, Dict[str, Any]] = {}
    for doc_id, raw in zip(document_ids, raw_values):
        if not raw:
            continue
        try:
            found[doc_id] = json.loads(raw)
        except (TypeError, ValueError):
            continue
    if len(found) < len(document_ids):
        now = time.time()
        with _memory_lock:
            for doc_id, key in zip(document_ids, keys):
                if doc_id in found:
                    continue
                entry = _memory.get(key)
                if entry is None:
                    continue
                expires_at, record = entry
                if expires_at < now:
                    _memory.pop(key, None)
                    continue
                found[doc_id] = record
    return found


def clear(document_id: str) -> None:
    client = _redis()
    if client is not None:
        try:
            client.delete(_key(document_id))
        except Exception as exc:
            logger.debug("Training progress clear failed for %s: %s", document_id, exc)
    with _memory_lock:
        _memory.pop(_key(document_id), None)


def mark_queued(document_ids: Iterable[str], *, mode: str) -> None:
    """Show documents as waiting for a worker (retrain jobs can sit behind other work)."""
    now = time.time()
    for doc_id in document_ids:
        if not doc_id:
            continue
        _write(
            str(doc_id),
            {
                "mode": mode,
                "stage": STAGE_QUEUED,
                "done": 0,
                "total": 0,
                "target_index": 0,
                "target_count": 1,
                "started_at": None,
                "training_started_at": None,
                "updated_at": now,
            },
            QUEUED_TTL_SECONDS,
        )


def training_mode_for(chunks: Optional[int], status: Optional[str]) -> str:
    """Existing vectors mean this run replaces an earlier training."""
    if int(chunks or 0) > 0 or (status or "") == "Indexed":
        return MODE_RETRAIN
    return MODE_TRAIN


class DocumentTrainingProgress:
    """Tracks one training run for one document; pass ``for_target(i)`` into ingest."""

    def __init__(self, document_id: str, *, mode: str, target_count: int = 1) -> None:
        now = time.time()
        self.document_id = str(document_id)
        self._last_write = 0.0
        self._record: Dict[str, Any] = {
            "mode": mode,
            "stage": STAGE_READING,
            "done": 0,
            "total": 0,
            "target_index": 0,
            "target_count": max(1, int(target_count)),
            "started_at": now,
            "training_started_at": None,
            "updated_at": now,
        }
        self._flush()

    def set_target_count(self, target_count: int) -> None:
        self._record["target_count"] = max(1, int(target_count))

    def for_target(self, target_index: int):
        def _report(stage: str, done: int, total: int) -> None:
            self.update(stage, done, total, target_index=target_index)

        return _report

    def update(self, stage: str, done: int, total: int, *, target_index: int = 0) -> None:
        record = self._record
        stage_changed = stage != record["stage"] or target_index != record["target_index"]
        now = time.time()
        if stage == STAGE_TRAINING and record["training_started_at"] is None:
            record["training_started_at"] = now
        record.update(
            stage=stage,
            done=max(0, int(done)),
            total=max(0, int(total)),
            target_index=max(0, int(target_index)),
            updated_at=now,
        )
        finished_batch = total > 0 and done >= total
        if stage_changed or finished_batch or now - self._last_write >= WRITE_INTERVAL_SECONDS:
            self._flush()

    def requeue(self) -> None:
        """Rate limited: the job goes back to the queue and resumes later."""
        mark_queued([self.document_id], mode=self._record["mode"])

    def finish(self) -> None:
        clear(self.document_id)

    def _flush(self) -> None:
        self._last_write = time.time()
        _write(self.document_id, dict(self._record), ACTIVE_TTL_SECONDS)


def progress_view(record: Dict[str, Any], now: Optional[float] = None) -> Dict[str, Any]:
    """Public shape: stage, mode, percent (0–99 while running), counts, ETA in seconds."""
    now = time.time() if now is None else now
    stage = str(record.get("stage") or STAGE_QUEUED)
    mode = MODE_RETRAIN if record.get("mode") == MODE_RETRAIN else MODE_TRAIN
    done = max(0, int(record.get("done") or 0))
    total = max(0, int(record.get("total") or 0))
    target_count = max(1, int(record.get("target_count") or 1))
    target_index = min(max(0, int(record.get("target_index") or 0)), target_count - 1)

    target_fraction = 1.0 if stage == STAGE_SAVING else (min(done / total, 1.0) if total else 0.0)
    overall = (target_index + target_fraction) / target_count

    if stage == STAGE_QUEUED:
        percent = 0
    elif stage == STAGE_READING:
        percent = _PERCENT_READING
    else:
        percent = _PERCENT_TRAINING_FLOOR + int(overall * _PERCENT_TRAINING_SPAN)
    percent = min(percent, _PERCENT_CEILING)

    eta_seconds: Optional[int] = None
    training_started_at = record.get("training_started_at")
    if stage == STAGE_TRAINING and training_started_at and overall >= MIN_ETA_FRACTION:
        elapsed = max(0.0, now - float(training_started_at))
        eta_seconds = max(1, int(round(elapsed * (1.0 - overall) / overall)))

    return {
        "mode": mode,
        "stage": stage,
        "percent": percent,
        "done": done,
        "total": total,
        "eta_seconds": eta_seconds,
    }


def is_stale(record: Dict[str, Any], now: float) -> bool:
    """A running stage with no update for a long time means the worker died mid-run."""
    if record.get("stage") == STAGE_QUEUED:
        return False
    updated_at = float(record.get("updated_at") or 0)
    return now - updated_at > STALE_ACTIVE_SECONDS


def get_progress_map(document_ids: Iterable[str]) -> Dict[str, Dict[str, Any]]:
    ids = [str(doc_id) for doc_id in document_ids if doc_id]
    now = time.time()
    return {
        doc_id: progress_view(record, now)
        for doc_id, record in _read_many(ids).items()
        if not is_stale(record, now)
    }
