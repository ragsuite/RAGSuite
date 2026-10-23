"""Single-node ES indices must not request a replica (avoids permanent yellow)."""
from __future__ import annotations

from app.services.rag.vector_store.es_client import SINGLE_NODE_INDEX_SETTINGS


def test_single_node_index_settings_zero_replicas():
    assert SINGLE_NODE_INDEX_SETTINGS["number_of_replicas"] == 0
    assert SINGLE_NODE_INDEX_SETTINGS["number_of_shards"] == 1


def test_es_cheap_health_probe_skips_collection_list(monkeypatch):
    from app.services.rag.vector_store import es_client
    from app.services.rag.vector_store.health import vector_store_status

    monkeypatch.setattr(es_client, "configured", lambda: True)
    monkeypatch.setattr(
        es_client,
        "health",
        lambda: {"healthy": True, "elasticsearch_version": "8.11.3"},
    )
    monkeypatch.setattr(
        es_client,
        "list_collection_names",
        lambda: (_ for _ in ()).throw(AssertionError("must not list collections")),
    )

    report = vector_store_status(include_counts=False)
    assert report["healthy"] is True
    assert report["pgvector_version"] is None
    assert report["collections"] == []
