"""Cross-encoder reranker: lazy load, failure memo and a per-query latency budget.

The Docker image bundles the default model under ``BUNDLED_MODEL_DIR`` so it loads with
``HF_HUB_OFFLINE=1``. ``RAG_CROSS_ENCODER_MODEL`` overrides it (Hugging Face id or local
path). A failed load is not retried on every query: the next attempt waits
``RETRY_AFTER_SECONDS``. The per-candidate cost is measured at load and on every
rerank; the candidate count shrinks so one rerank stays within ``RAG_RERANK_BUDGET_MS``,
and reranking is skipped when even the minimum pool would not fit. The first measurement
runs in a child process (``cross_encoder_probe``) so a host that is too slow never loads
the model into the API process.
"""
from __future__ import annotations

import gc
import logging
import os
import threading
import time
from typing import Any, Optional

from . import cross_encoder_probe

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "BAAI/bge-reranker-base"
BUNDLED_MODEL_DIR = "/opt/models/reranker"
CONFIGURED_MODEL = os.getenv("RAG_CROSS_ENCODER_MODEL", "").strip()
MODEL_ID = CONFIGURED_MODEL or DEFAULT_MODEL
MAX_LENGTH = int(os.getenv("RAG_CROSS_ENCODER_MAX_LENGTH", "256"))
BUDGET_MS = float(os.getenv("RAG_RERANK_BUDGET_MS", "800"))
RETRY_AFTER_SECONDS = 600.0
LATENCY_EMA_WEIGHT = 0.3
CALIBRATION_PAIRS = 4
# Smallest pool worth reranking; a host that cannot rerank this many within the budget
# never reranks, so the model is not kept in memory there.
MIN_USEFUL_CANDIDATES = 5


class _State:
    model: Any = None
    failed_at: Optional[float] = None
    pair_ms: Optional[float] = None
    loader: Optional[threading.Thread] = None
    too_slow: bool = False
    lock = threading.Lock()


def model_source() -> str:
    """The configured model; without configuration the bundled copy, else the default id."""
    if CONFIGURED_MODEL:
        return CONFIGURED_MODEL
    if os.path.isfile(os.path.join(BUNDLED_MODEL_DIR, "config.json")):
        return BUNDLED_MODEL_DIR
    return DEFAULT_MODEL


def _retry_blocked() -> bool:
    if _State.too_slow:
        return True
    return _State.failed_at is not None and time.monotonic() - _State.failed_at < RETRY_AFTER_SECONDS


def _mark_too_slow() -> bool:
    """Turn reranking off for this process when the minimum pool cannot fit the budget."""
    if _State.pair_ms is None or _State.pair_ms * MIN_USEFUL_CANDIDATES <= BUDGET_MS:
        return False
    _State.too_slow = True
    logger.warning(
        "CrossEncoder needs %.0f ms per candidate; %d candidates exceed the %.0f ms budget on this host, "
        "so reranking stays off and the model is not kept in memory (raise RAG_RERANK_BUDGET_MS to use it)",
        _State.pair_ms, MIN_USEFUL_CANDIDATES, BUDGET_MS,
    )
    return True


def get() -> Any:
    """Loaded model, or None when unavailable (callers then skip reranking)."""
    if _State.model is not None:
        return _State.model
    if _retry_blocked():
        return None
    with _State.lock:
        if _State.model is not None or _retry_blocked():
            return _State.model
        source = model_source()
        if _State.pair_ms is None:
            measured = cross_encoder_probe.measure(source, MODEL_ID, MAX_LENGTH, CALIBRATION_PAIRS)
            if measured is not None:
                record_latency(1, measured)
                if _mark_too_slow():
                    return None
        try:
            from sentence_transformers import CrossEncoder

            started = time.time()
            model = CrossEncoder(source, device="cpu", max_length=MAX_LENGTH)
            logger.info("CrossEncoder '%s' loaded from %s in %.1fs", MODEL_ID, source, time.time() - started)
            _calibrate(model)
            if _mark_too_slow():
                del model
                gc.collect()
                return None
            _State.model = model
            _State.failed_at = None
        except Exception as exc:
            _State.failed_at = time.monotonic()
            logger.error("CrossEncoder '%s' unavailable (%s); retry in %ds", source, exc, int(RETRY_AFTER_SECONDS))
    return _State.model


def warm_up() -> None:
    """Load and calibrate in a background thread (no-op when loaded, loading or blocked)."""
    if _State.model is not None or _retry_blocked():
        return
    with _State.lock:
        if _State.loader is not None and _State.loader.is_alive():
            return
        _State.loader = threading.Thread(target=get, name="cross-encoder-load", daemon=True)
        _State.loader.start()


def ready() -> bool:
    """Whether a query may rerank now; otherwise loading starts in the background so the
    query never waits for the model load and calibration (seconds on CPU)."""
    if _State.model is not None:
        return True
    warm_up()
    return False


def unavailable_reason() -> str:
    """Why ``ready()`` is false, for retrieval metadata."""
    if _State.too_slow:
        return "over_latency_budget"
    if _State.failed_at is not None:
        return "reranker_unavailable"
    return "reranker_loading"


def record_latency(pairs: int, elapsed_ms: float) -> None:
    if pairs <= 0:
        return
    sample = elapsed_ms / pairs
    previous = _State.pair_ms
    _State.pair_ms = sample if previous is None else previous + LATENCY_EMA_WEIGHT * (sample - previous)


def candidate_limit(requested: int, minimum: int) -> int:
    """Candidates that fit the latency budget, at most ``requested``.

    0 when not even ``minimum`` candidates fit: on slow hardware a rerank of a handful
    of chunks costs more answer time than it gains, so the caller skips it.
    """
    if _State.pair_ms is None or _State.pair_ms <= 0:
        return requested
    fitting = min(requested, int(BUDGET_MS / _State.pair_ms))
    return fitting if fitting >= min(minimum, requested) else 0


def _calibrate(model: Any) -> None:
    """Time a small batch of full-length pairs so the first query already has a budget."""
    passage = " ".join(["product details price specification warranty"] * (MAX_LENGTH // 5))
    pairs = [("which model has the longest battery life", passage)] * CALIBRATION_PAIRS
    try:
        model.predict(pairs[:1], show_progress_bar=False)
        started = time.perf_counter()
        model.predict(pairs, show_progress_bar=False)
        record_latency(len(pairs), (time.perf_counter() - started) * 1000)
        logger.info("CrossEncoder calibrated: %.0f ms per candidate", _State.pair_ms or 0.0)
    except Exception as exc:
        logger.warning("CrossEncoder calibration failed: %s", exc)


def reset_for_tests() -> None:
    _State.model = None
    _State.failed_at = None
    _State.pair_ms = None
    _State.loader = None
    _State.too_slow = False
