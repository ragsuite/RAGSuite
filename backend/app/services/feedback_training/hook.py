"""Pipeline entry points for the reward memory (retrieval reorder + prompt preferences)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence, Tuple

from . import guidance, memory, reward


def apply(
    entries: List[Dict[str, Any]],
    project_id: Optional[str],
    query_vector: Optional[Sequence[float]],
    embed_model: Any,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Reorder retrieval ``entries`` by learned reward; ``info`` lands in ``retrieval_meta``.

    ``info["preferences"]`` carries the prompt block so cached retrievals reproduce it exactly.
    """
    matches = memory.match(project_id, query_vector, embed_model)
    if not matches:
        return entries, {"applied": False, "reason": "no_match"}
    reordered, info = reward.rerank_entries(entries, matches)
    info["examples"] = [
        {"id": m.example.id, "reward": m.example.reward, "similarity": m.similarity} for m in matches
    ]
    info["preferences"] = guidance.preference_block(matches)
    return reordered, info


def preference_instruction(retrieval_meta: Optional[Dict[str, Any]]) -> str:
    info = (retrieval_meta or {}).get("feedback_memory") if isinstance(retrieval_meta, dict) else None
    return str((info or {}).get("preferences") or "")
