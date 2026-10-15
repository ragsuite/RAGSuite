"""Chroma ``where`` -> SQL translation (pure unit tests; no database)."""
from __future__ import annotations

import json

import pytest

from app.services.rag.vector_store.filters import FilterError, build_where, promoted_values


def test_empty_filter_matches_everything():
    assert build_where(None) == ("TRUE", {})
    assert build_where({}) == ("TRUE", {})


def test_promoted_string_key_uses_typed_column():
    sql, params = build_where({"project_id": "p1"})
    assert sql == "project_id = :w0"
    assert params == {"w0": "p1"}


def test_promoted_int_key_uses_typed_column_only_for_ints():
    sql, params = build_where({"user_id": 7})
    assert sql == "user_id = :w0" and params == {"w0": 7}
    # bool is not an int for Chroma metadata: falls back to type-exact jsonb.
    sql, params = build_where({"user_id": True})
    assert "metadata -> 'user_id'" in sql
    assert params == {"w0": "true"}


def test_type_mismatch_on_promoted_key_falls_back_to_jsonb():
    sql, params = build_where({"project_id": 5})
    assert sql == "(metadata -> 'project_id') = CAST(:w0 AS jsonb)"
    assert json.loads(params["w0"]) == 5


def test_unpromoted_key_is_type_exact_jsonb_with_literal_key():
    sql, params = build_where({"crawl_source_id": "abc"})
    assert sql == "(metadata -> 'crawl_source_id') = CAST(:w0 AS jsonb)"
    assert json.loads(params["w0"]) == "abc"


def test_unsafe_key_is_bound_not_inlined():
    sql, params = build_where({"we'ird key": 1})
    assert "we'ird" not in sql
    assert "we'ird key" in params.values()


def test_in_and_nin_on_promoted_column():
    sql, params = build_where({"document_id": {"$in": ["a", "b"]}})
    assert sql == "document_id = ANY(:w0)" and params["w0"] == ["a", "b"]
    sql, _ = build_where({"source_file": {"$nin": ["x"]}})
    # Rows without the key still match $nin (Chroma semantics).
    assert sql == "(NOT (source_file IS NOT NULL) OR NOT source_file = ANY(:w0))"


def test_empty_in_and_nin():
    assert build_where({"document_id": {"$in": []}})[0] == "FALSE"
    assert build_where({"document_id": {"$nin": []}})[0] == "TRUE"


def test_in_on_jsonb_key_ors_type_exact_matches():
    sql, params = build_where({"lang": {"$in": ["en", "de"]}})
    assert sql.count("metadata -> 'lang'") == 2 and " OR " in sql
    assert sorted(json.loads(v) for v in params.values()) == ["de", "en"]


def test_ne_matches_rows_missing_the_key():
    sql, _ = build_where({"lang": {"$ne": "en"}})
    assert sql.startswith("(NOT (metadata ? 'lang') OR NOT (")


def test_numeric_comparisons():
    sql, params = build_where({"chunk_index": {"$gte": 3}})
    assert "jsonb_typeof(metadata -> 'chunk_index') = 'number'" in sql
    assert ">=" in sql and params["w0"] == 3.0
    sql, _ = build_where({"user_id": {"$lt": 10}})
    assert sql == "user_id < :w0"


def test_comparison_requires_a_number():
    with pytest.raises(FilterError):
        build_where({"chunk_index": {"$gt": "3"}})
    with pytest.raises(FilterError):
        build_where({"chunk_index": {"$gt": True}})


def test_nested_logical_operators():
    sql, params = build_where(
        {"$and": [{"project_id": "p"}, {"$or": [{"document_id": "d1"}, {"source_file": "f"}]}]}
    )
    assert sql == "(project_id = :w0 AND (document_id = :w1 OR source_file = :w2))"
    assert params == {"w0": "p", "w1": "d1", "w2": "f"}


def test_empty_logical_lists():
    assert build_where({"$and": []})[0] == "TRUE"
    assert build_where({"$or": []})[0] == "FALSE"


def test_multiple_top_level_keys_are_anded():
    sql, _ = build_where({"project_id": "p", "user_id": 1})
    assert sql == "(project_id = :w0 AND user_id = :w1)"


def test_unsupported_operators_raise():
    with pytest.raises(FilterError):
        build_where({"$not": [{"a": 1}]})
    with pytest.raises(FilterError):
        build_where({"a": {"$contains": "x"}})


def test_promoted_values_keep_only_matching_types():
    assert promoted_values({"project_id": "p", "user_id": 3, "document_id": 9, "source_file": None}) == {
        "project_id": "p",
        "document_id": None,
        "source_file": None,
        "user_id": 3,
    }
    assert promoted_values({"user_id": True})["user_id"] is None
    assert promoted_values({}) == {k: None for k in ("project_id", "document_id", "source_file", "user_id")}
