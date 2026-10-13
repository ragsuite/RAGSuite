"""Site-info chunk lookup: cached ids, scoped query, disabled sources dropped, fail open."""
import pytest

from app.services.rag import info_pages, kb_generation, scoped_query, source_availability

PID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    info_pages.invalidate()
    monkeypatch.setattr(kb_generation, "current", lambda: "g1")
    monkeypatch.setattr(source_availability, "disabled_source_ids", lambda _pid: frozenset())
    yield
    info_pages.invalidate()


def test_ids_are_cached_until_generation_changes(monkeypatch):
    calls = []
    monkeypatch.setattr(info_pages, "_load", lambda pid: calls.append(pid) or ("d1",))
    assert info_pages.info_document_ids(PID) == ("d1",)
    assert info_pages.info_document_ids(PID) == ("d1",)
    assert len(calls) == 1


def test_load_failure_fails_open(monkeypatch):
    def _boom(_pid):
        raise RuntimeError("db down")

    monkeypatch.setattr(info_pages, "_load", _boom)
    assert info_pages.info_document_ids(PID) == ()
    assert info_pages.nearest_info_chunks(object(), [0.1], PID, collection_name="c") == []


def test_nearest_chunks_scope_to_info_documents_and_drop_disabled(monkeypatch):
    monkeypatch.setattr(info_pages, "_load", lambda pid: ("d1", "d2"))
    seen = {}

    def _query(vdb, embedding, where, *, top_k, collection_name):
        seen["where"] = where
        metas = [
            {"url": "https://s.example/pages/faqs", "crawl_source_id": "ok"},
            {"url": "https://s.example/pages/terms", "crawl_source_id": "off"},
        ]
        return ["faq", "terms"], ["d1", "d2"], metas, [0.2, 0.3]

    monkeypatch.setattr(scoped_query, "query_where", _query)
    monkeypatch.setattr(source_availability, "disabled_source_ids", lambda _pid: frozenset({"off"}))
    entries = info_pages.nearest_info_chunks(object(), [0.1], PID, collection_name="c")
    assert seen["where"] == {"$and": [{"document_id": {"$in": ["d1", "d2"]}}, {"project_id": PID}]}
    assert [e["doc"] for e in entries] == ["faq"]


def test_no_project_or_vector_returns_nothing():
    assert info_pages.nearest_info_chunks(object(), None, PID, collection_name="c") == []
    assert info_pages.nearest_info_chunks(object(), [0.1], None, collection_name="c") == []
