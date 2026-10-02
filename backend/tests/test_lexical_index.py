"""Lexical sidecar index: disabled paths are no-ops; SQL shaping; backfill idempotence."""
from unittest.mock import MagicMock

import pytest

from app.services.rag import lexical_index as li
from app.services.rag import lexical_index_backfill as lb
from app.services.rag import lexical_schema as ls
from app.services.rag import query_keywords as qk


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
    assert qk.tsquery_text(["T3Planet pricing", "pricing", "ai", "x"], None) == "t3planet:* | pricing:* | ai"
    assert qk.tsquery_text(["", "!"], None) == ""


def test_row_weights_title_and_url_and_strips_nul():
    row = ls.build_row("c", "id1", "body\x00text", {"title": "Mohn Media", "url": "https://www.mohn-media.de/x", "project_id": "p"})
    assert row["head"] == "mohn media mohn media de x"
    assert "\x00" not in row["body"]
    assert row["project_id"] == "p" and row["document_id"] is None
    assert row["index_version"] == ls.INDEX_VERSION


def test_row_word_parts_only_for_compound_language_passages():
    german = ls.build_row("c", "1", "Keine Wasserverschleppung im Produktionsbereich.", {"language": "de"})
    english = ls.build_row("c", "2", "No water carry-over in the production area.", {"language": "en"})
    assert "verschleppung" in german["parts"].split()
    assert english["parts"] == ""


def test_upsert_sql_falls_back_without_version_column():
    assert "index_version" in str(ls.upsert_sql(with_version=True))
    assert "index_version" not in str(ls.upsert_sql(with_version=False))
    assert "setweight(to_tsvector('simple', :parts), 'B')" in str(ls.upsert_sql(with_version=False))


def test_search_sql_uses_custom_weights_and_one_query():
    sql = str(ls.search_sql("AND project_id = :project_id"))
    assert ls.RANK_WEIGHTS in sql and "tsv @@ q" in sql and "AND project_id = :project_id" in sql


def test_search_passes_stemmed_query(monkeypatch):
    engine, conn = _fake_engine()
    conn.execute.return_value.fetchall.return_value = [("id1", 0.3)]
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_get_engine", lambda: engine)
    assert li.search("c", None, ["verschleppen", "artikelnummer"], lang="de") == [("id1", 0.3)]
    params = conn.execute.call_args_list[-1].args[1]
    assert params["q"] == "verschlepp:* | artikelnumm:*"
    assert "f" not in params


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
    monkeypatch.setattr(lb.lexical_index, "count_outdated_rows", lambda _n: 0)
    assert lb.backfill_collection("c", vdb=vdb) == 0
    coll.get.assert_not_called()


def _reindex_setup(monkeypatch, upsert_result):
    coll = MagicMock()
    coll.count.return_value = 2
    coll.get.side_effect = [{"ids": ["1", "2"], "documents": ["a", "b"], "metadatas": [{}, {}]}]
    vdb = MagicMock()
    vdb.get_collection.return_value = coll
    pruned = []
    monkeypatch.setattr(lb.lexical_index, "count_rows", lambda _n: 2)
    monkeypatch.setattr(lb.lexical_index, "count_outdated_rows", lambda _n: 2)
    monkeypatch.setattr(lb.lexical_index, "upsert_chunks", lambda _c, ids, _d, _m: upsert_result(ids))
    monkeypatch.setattr(lb.lexical_index, "delete_outdated_rows", lambda c: pruned.append(c) or 0)
    monkeypatch.setattr(lb, "_PAGE_PAUSE_SECONDS", 0)
    return vdb, coll, pruned


def test_backfill_reindexes_outdated_rows_then_prunes_orphans(monkeypatch):
    vdb, coll, pruned = _reindex_setup(monkeypatch, lambda ids: len(ids))
    assert lb.backfill_collection("c", vdb=vdb) == 2
    assert pruned == ["c"]
    coll.upsert.assert_not_called()
    coll.delete.assert_not_called()


def test_backfill_keeps_old_rows_when_reindex_fails(monkeypatch):
    vdb, _coll, pruned = _reindex_setup(monkeypatch, lambda _ids: 0)
    assert lb.backfill_collection("c", vdb=vdb) == 0
    assert pruned == []


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
