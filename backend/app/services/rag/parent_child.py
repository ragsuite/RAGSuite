"""Custom-only parent → child split and retrieve expansion.

Native / missing / flag-off paths never add ``parent_id`` or ``parent_text``.
"""
from __future__ import annotations

from typing import Any, Dict, List, Sequence, Tuple

from .split_config import SIZE_MIN, SplitConfig, chunk_text_custom

PARENT_ID_KEY = "parent_id"
PARENT_TEXT_KEY = "parent_text"
PARENT_TEXT_MAX = 4000


def child_size_for(cfg: SplitConfig) -> int:
    return max(SIZE_MIN, int(cfg.chunk_size) // 2)


def split_parent_into_children(parent: str, cfg: SplitConfig) -> List[str]:
    body = parent or ""
    if not body.strip():
        return []
    child_size = child_size_for(cfg)
    overlap = min(int(cfg.chunk_overlap), max(0, child_size - 1))
    kids = chunk_text_custom(body, child_size, overlap, ".")
    if len(kids) <= 1 and len(body) > child_size:
        kids = chunk_text_custom(body, child_size, overlap, "\n")
    return kids or [body]


def expand_parent_child(
    parents: Sequence[str], cfg: SplitConfig
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Turn Custom parent pieces into children with parent metadata."""
    texts: List[str] = []
    extras: List[Dict[str, Any]] = []
    for index, parent in enumerate(parents):
        kids = split_parent_into_children(parent, cfg)
        parent_id = f"p{index}"
        for kid in kids:
            texts.append(kid)
            extras.append(
                {
                    PARENT_ID_KEY: parent_id,
                    PARENT_TEXT_KEY: parent[:PARENT_TEXT_MAX],
                    "_parent_index": index,
                }
            )
    return texts, extras


def merge_parent_metadata(
    metadata_list: Sequence[Dict[str, Any]],
    extras: Sequence[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Copy parent fields onto child metas. Empty extras leave metadata unchanged."""
    if not extras or not any(extra.get(PARENT_ID_KEY) for extra in extras):
        return list(metadata_list)
    if len(extras) == len(metadata_list):
        out: List[Dict[str, Any]] = []
        for index, (meta, extra) in enumerate(zip(metadata_list, extras)):
            merged = dict(meta)
            merged["chunk_index"] = index
            parent_id = extra.get(PARENT_ID_KEY)
            parent_text = extra.get(PARENT_TEXT_KEY)
            if parent_id:
                merged[PARENT_ID_KEY] = parent_id
            if parent_text:
                merged[PARENT_TEXT_KEY] = parent_text
            out.append(merged)
        return out
    out = []
    for extra in extras:
        parent_index = extra.get("_parent_index")
        if not isinstance(parent_index, int):
            parent_id = str(extra.get(PARENT_ID_KEY) or "")
            parent_index = int(parent_id[1:]) if parent_id.startswith("p") and parent_id[1:].isdigit() else 0
        base = dict(metadata_list[parent_index]) if parent_index < len(metadata_list) else {}
        base["chunk_index"] = len(out)
        parent_id = extra.get(PARENT_ID_KEY)
        parent_text = extra.get(PARENT_TEXT_KEY)
        if parent_id:
            base[PARENT_ID_KEY] = parent_id
        if parent_text:
            base[PARENT_TEXT_KEY] = parent_text
        out.append(base)
    return out


def _hit_parent_text(meta: Any) -> str:
    if not isinstance(meta, dict):
        return ""
    return str(meta.get(PARENT_TEXT_KEY) or "").strip()


def expand_parent_hits(
    docs: Sequence[str],
    ids: Sequence[str],
    metas: Sequence[Any],
    dists: Sequence[float],
    k: int,
) -> Tuple[List[str], List[str], List[Any], List[float]]:
    """Replace child hits with unique parents. Identity when no hit has parent_text."""
    if not any(_hit_parent_text(meta) for meta in metas):
        return (
            docs if isinstance(docs, list) else list(docs),
            ids if isinstance(ids, list) else list(ids),
            metas if isinstance(metas, list) else list(metas),
            dists if isinstance(dists, list) else list(dists),
        )
    limit = max(1, int(k))
    out_docs: List[str] = []
    out_ids: List[str] = []
    out_metas: List[Any] = []
    out_dists: List[float] = []
    seen: set[str] = set()
    for doc, doc_id, meta, dist in zip(docs, ids, metas, dists):
        parent_text = _hit_parent_text(meta)
        if parent_text:
            key = str((meta or {}).get(PARENT_ID_KEY) or "") or parent_text
            body = parent_text
        else:
            key = str(doc_id)
            body = doc
        if key in seen:
            continue
        seen.add(key)
        out_docs.append(body)
        out_ids.append(doc_id)
        out_metas.append(meta)
        out_dists.append(dist)
        if len(out_docs) >= limit:
            break
    return out_docs, out_ids, out_metas, out_dists
