"""Vector <-> pgvector text encoding and metric helpers.

Values go through float32 first, so stored vectors are bit-identical to the float32
embeddings Chroma held; pgvector prints the shortest round-trip form on the way out.
"""
from __future__ import annotations

import json
import math
from typing import Any, Dict, Optional, Sequence

import numpy as np

# pgvector HNSW indexes ``vector`` up to 2000 dims; larger ones index a halfvec cast.
HNSW_MAX_VECTOR_DIM = 2000
HNSW_MAX_HALFVEC_DIM = 4000

_METRIC_OPS = {
    "cosine": ("<=>", "vector_cosine_ops", "halfvec_cosine_ops"),
    "l2": ("<->", "vector_l2_ops", "halfvec_l2_ops"),
    "ip": ("<#>", "vector_ip_ops", "halfvec_ip_ops"),
}


def normalize_metric(metric: Optional[str]) -> str:
    m = (metric or "cosine").strip().lower()
    return m if m in _METRIC_OPS else "cosine"


def distance_operator(metric: str) -> str:
    return _METRIC_OPS[normalize_metric(metric)][0]


def index_opclass(metric: str, *, halfvec: bool) -> str:
    ops = _METRIC_OPS[normalize_metric(metric)]
    return ops[2] if halfvec else ops[1]


def distance_sql(metric: str, raw: str) -> str:
    """Chroma-compatible distance from the pgvector operator result.

    Chroma: cosine = 1 - cos (same as ``<=>``); l2 = squared L2 (``<->`` is not
    squared); ip = 1 - dot (``<#>`` is -dot).
    """
    m = normalize_metric(metric)
    if m == "l2":
        return f"power({raw}, 2)"
    if m == "ip":
        return f"(1 + {raw})"
    return raw


def uses_halfvec_index(dim: int) -> bool:
    return int(dim) > HNSW_MAX_VECTOR_DIM


def to_float32(values: Any) -> np.ndarray:
    return np.asarray(values, dtype=np.float32).reshape(-1)


def encode(values: Any) -> str:
    """pgvector text literal of the float32 values."""
    arr = to_float32(values)
    return "[" + ",".join(map(repr, arr.tolist())) + "]"


def decode(raw: Any) -> Optional[np.ndarray]:
    if raw is None:
        return None
    if isinstance(raw, np.ndarray):
        return raw.astype(np.float32, copy=False)
    s = str(raw).strip()
    if len(s) < 2:
        return np.zeros(0, dtype=np.float32)
    body = s[1:-1]
    if not body:
        return np.zeros(0, dtype=np.float32)
    return np.array(body.split(","), dtype=np.float32)


def clean_text(value: str) -> str:
    """Postgres-storable text: NUL removed, unpaired surrogates replaced."""
    if "\x00" in value:
        value = value.replace("\x00", "")
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        value = value.encode("utf-8", "replace").decode("utf-8")
    return value


def _json_safe(value: Any) -> Any:
    # jsonb rejects NaN/Infinity and NUL; keep them readable instead of failing the write.
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, str):
        return clean_text(value)
    return value


def normalize_metadata(meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Metadata exactly as it is stored (and read back)."""
    return {clean_text(str(k)): _json_safe(v) for k, v in (meta or {}).items()}


def dumps_metadata(meta: Optional[Dict[str, Any]]) -> str:
    return json.dumps(normalize_metadata(meta), ensure_ascii=False, default=str)


def loads_metadata(raw: Any) -> Dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def vectors_equal(a: Sequence[float], b: Sequence[float]) -> bool:
    """Byte-level float32 equality (migration verification)."""
    left = to_float32(a)
    right = to_float32(b)
    return left.shape == right.shape and left.tobytes() == right.tobytes()
