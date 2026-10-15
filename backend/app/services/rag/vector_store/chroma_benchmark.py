"""Recall and latency of pgvector vs the legacy Chroma store, on the same data.

Queries are stored chunk vectors with noise added (so the answer is not the query
itself), filtered by ``project_id`` like production retrieval. Ground truth is an
exact brute-force top-k under the same filter. Gates per collection:

* pgvector recall@k >= Chroma recall@k
* overlap between the two result sets >= 0.98 (or recall >= 0.99, where any
  remaining disagreement can only be Chroma's misses)
* pgvector p50 / p95 latency <= Chroma's (after warm-up)
"""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Tuple

import numpy as np
from sqlalchemy import text

from . import codec, schema
from .chroma_source import ChromaSource, SourceCollection
from .collection import PgCollection
from .engine import read_tx

TOP_K = 10
MIN_ROWS = 50
_WARMUP = 5
_NOISE = 0.6
_SEED = 7


def _load(name: str) -> Tuple[List[str], List[str], np.ndarray, str]:
    with read_tx(timeout_ms=0) as conn:
        info = schema.load_info(conn, name)
        if info is None or info.dim is None:
            return [], [], np.zeros((0, 0), dtype=np.float32), "cosine"
        rows = conn.execute(
            text(f"SELECT chunk_id, project_id, embedding::text AS e FROM {info.qualified} ORDER BY seq")
        ).all()
    ids = [r.chunk_id for r in rows]
    projects = [r.project_id or "" for r in rows]
    matrix = np.vstack([codec.decode(r.e) for r in rows]) if rows else np.zeros((0, 0), dtype=np.float32)
    return ids, projects, matrix, info.metric


def _exact_top(matrix: np.ndarray, mask: np.ndarray, q: np.ndarray, metric: str, k: int) -> List[int]:
    if metric == "l2":
        dist = np.sum((matrix - q) ** 2, axis=1)
    elif metric == "ip":
        dist = 1.0 - matrix @ q
    else:
        norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(q)
        dist = 1.0 - (matrix @ q) / np.where(norms == 0, 1.0, norms)
    dist = np.where(mask, dist, np.inf)
    order = np.argsort(dist, kind="stable")[:k]
    return [int(i) for i in order if np.isfinite(dist[i])]


def _queries(matrix: np.ndarray, n: int) -> Tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(_SEED)
    picks = rng.choice(matrix.shape[0], size=min(n, matrix.shape[0]), replace=False)
    base = matrix[picks] / np.linalg.norm(matrix[picks], axis=1, keepdims=True)
    noise = rng.normal(0.0, 1.0 / np.sqrt(matrix.shape[1]), size=base.shape) * _NOISE
    return picks, (base + noise).astype(np.float32)


def _pct(values: List[float], p: float) -> float:
    return float(np.percentile(values, p)) if values else 0.0


def benchmark_collection(coll: SourceCollection, queries: int) -> Dict[str, Any]:
    ids, projects, matrix, metric = _load(coll.name)
    if len(ids) < MIN_ROWS:
        return {"collection": coll.name, "skipped": True, "rows": len(ids)}
    picks, qs = _queries(matrix, queries + _WARMUP)
    project_arr = np.array(projects)
    pg = PgCollection(coll.name, metric=metric)
    rec = {"chroma": [], "pgvector": []}
    lat = {"chroma": [], "pgvector": []}
    overlap: List[float] = []
    for n, (row, q) in enumerate(zip(picks, qs)):
        pid = projects[row]
        where = {"project_id": pid} if pid else None
        mask = project_arr == pid if pid else np.ones(len(ids), dtype=bool)
        truth = {ids[i] for i in _exact_top(matrix, mask, q, metric, TOP_K)}
        t0 = time.perf_counter()
        c_ids = coll.handle.query(query_embeddings=[q.tolist()], n_results=TOP_K, where=where, include=[])["ids"][0]
        t1 = time.perf_counter()
        p_ids = pg.query(query_embeddings=[q], n_results=TOP_K, where=where, include=[])["ids"][0]
        t2 = time.perf_counter()
        if n < _WARMUP:
            continue
        lat["chroma"].append((t1 - t0) * 1000)
        lat["pgvector"].append((t2 - t1) * 1000)
        denom = max(1, len(truth))
        rec["chroma"].append(len(truth & set(c_ids)) / denom)
        rec["pgvector"].append(len(truth & set(p_ids)) / denom)
        overlap.append(len(set(c_ids) & set(p_ids)) / max(1, len(c_ids)))
    out: Dict[str, Any] = {"collection": coll.name, "rows": len(ids), "queries": len(overlap), "k": TOP_K}
    for name in ("chroma", "pgvector"):
        out[name] = {
            "recall": round(float(np.mean(rec[name])), 4),
            "p50_ms": round(_pct(lat[name], 50), 2),
            "p95_ms": round(_pct(lat[name], 95), 2),
        }
    out["overlap"] = round(float(np.mean(overlap)), 4)
    c, p = out["chroma"], out["pgvector"]
    out["gates"] = {
        "recall": p["recall"] >= c["recall"],
        "overlap": out["overlap"] >= 0.98 or p["recall"] >= 0.99,
        "p50": p["p50_ms"] <= c["p50_ms"],
        "p95": p["p95_ms"] <= c["p95_ms"],
    }
    out["passed"] = all(out["gates"].values())
    return out


def run_benchmark(source: ChromaSource, *, queries: int = 100) -> int:
    failed = 0
    for coll in source.collections():
        if coll.count < MIN_ROWS:
            continue
        result = benchmark_collection(coll, queries)
        print(json.dumps(result), flush=True)
        if not result.get("skipped") and not result["passed"]:
            failed += 1
    print(json.dumps({"benchmark": "passed" if not failed else "failed", "failed_collections": failed}), flush=True)
    return 1 if failed else 0
