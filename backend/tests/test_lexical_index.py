"""Lexical sidecar index: disabled paths are no-ops; SQL shaping; backfill idempotence."""
from unittest.mock import MagicMock

import pytest

from app.services.rag import lexical_index as li
from app.services.rag import lexical_index_backfill as lb


@pytest.fixture(autouse=True)
def _reset_state():
    li._table_state.clear()
    li._has_rows_cache.clear()
    yield
    li._table_state.clear()
    li._has_rows_cache.clear()


def test_disabled_on_sqlite_is_noop(monkeypatch):
    monkeypatch.setattr(li, "_get_engine", lambda: None)
    assert li.is_enabled() is False
    assert li.upsert_chunks("c", ["1"], ["text"], [{}]) == 0
    assert li.search("c", "p", ["nitsan"]) == []
    assert li.has_rows("c") is False
    assert li.count_rows("c") == 0
    li.delete_where("c", document_id="d")  # must not raise


def test_env_flag_disables(monkeypatch):
    monkeypatch.setenv("RAG_LEXICAL_INDEX_ENABLED", "0")
    assert li.is_enabled() is False


def test_tsquery_prefix_and_dedupe():
    assert li._tsquery(["T3Planet pricing", "pricing", "ai", "x"]) == "t3planet:* | pricing:* | ai"
    assert li._tsquery(["", "!"]) == ""


def test_row_weights_title_and_url_and_strips_nul():
    row = li._row("c", "id1", "body\x00text", {"title": "Mohn Media", "url": "https://www.mohn-media.de/x", "project_id": "p"})
    assert row["head"] == "mohn media mohn media de x"
    assert "\x00" not in row["body"]
    assert row["project_id"] == "p" and row["document_id"] is None


def _fake_engine():
    conn = MagicMock()
    engine = MagicMock()
    engine.begin.return_value.__enter__.return_value = conn
    engine.connect.return_value.__enter__.return_value = conn
    return engine, conn


def test_upsert_batches_and_skips_empty(monkeypatch):
    engine, conn = _fake_engine()
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_get_engine", lambda: engine)
    monkeypatch.setattr(li, "_WRITE_BATCH", 2)
    written = li.upsert_chunks("c", ["1", "2", "3", "4"], ["a", "", "b", "c"], None)
    assert written == 3
    assert conn.execute.call_count == 2


def test_upsert_failure_is_swallowed(monkeypatch):
    engine = MagicMock()
    engine.begin.side_effect = RuntimeError("db down")
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_get_engine", lambda: engine)
    assert li.upsert_chunks("c", ["1"], ["a"], None) == 0


def test_delete_requires_a_filter_beyond_collection(monkeypatch):
    engine, conn = _fake_engine()
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_get_engine", lambda: engine)
    li.delete_where("c")
    li.delete_where("c", ids=[])
    assert conn.execute.call_count == 0
    li.delete_where("c", ids=["a", "b"])
    assert conn.execute.call_count == 1


def test_search_returns_ranked_ids(monkeypatch):
    engine, conn = _fake_engine()
    conn.execute.return_value.fetchall.return_value = [("id9", 0.5), ("id2", 0.1)]
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_get_engine", lambda: engine)
    assert li.search("c", "p", ["nitsan"]) == [("id9", 0.5), ("id2", 0.1)]


def test_backfill_skips_complete_collection(monkeypatch):
    coll = MagicMock()
    coll.count.return_value = 10
    vdb = MagicMock()
    vdb.get_collection.return_value = coll
    monkeypatch.setattr(lb.lexical_index, "count_rows", lambda _n: 10)
    assert lb.backfill_collection("c", vdb=vdb) == 0
    coll.get.assert_not_called()


def test_backfill_pages_read_only_until_exhausted(monkeypatch):
    coll = MagicMock()
    coll.count.return_value = 3
    coll.get.side_effect = [
        {"ids": ["1", "2"], "documents": ["a", "b"], "metadatas": [{}, {}]},
        {"ids": ["3"], "documents": ["c"], "metadatas": [{}]},
    ]
    vdb = MagicMock()
    vdb.get_collection.return_value = coll
    upserted = []
    monkeypatch.setattr(lb.lexical_index, "count_rows", lambda _n: 0)
    monkeypatch.setattr(
        lb.lexical_index, "upsert_chunks", lambda _c, ids, _d, _m: upserted.extend(ids) or len(ids)
    )
    monkeypatch.setattr(lb, "_PAGE_PAUSE_SECONDS", 0)
    assert lb.backfill_collection("c", vdb=vdb, page_size=2) == 3
    assert upserted == ["1", "2", "3"]
    coll.add.assert_not_called()
    coll.delete.assert_not_called()
    coll.upsert.assert_not_called()


def test_backfill_disabled_does_nothing(monkeypatch):
    monkeypatch.setattr(lb.lexical_index, "is_enabled", lambda: False)
    vdb = MagicMock()
    assert lb.backfill_all(vdb=vdb) == {}
    vdb.list_known_collections.assert_not_called()
