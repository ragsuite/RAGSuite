"""Records follow their pages: upsert, skip unchanged, drop when a page stops being an item."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, CatalogItem, CrawlSource, Document, Project, User
from app.services.catalog import backfill, index as catalog_index, store
from app.services.catalog.service import item_context_for

from tests.test_catalog_extract import LISTING_PAGE, PRODUCT_PAGE

TITLE = "Acme Nova 5G (Blue, 128 GB) Price in India"


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        catalog_index.invalidate()


@pytest.fixture()
def source(db):
    owner = User(username="o", email="o@example.com", hashed_password="x" * 60)
    db.add(owner)
    db.flush()
    project = Project(name="P", owner_id=owner.id)
    db.add(project)
    db.flush()
    src = CrawlSource(project_id=project.id, base_url="https://shop.example", name="Shop", depth=1, created_by_id=owner.id)
    db.add(src)
    db.commit()
    return src


def _doc(db, source, title, text):
    doc = Document(id=uuid.uuid4(), source_id=source.id, url=f"https://shop.example/{uuid.uuid4()}", title=title,
                   text_content=text, meta_data={})
    db.add(doc)
    db.commit()
    return doc


def test_refresh_upserts_skips_and_deletes(db, source):
    doc = _doc(db, source, TITLE, PRODUCT_PAGE)
    pid, sid = str(source.project_id), str(source.id)
    assert store.refresh_documents(db, [doc], project_id=pid, source_id=sid)["upserted"] == 1
    row = db.query(CatalogItem).one()
    assert (row.price, row.brand, row.category) == (13999.0, "Acme", "Mobiles")
    assert store.refresh_documents(db, [doc], project_id=pid, source_id=sid)["skipped"] == 1
    doc.title, doc.text_content = "Mobiles", LISTING_PAGE
    db.commit()
    assert store.refresh_documents(db, [doc], project_id=pid, source_id=sid)["deleted"] == 1
    assert db.query(CatalogItem).count() == 0


def test_model_fill_never_overwrites_page_values(db, source):
    doc = _doc(db, source, TITLE, PRODUCT_PAGE)
    store.refresh_documents(db, [doc], project_id=str(source.project_id), source_id=str(source.id))
    assert store.apply_model_fill(db, str(doc.id), {"price": 1.0, "brand": "Other"}) is False
    assert db.query(CatalogItem).one().price == 13999.0


def test_item_context_reads_project_index(db, source):
    doc = _doc(db, source, TITLE, PRODUCT_PAGE)
    store.refresh_documents(db, [doc], project_id=str(source.project_id), source_id=str(source.id))
    ctx = item_context_for(db, str(source.project_id), "cheapest mobile")
    assert ctx is not None and ctx.rows[0].document_id == str(doc.id)
    assert item_context_for(db, str(uuid.uuid4()), "cheapest mobile") is None


def test_backfill_job_builds_records(db, source, monkeypatch):
    _doc(db, source, TITLE, PRODUCT_PAGE)
    _doc(db, source, "Mobiles", LISTING_PAGE)
    monkeypatch.setattr("app.db.SessionLocal", sessionmaker(bind=db.get_bind()))
    monkeypatch.setattr(backfill, "_model_fill", lambda *a, **k: 0)
    totals = backfill.process_payload({"project_id": str(source.project_id), "source_id": str(source.id)})
    assert totals["upserted"] == 1
    assert db.query(CatalogItem).count() == 1
