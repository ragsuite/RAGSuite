"""Persist parse-only ingest payloads so embed jobs can run separately.

MinIO is preferred (``{project}/{document}/parsed.json``). When MinIO is not
configured, a sibling ``.parsed.json`` next to the staging file is used.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

PARSED_FILENAME = "parsed.json"


def parsed_blob_key(project_id: object, document_id: object) -> str:
    from app.platform import blob_store

    return blob_store.blob_key(project_id, document_id, PARSED_FILENAME)


def save_parsed(
    project_id: object,
    document_id: object,
    payload: Dict[str, Any],
    *,
    staging_fallback: Optional[str] = None,
) -> str:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    from app.platform import blob_store

    if blob_store.configured():
        key = parsed_blob_key(project_id, document_id)
        blob_store.put(key, raw, content_type="application/json")
        return key
    path = _fallback_path(staging_fallback, document_id)
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(raw)
    return path


def load_parsed(key_or_path: str) -> Dict[str, Any]:
    if key_or_path and os.path.isfile(key_or_path):
        with open(key_or_path, "r", encoding="utf-8") as fh:
            data = json.loads(fh.read())
        if not isinstance(data, dict):
            raise ValueError("parsed payload is not an object")
        return data
    from app.platform import blob_store

    data = json.loads(blob_store.get(key_or_path).decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("parsed payload is not an object")
    return data


def inspector_chunks(project_id: object, document_id: object) -> List[Dict[str, Any]]:
    """Parsed knowledge pieces for the inspector when the vector store has none."""
    try:
        payload = load_parsed(parsed_blob_key(project_id, document_id))
    except Exception:
        return []
    texts = payload.get("texts") or []
    metas = payload.get("chunk_metadata") or []
    out: List[Dict[str, Any]] = []
    for i, text in enumerate(texts):
        if not isinstance(text, str) or not text:
            continue
        meta = metas[i] if i < len(metas) and isinstance(metas[i], dict) else {}
        item_meta = dict(meta)
        item_meta.setdefault("chunk_index", i)
        out.append({"text": text, "metadata": item_meta})
    return out


def delete_parsed(
    project_id: object,
    document_id: object,
    *,
    staging_fallback: Optional[str] = None,
) -> None:
    from app.platform import blob_store

    if blob_store.configured():
        try:
            blob_store.delete(parsed_blob_key(project_id, document_id))
        except Exception as exc:
            logger.debug("parsed blob delete skipped: %s", exc)
    path = _fallback_path(staging_fallback, document_id)
    if path and os.path.isfile(path):
        try:
            os.remove(path)
        except OSError as exc:
            logger.debug("parsed fallback delete skipped: %s", exc)


def _fallback_path(staging_fallback: Optional[str], document_id: object) -> str:
    if staging_fallback:
        return f"{staging_fallback}.parsed.json"
    return os.path.join("data", "staging", f"{document_id}.parsed.json")
