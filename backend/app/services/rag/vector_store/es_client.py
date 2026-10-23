"""Shared Elasticsearch 8 client and collection-index registry."""
from __future__ import annotations

import hashlib
import logging
import re
import threading
from typing import Any, Dict, List, Optional

from ....platform.settings import settings

logger = logging.getLogger(__name__)

COLLECTIONS_INDEX = "ragsuite-collections"
_INDEX_PREFIX = "rs-"
_client: Optional[Elasticsearch] = None
_lock = threading.Lock()

# Single-node compose: default ES replica count is 1 and stays yellow forever.
SINGLE_NODE_INDEX_SETTINGS = {"number_of_shards": 1, "number_of_replicas": 0}


def configured() -> bool:
    return bool((settings.elasticsearch_url or "").strip())


def index_name_for(collection_name: str) -> str:
    raw = (collection_name or "").strip() or "default"
    safe = re.sub(r"[^a-z0-9_-]+", "-", raw.lower()).strip("-") or "col"
    if len(safe) > 80:
        safe = safe[:80] + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return f"{_INDEX_PREFIX}{safe}"


def get_es():
    global _client
    if _client is not None:
        return _client
    if not configured():
        raise RuntimeError("ELASTICSEARCH_URL is not set")
    with _lock:
        if _client is None:
            kwargs: Dict[str, Any] = {
                "hosts": [settings.elasticsearch_url.strip()],
                "verify_certs": bool(settings.elasticsearch_verify_certs),
                "request_timeout": max(5, int(settings.vector_query_timeout_ms or 15000) / 1000),
            }
            user = (settings.elasticsearch_user or "").strip()
            password = settings.elasticsearch_password or ""
            if user:
                kwargs["basic_auth"] = (user, password)
            from elasticsearch import Elasticsearch

            _client = Elasticsearch(**kwargs)
        return _client


def reset_es() -> None:
    global _client
    with _lock:
        if _client is not None:
            try:
                _client.close()
            except Exception:
                pass
            _client = None


def create_index(index: str, mappings: Dict[str, Any]) -> None:
    get_es().indices.create(
        index=index,
        mappings=mappings,
        settings={"index": dict(SINGLE_NODE_INDEX_SETTINGS)},
    )


def ensure_single_node_replicas(index: str) -> None:
    """Drop replica requirement on an existing index (idempotent, single-node)."""
    try:
        get_es().indices.put_settings(index=index, settings={"index": {"number_of_replicas": 0}})
    except Exception as exc:
        logger.debug("ES put_settings replicas=0 skipped for %s: %s", index, exc)


def ensure_collections_index() -> None:
    client = get_es()
    if client.indices.exists(index=COLLECTIONS_INDEX):
        ensure_single_node_replicas(COLLECTIONS_INDEX)
        return
    create_index(
        COLLECTIONS_INDEX,
        {
            "properties": {
                "name": {"type": "keyword"},
                "index": {"type": "keyword"},
                "dim": {"type": "integer"},
                "metric": {"type": "keyword"},
            }
        },
    )


def register_collection(name: str, index: str, dim: int, metric: str = "cosine") -> None:
    ensure_collections_index()
    get_es().index(
        index=COLLECTIONS_INDEX,
        id=name,
        document={"name": name, "index": index, "dim": int(dim), "metric": metric},
        refresh=True,
    )


def load_collection(name: str) -> Optional[Dict[str, Any]]:
    ensure_collections_index()
    try:
        doc = get_es().get(index=COLLECTIONS_INDEX, id=name)
        return doc.get("_source")
    except Exception:
        return None


def list_collection_names() -> List[str]:
    if not configured():
        return []
    ensure_collections_index()
    result = get_es().search(
        index=COLLECTIONS_INDEX,
        query={"match_all": {}},
        size=1000,
        _source=["name"],
    )
    return [hit["_source"]["name"] for hit in result.get("hits", {}).get("hits", []) if hit.get("_source")]


def health() -> Dict[str, Any]:
    if not configured():
        return {"healthy": False, "message": "ELASTICSEARCH_URL is not set"}
    try:
        client = get_es().options(request_timeout=3)
        info = client.info()
        cluster = client.cluster.health()
        status = cluster.get("status")
        return {
            "healthy": status in {"green", "yellow"},
            "elasticsearch_version": info.get("version", {}).get("number"),
            "cluster_status": status,
            "message": "ok" if status in {"green", "yellow"} else f"cluster {status}",
        }
    except Exception as exc:
        logger.warning("Elasticsearch health failed: %s", exc)
        return {"healthy": False, "message": str(exc)}
