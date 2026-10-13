"""Per-project reward memory: active trained examples matched to a new question by embedding.

Examples are cached per process and reloaded whenever the shared knowledge-base generation
changes (training and untraining bump it), or after ``CACHE_TTL_SECONDS`` without Redis.
Vectors are computed lazily with the *query's* embedder and stored per embedder identity, so
switching a project's embedding model never compares vectors from different spaces.
"""
from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

from ..rag import kb_generation
from ..rag.query_embedding_cache import model_identity

logger = logging.getLogger(__name__)

MIN_SIMILARITY = float(os.getenv("FEEDBACK_MEMORY_MIN_SIMILARITY", "0.82"))
TOP_MATCHES = 3
MAX_EXAMPLES = 500
EMBED_PER_QUERY = 32
CACHE_TTL_SECONDS = 30.0
MIN_WEIGHT = 0.05


def enabled() -> bool:
    return os.getenv("FEEDBACK_MEMORY_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}


@dataclass(frozen=True)
class Example:
    id: str
    reward: int
    query_text: str
    reason_tags: Tuple[str, ...] = ()
    user_comment: Optional[str] = None
    guidance: Optional[str] = None
    cited_urls: Tuple[str, ...] = ()
    answer_profile: Optional[dict] = None


@dataclass(frozen=True)
class Match:
    example: Example
    similarity: float
    weight: float


@dataclass
class _ProjectMemory:
    examples: List[Example]
    generation: Optional[str]
    loaded_at: float
    vectors: Dict[str, Dict[str, np.ndarray]] = field(default_factory=dict)

    def fresh(self, generation: Optional[str]) -> bool:
        if generation is None:
            return time.monotonic() - self.loaded_at < CACHE_TTL_SECONDS
        return generation == self.generation


_cache: Dict[str, _ProjectMemory] = {}
_lock = threading.Lock()


def identity_of(embed_model: Any) -> str:
    return "|".join(model_identity(embed_model))


def _to_example(row: Any) -> Example:
    return Example(
        id=str(row.id),
        reward=1 if int(row.reward) > 0 else -1,
        query_text=row.query_text or "",
        reason_tags=tuple(str(t) for t in (row.reason_tags or [])),
        user_comment=row.user_comment,
        guidance=row.guidance,
        cited_urls=tuple(str(u) for u in (row.cited_urls or [])),
        answer_profile=row.answer_profile if isinstance(row.answer_profile, dict) else None,
    )


def _load(project_id: str, generation: Optional[str]) -> _ProjectMemory:
    from ...db import SessionLocal
    from ...models import FeedbackTrainingExample

    db = SessionLocal()
    try:
        rows = (
            db.query(FeedbackTrainingExample)
            .filter(
                FeedbackTrainingExample.project_id == uuid.UUID(str(project_id)),
                FeedbackTrainingExample.is_active.is_(True),
            )
            .order_by(FeedbackTrainingExample.updated_at.desc())
            .limit(MAX_EXAMPLES)
            .all()
        )
        memory = _ProjectMemory([_to_example(r) for r in rows], generation, time.monotonic())
        for row in rows:
            for identity, vector in (row.embeddings or {}).items():
                if vector:
                    memory.vectors.setdefault(identity, {})[str(row.id)] = np.asarray(vector, dtype=np.float32)
        return memory
    finally:
        db.close()


def _memory(project_id: str) -> _ProjectMemory:
    generation = kb_generation.current()
    with _lock:
        cached = _cache.get(project_id)
        if cached is not None and cached.fresh(generation):
            return cached
    loaded = _load(project_id, generation)
    with _lock:
        _cache[project_id] = loaded
    return loaded


def invalidate(project_id: Optional[str] = None) -> None:
    with _lock:
        if project_id is None:
            _cache.clear()
        else:
            _cache.pop(str(project_id), None)


def _embed_texts(embed_model: Any, texts: List[str]) -> List[List[float]]:
    batch = getattr(embed_model, "get_text_embedding_batch", None)
    if callable(batch):
        return batch(texts, show_progress=False)
    return [embed_model.get_text_embedding(t) for t in texts]


def _persist_vectors(identity: str, vectors: Dict[str, List[float]]) -> None:
    from ...db import SessionLocal
    from ...models import FeedbackTrainingExample

    db = SessionLocal()
    try:
        for example_id, vector in vectors.items():
            row = db.get(FeedbackTrainingExample, uuid.UUID(example_id))
            if row is None:
                continue
            stored = dict(row.embeddings or {})
            stored[identity] = vector
            row.embeddings = stored
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.debug("feedback memory: could not persist example vectors: %s", exc)
    finally:
        db.close()


def _ensure_vectors(memory: _ProjectMemory, embed_model: Any, identity: str) -> Dict[str, np.ndarray]:
    known = memory.vectors.setdefault(identity, {})
    missing = [e for e in memory.examples if e.id not in known][:EMBED_PER_QUERY]
    if not missing:
        return known
    try:
        vectors = _embed_texts(embed_model, [e.query_text for e in missing])
    except Exception as exc:
        logger.info("feedback memory: embedding trained questions failed (%s); skipped this time", exc)
        return known
    fresh = {e.id: list(v) for e, v in zip(missing, vectors) if v}
    for example_id, vector in fresh.items():
        known[example_id] = np.asarray(vector, dtype=np.float32)
    if fresh:
        _persist_vectors(identity, fresh)
    return known


def score(similarity: float, reward: int, floor: float = MIN_SIMILARITY) -> float:
    span = max(1e-6, 1.0 - floor)
    return reward * max(MIN_WEIGHT, (similarity - floor) / span)


def rank(
    examples: Sequence[Example],
    vectors: Dict[str, np.ndarray],
    query_vector: Sequence[float],
    floor: float = MIN_SIMILARITY,
    limit: int = TOP_MATCHES,
) -> List[Match]:
    """Top ``limit`` examples with cosine similarity ``>= floor`` (same-dimension vectors only)."""
    query = np.asarray(query_vector, dtype=np.float32)
    q_norm = float(np.linalg.norm(query))
    if not q_norm:
        return []
    scored: List[Match] = []
    for example in examples:
        vector = vectors.get(example.id)
        if vector is None or vector.shape != query.shape:
            continue
        v_norm = float(np.linalg.norm(vector))
        if not v_norm:
            continue
        similarity = float(np.dot(query, vector) / (q_norm * v_norm))
        if similarity >= floor:
            scored.append(Match(example, round(similarity, 4), score(similarity, example.reward, floor)))
    scored.sort(key=lambda m: -m.similarity)
    return scored[:limit]


def match(project_id: Optional[str], query_vector: Optional[Sequence[float]], embed_model: Any) -> List[Match]:
    """Trained examples similar to the question, best first; ``[]`` on any failure."""
    if not enabled() or not project_id or not query_vector or embed_model is None:
        return []
    try:
        memory = _memory(str(project_id))
        if not memory.examples:
            return []
        identity = identity_of(embed_model)
        vectors = _ensure_vectors(memory, embed_model, identity)
        return rank(memory.examples, vectors, query_vector)
    except Exception as exc:
        logger.warning("feedback memory: match failed for project %s: %s", project_id, exc)
        return []
