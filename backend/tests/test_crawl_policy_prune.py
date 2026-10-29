"""Deny/allowlist prune on retrain: drop matching documents and their vectors."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

from app.services import crawl_policy_prune as cpp
from app.services.crawler import _url_skipped_by_source_policy


class _Query:
    def __init__(self, docs):
        self._docs = docs

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return list(self._docs)


class _FakeDB:
    def __init__(self, docs):
        self.docs = docs
        self.deleted: list = []
        self.commits = 0

    def query(self, model):
        return _Query(self.docs)

    def delete(self, doc):
        self.deleted.append(doc)
        self.docs = [d for d in self.docs if d is not doc]

    def commit(self):
        self.commits += 1


def _page(url: str):
    return SimpleNamespace(id=uuid.uuid4(), url=url, text_content="body")


def _source(*, denylist=None, allowlist=None, base_url="https://example.com/"):
    return SimpleNamespace(
        base_url=base_url,
        denylist=denylist or [],
        allowlist=allowlist or [],
    )


def test_denied_url_vectors_and_row_are_dropped(monkeypatch):
    vector_deletes: list = []
    monkeypatch.setattr(
        "app.services.rag.singleton.locked_delete_document_embeddings",
        lambda doc_id: vector_deletes.append(doc_id),
    )
    monkeypatch.setattr("app.services.rag.singleton.get_pipeline", lambda: None)

    denied = _page("https://docs.example.com/guide")
    kept = _page("https://example.com/about")
    db = _FakeDB([denied, kept])
    source = _source(denylist=["https://docs.example.com/*"])

    removed = cpp.prune_policy_skipped_documents(
        db,
        uuid.uuid4(),
        lambda url: _url_skipped_by_source_policy(url, source),
    )

    assert removed == 1
    assert db.deleted == [denied]
    assert vector_deletes == [str(denied.id)]
    assert db.commits == 1
    assert kept not in db.deleted


def test_allowed_url_is_kept_when_denylist_empty(monkeypatch):
    vector_deletes: list = []
    monkeypatch.setattr(
        "app.services.rag.singleton.locked_delete_document_embeddings",
        lambda doc_id: vector_deletes.append(doc_id),
    )
    page = _page("https://docs.example.com/guide")
    db = _FakeDB([page])
    source = _source(denylist=[])

    removed = cpp.prune_policy_skipped_documents(
        db,
        uuid.uuid4(),
        lambda url: _url_skipped_by_source_policy(url, source),
    )

    assert removed == 0
    assert db.deleted == []
    assert vector_deletes == []
    assert db.commits == 0


def test_allowlist_miss_is_dropped(monkeypatch):
    vector_deletes: list = []
    monkeypatch.setattr(
        "app.services.rag.singleton.locked_delete_document_embeddings",
        lambda doc_id: vector_deletes.append(doc_id),
    )
    monkeypatch.setattr("app.services.rag.singleton.get_pipeline", lambda: None)

    miss = _page("https://example.com/blog/post")
    kept = _page("https://example.com/docs/start")
    db = _FakeDB([miss, kept])
    source = _source(allowlist=["https://example.com/docs/*"])

    removed = cpp.prune_policy_skipped_documents(
        db,
        uuid.uuid4(),
        lambda url: _url_skipped_by_source_policy(url, source),
    )

    assert removed == 1
    assert db.deleted == [miss]
    assert vector_deletes == [str(miss.id)]
    assert kept not in db.deleted


def test_prune_keeps_row_when_vector_delete_fails(monkeypatch):
    def boom(_doc_id):
        raise RuntimeError("chroma down")

    monkeypatch.setattr("app.services.rag.singleton.locked_delete_document_embeddings", boom)
    denied = _page("https://docs.example.com/guide")
    db = _FakeDB([denied])
    source = _source(denylist=["https://docs.example.com/*"])

    removed = cpp.prune_policy_skipped_documents(
        db,
        uuid.uuid4(),
        lambda url: _url_skipped_by_source_policy(url, source),
    )

    assert removed == 0
    assert db.deleted == []
    assert db.commits == 1


def test_query_cache_cleared_after_prune(monkeypatch):
    class _Pipeline:
        def __init__(self):
            self.cleared = 0

        def clear_query_cache(self):
            self.cleared += 1

    pipeline = _Pipeline()
    monkeypatch.setattr(
        "app.services.rag.singleton.locked_delete_document_embeddings",
        lambda _id: None,
    )
    monkeypatch.setattr("app.services.rag.singleton.get_pipeline", lambda: pipeline)

    denied = _page("https://docs.example.com/guide")
    db = _FakeDB([denied])
    source = _source(denylist=["https://docs.example.com/*"])

    cpp.prune_policy_skipped_documents(
        db,
        uuid.uuid4(),
        lambda url: _url_skipped_by_source_policy(url, source),
    )

    assert pipeline.cleared == 1


def test_url_skipped_by_source_policy_matches_denylist_not_external():
    source = _source(
        base_url="https://example.com/",
        denylist=["https://docs.example.com/*"],
    )
    assert _url_skipped_by_source_policy("https://docs.example.com/ce-ee", source) is True
    assert _url_skipped_by_source_policy("https://example.com/about", source) is False
    assert _url_skipped_by_source_policy("https://m.facebook.com/share", source) is False


def test_url_skipped_by_origin_denylist_without_wildcard():
    source = _source(
        base_url="https://example.com/",
        denylist=["https://docs.example.com/"],
    )
    assert _url_skipped_by_source_policy("https://docs.example.com", source) is True
    assert _url_skipped_by_source_policy("https://docs.example.com/ce-ee", source) is True
    assert _url_skipped_by_source_policy("https://example.com/docs", source) is False


def test_ingest_skips_denied_urls(monkeypatch):
    from app.services.crawler import _ingest_crawl_documents_for_source

    chunked: list = []
    monkeypatch.setattr(
        "app.services.rag.utils_rag.ingest_chunks_for_crawled_document",
        lambda *args, **kwargs: chunked.append(args[0]) or (["chunk"], [{}]),
    )
    monkeypatch.setattr("app.services.crawler._refresh_catalog_records", lambda *a, **k: None)
    monkeypatch.setattr(
        "app.services.crawler._write_prepared_ingest_in_batches",
        lambda *a, **k: {"status": "Indexed", "chunks": 1, "collection": "c"},
    )
    monkeypatch.setattr(
        "app.services.rag.embedding_resolver.resolve_crawl_ingest_targets",
        lambda *a, **k: [
            SimpleNamespace(
                source="search",
                provider="openai",
                model="text-embedding-3-small",
                api_key="sk",
                collection="c",
            )
        ],
    )
    monkeypatch.setattr(
        "app.services.crawl_source_embedding.purge_stale_crawl_source_embedding_collections",
        lambda *a, **k: None,
    )

    monkeypatch.setattr(
        "app.services.rag.singleton.locked_delete_document_embeddings",
        lambda *a, **k: True,
    )

    source = _source(denylist=["https://docs.example.com/*"])
    source.id = uuid.uuid4()
    source.project_id = uuid.uuid4()
    source.created_by_id = 1
    source.ingest_embedding_target = "search"
    source.split_config = None
    source.source_type = "web"

    db = SimpleNamespace(get=lambda *a, **k: None)
    denied = _page("https://docs.example.com/guide")
    denied.title = "Docs"
    denied.meta_data = {}
    allowed = _page("https://example.com/about")
    allowed.title = "About"
    allowed.meta_data = {}

    _ingest_crawl_documents_for_source(db, source, [denied, allowed])

    assert chunked == ["https://example.com/about"]
