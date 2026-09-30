"""Separate site header / footer indexing: extraction, dedupe, documents, cleanup, migration."""
from __future__ import annotations

import importlib.util
import threading
import uuid
from pathlib import Path
from types import SimpleNamespace

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from bs4 import BeautifulSoup

from app.models import CrawlSource
from app.schemas import CrawlSourceCreate, CrawlSourceOut, CrawlSourceUpdate
from app.services import site_chrome_blocks as scb

MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "m3n4o5p6q7r8_add_site_header_footer_indexing.py"
)

HEADER_TEXT = "Acme Corp Products Pricing Support Contact"
FOOTER_TEXT = "Copyright 2026 Acme Corp. All rights reserved. Privacy Terms"


def _page(body: str, header: str = HEADER_TEXT, footer: str = FOOTER_TEXT) -> BeautifulSoup:
    return BeautifulSoup(
        f"""<html><body>
        <header><a href="/pricing">{header}</a></header>
        <main><article><header><h1>Article title</h1></header><p>{body}</p></article></main>
        <footer><a href="/privacy">{footer}</a></footer>
        </body></html>""",
        "html.parser",
    )


# --- extraction --------------------------------------------------------------


def test_extracts_only_wanted_kinds_but_always_strips_both():
    soup = _page("Main body text")
    result = scb.extract_site_blocks(soup, want_header=True, want_footer=False)

    assert set(result.blocks) == {scb.SITE_HEADER}
    assert HEADER_TEXT in result.blocks[scb.SITE_HEADER]
    page_text = soup.get_text(" ")
    assert HEADER_TEXT not in page_text
    assert FOOTER_TEXT not in page_text
    assert "Main body text" in page_text


def test_content_level_header_inside_article_is_kept_in_page():
    soup = _page("Main body text")
    scb.extract_site_blocks(soup, want_header=True, want_footer=True)
    assert "Article title" in soup.get_text(" ")


def test_detached_links_remain_discoverable():
    soup = _page("Body")
    result = scb.extract_site_blocks(soup, want_header=False, want_footer=False)

    assert result.blocks == {}
    assert [a["href"] for a in result.detached_links(scb.SITE_HEADER)] == ["/pricing"]
    assert [a["href"] for a in result.detached_links(scb.SITE_FOOTER)] == ["/privacy"]


def test_fallback_selectors_used_without_semantic_tags():
    soup = BeautifulSoup(
        f'<div id="masthead">{HEADER_TEXT}</div><p>Body</p><div class="site-footer">{FOOTER_TEXT}</div>',
        "html.parser",
    )
    result = scb.extract_site_blocks(soup, want_header=True, want_footer=True)
    assert set(result.blocks) == {scb.SITE_HEADER, scb.SITE_FOOTER}
    assert soup.get_text(" ").strip() == "Body"


def test_tiny_blocks_are_ignored():
    soup = _page("Body", header="Hi", footer="©")
    result = scb.extract_site_blocks(soup, want_header=True, want_footer=True)
    assert result.blocks == {}


# --- registry ----------------------------------------------------------------


def test_registry_claims_each_unique_block_once():
    registry = scb.SiteBlockRegistry({scb.SITE_HEADER, scb.SITE_FOOTER})

    first = registry.claim(scb.SITE_HEADER, HEADER_TEXT, "https://acme.test/a")
    assert first is not None and first.first_seen_url == "https://acme.test/a"
    assert registry.claim(scb.SITE_HEADER, f"  {HEADER_TEXT.upper()}  ", "https://acme.test/b") is None
    assert registry.claim(scb.SITE_HEADER, HEADER_TEXT + " Blog", "https://acme.test/c") is not None
    assert registry.claim(scb.SITE_FOOTER, FOOTER_TEXT, "https://acme.test/a") is not None
    assert len(registry.seen_hashes(scb.SITE_HEADER)) == 2
    assert len(registry.seen_hashes(scb.SITE_FOOTER)) == 1


def test_registry_ignores_disabled_kinds():
    registry = scb.SiteBlockRegistry({scb.SITE_FOOTER})
    assert registry.claim(scb.SITE_HEADER, HEADER_TEXT, "https://acme.test/") is None
    assert registry.seen_hashes(scb.SITE_HEADER) == set()


def test_registry_is_thread_safe():
    registry = scb.SiteBlockRegistry({scb.SITE_HEADER})
    claimed: list = []

    def worker(i: int):
        if registry.claim(scb.SITE_HEADER, HEADER_TEXT, f"https://acme.test/{i}"):
            claimed.append(i)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(32)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(claimed) == 1


# --- documents ---------------------------------------------------------------


def test_block_document_shape_and_display_url():
    registry = scb.SiteBlockRegistry({scb.SITE_FOOTER})
    block = registry.claim(scb.SITE_FOOTER, FOOTER_TEXT, "https://acme.test/about")
    source_id = uuid.uuid4()

    doc = scb.build_site_block_document(source_id, block)

    assert doc["source_id"] == source_id
    assert doc["url"] == f"https://acme.test/#site-footer-{block.content_hash[:16]}"
    assert doc["title"] == "Site footer · acme.test"
    assert doc["text_content"] == FOOTER_TEXT
    assert doc["meta_data"]["content_kind"] == scb.SITE_FOOTER
    assert doc["meta_data"]["content_hash"] == block.content_hash
    orm_like = SimpleNamespace(url=doc["url"], meta_data=doc["meta_data"])
    assert scb.is_site_block_document(orm_like)
    assert scb.site_block_display_url(orm_like) == "https://acme.test/about"


def test_page_document_display_url_is_unchanged():
    page = SimpleNamespace(url="https://acme.test/page", meta_data={"crawled_at": "x"})
    assert not scb.is_site_block_document(page)
    assert scb.site_block_display_url(page) == "https://acme.test/page"


# --- cleanup -----------------------------------------------------------------


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

    def commit(self):
        self.commits += 1


def _block_doc(kind: str, content_hash: str):
    return SimpleNamespace(
        id=uuid.uuid4(), url="u", meta_data={"content_kind": kind, "content_hash": content_hash}
    )


def test_prune_removes_disabled_and_unseen_blocks(monkeypatch):
    vector_deletes: list = []
    monkeypatch.setattr(
        "app.services.rag.singleton.locked_delete_document_embeddings",
        lambda doc_id: vector_deletes.append(doc_id),
    )
    registry = scb.SiteBlockRegistry({scb.SITE_HEADER})
    current = registry.claim(scb.SITE_HEADER, HEADER_TEXT, "https://acme.test/")
    keep = _block_doc(scb.SITE_HEADER, current.content_hash)
    stale_header = _block_doc(scb.SITE_HEADER, "old-hash")
    disabled_footer = _block_doc(scb.SITE_FOOTER, "any")
    db = _FakeDB([keep, stale_header, disabled_footer])

    removed = scb.prune_stale_site_block_documents(db, uuid.uuid4(), registry)

    assert removed == 2
    assert {d.id for d in db.deleted} == {stale_header.id, disabled_footer.id}
    assert set(vector_deletes) == {str(stale_header.id), str(disabled_footer.id)}


def test_prune_keeps_enabled_kind_when_nothing_was_seen(monkeypatch):
    monkeypatch.setattr("app.services.rag.singleton.locked_delete_document_embeddings", lambda _id: None)
    registry = scb.SiteBlockRegistry({scb.SITE_HEADER})
    db = _FakeDB([_block_doc(scb.SITE_HEADER, "previous")])

    assert scb.prune_stale_site_block_documents(db, uuid.uuid4(), registry) == 0
    assert db.deleted == []


def test_prune_keeps_row_when_vector_delete_fails(monkeypatch):
    def boom(_doc_id):
        raise RuntimeError("chroma down")

    monkeypatch.setattr("app.services.rag.singleton.locked_delete_document_embeddings", boom)
    registry = scb.SiteBlockRegistry(set())
    db = _FakeDB([_block_doc(scb.SITE_FOOTER, "x")])

    assert scb.prune_stale_site_block_documents(db, uuid.uuid4(), registry) == 0
    assert db.deleted == []


# --- page counts -------------------------------------------------------------


def test_page_counts_exclude_site_blocks():
    from sqlalchemy.orm import sessionmaker

    from app.models import Document
    from app.services.crawl_ingest_helpers import (
        batch_document_counts_by_source_ids,
        reconcile_source_documents_count,
    )

    engine = sa.create_engine("sqlite://")
    Document.__table__.create(engine)
    db = sessionmaker(bind=engine)()
    source_id = uuid.uuid4()
    registry = scb.SiteBlockRegistry({scb.SITE_HEADER, scb.SITE_FOOTER})
    blocks = [
        registry.claim(scb.SITE_HEADER, HEADER_TEXT, "https://acme.test/"),
        registry.claim(scb.SITE_FOOTER, FOOTER_TEXT, "https://acme.test/"),
    ]
    for block in blocks:
        db.add(Document(**scb.build_site_block_document(source_id, block)))
    db.add(Document(id=uuid.uuid4(), source_id=source_id, url="https://acme.test/a", meta_data={"x": 1}))
    db.add(Document(id=uuid.uuid4(), source_id=source_id, url="https://acme.test/b", meta_data=None))
    db.commit()

    source = SimpleNamespace(id=source_id, documents_count=0)
    assert reconcile_source_documents_count(db, source) == 2
    assert source.documents_count == 2
    assert batch_document_counts_by_source_ids(db, [source_id]) == {source_id: 2}
    assert db.query(Document).filter(scb.site_block_document_clause()).count() == 2


def test_count_site_block_payloads():
    registry = scb.SiteBlockRegistry({scb.SITE_HEADER})
    block = registry.claim(scb.SITE_HEADER, HEADER_TEXT, "https://acme.test/")
    docs = [scb.build_site_block_document(uuid.uuid4(), block), {"meta_data": {}}, {"meta_data": None}]
    assert scb.count_site_block_payloads(docs) == 1


# --- model / schemas / migration --------------------------------------------


def test_model_and_schema_defaults_are_off():
    for column in ("index_site_header", "index_site_footer"):
        col = CrawlSource.__table__.c[column]
        assert col.nullable is False
        assert col.server_default is not None
        assert CrawlSourceOut.model_fields[column].default is False
        assert CrawlSourceUpdate.model_fields[column].default is None
    data = CrawlSourceCreate(name="Docs", base_url="https://example.com")
    assert data.index_site_header is False and data.index_site_footer is False


def _load_migration():
    spec = importlib.util.spec_from_file_location("site_chrome_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_migration_chain():
    module = _load_migration()
    assert module.revision == "m3n4o5p6q7r8"
    assert module.down_revision == "l2m3n4o5p6q7"


def test_migration_backfills_from_skip_header_footer_and_downgrades():
    module = _load_migration()
    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE crawl_sources (id INTEGER PRIMARY KEY, skip_header_footer BOOLEAN)"))
        conn.execute(sa.text("INSERT INTO crawl_sources VALUES (1, 1), (2, 0)"))
        module.op = Operations(MigrationContext.configure(conn))

        module.upgrade()
        rows = conn.execute(
            sa.text("SELECT id, index_site_header, index_site_footer FROM crawl_sources ORDER BY id")
        ).all()
        assert [tuple(r) for r in rows] == [(1, 0, 0), (2, 1, 1)]

        module.downgrade()
        cols = {c["name"] for c in sa.inspect(conn).get_columns("crawl_sources")}
        assert not cols & {"index_site_header", "index_site_footer"}
