"""Persist catalog records per document and keep them in step with ``documents``."""
from __future__ import annotations

import logging
import uuid
from typing import Iterable, List, Optional

from sqlalchemy.orm import Session

from ...models import CatalogItem, Document
from .extract import EXTRACTOR_VERSION, ItemRecord, content_hash, extract_record
from .normalize import norm_name

logger = logging.getLogger(__name__)


def _as_uuid(value) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


def _apply(row: CatalogItem, rec: ItemRecord, *, doc: Document, project_id: str, source_id: str, digest: str) -> None:
    row.project_id = str(project_id)
    row.source_id = str(source_id)
    row.url = (doc.url or "")[:2048]
    row.name = rec.name[:512]
    row.name_norm = norm_name(rec.name)[:512]
    row.brand = (rec.brand or None) and rec.brand[:255]
    row.brand_norm = norm_name(rec.brand)[:255] if rec.brand else None
    row.category = (rec.category or None) and rec.category[:255]
    row.category_path = list(rec.category_path or [])[:8]
    row.identifiers = list(rec.identifiers or [])
    row.price = rec.price
    row.list_price = rec.list_price
    row.currency = (rec.currency or None) and rec.currency[:8]
    row.availability = (rec.availability or None) and rec.availability[:64]
    row.attributes = rec.attributes or {}
    row.variant_group = (rec.variant_group or None) and rec.variant_group[:255]
    row.method = rec.method
    row.confidence = float(rec.confidence)
    row.extractor_version = EXTRACTOR_VERSION
    row.content_hash = digest


def refresh_documents(
    db: Session,
    documents: Iterable[Document],
    *,
    project_id: str,
    source_id: str,
    force: bool = False,
    commit: bool = True,
) -> dict:
    """Extract (or drop) the record of each document; unchanged pages are skipped."""
    docs = [d for d in documents if d is not None]
    if not docs:
        return {"upserted": 0, "deleted": 0, "skipped": 0}
    existing = {
        row.document_id: row
        for row in db.query(CatalogItem).filter(CatalogItem.document_id.in_([_as_uuid(d.id) for d in docs])).all()
    }
    stats = {"upserted": 0, "deleted": 0, "skipped": 0}
    for doc in docs:
        doc_id = _as_uuid(doc.id)
        digest = content_hash(doc.title or "", doc.text_content or "")
        row = existing.get(doc_id)
        if (
            not force
            and row is not None
            and row.content_hash == digest
            and row.extractor_version == EXTRACTOR_VERSION
        ):
            stats["skipped"] += 1
            continue
        try:
            rec = extract_record(doc.title or "", doc.text_content or "", doc.meta_data or {})
        except Exception as exc:
            logger.warning("catalog extract failed doc=%s: %s", doc.id, exc)
            rec = None
        if rec is None:
            if row is not None:
                db.delete(row)
                stats["deleted"] += 1
            continue
        if row is None:
            row = CatalogItem(id=uuid.uuid4(), document_id=doc_id)
            db.add(row)
        _apply(row, rec, doc=doc, project_id=project_id, source_id=source_id, digest=digest)
        stats["upserted"] += 1
    if commit:
        db.commit()
    return stats


def apply_model_fill(db: Session, document_id: str, fields: dict) -> bool:
    """Fill gaps of one record with model-extracted values (never overwrites page values)."""
    row = db.query(CatalogItem).filter(CatalogItem.document_id == _as_uuid(document_id)).first()
    if row is None:
        return False
    changed = False
    for key in ("brand", "category", "price", "list_price", "currency"):
        value = fields.get(key)
        if value in (None, "") or getattr(row, key) not in (None, ""):
            continue
        setattr(row, key, value)
        changed = True
    if changed and fields.get("brand"):
        row.brand_norm = norm_name(fields["brand"])[:255]
    if changed:
        row.method = "llm" if row.method == "text" else row.method
    return changed


def delete_for_source(db: Session, source_id: str) -> int:
    return db.query(CatalogItem).filter(CatalogItem.source_id == str(source_id)).delete(synchronize_session=False)


def project_items(db: Session, project_id: str) -> List[CatalogItem]:
    return db.query(CatalogItem).filter(CatalogItem.project_id == str(project_id)).all()


def project_fingerprint(db: Session, project_id: str) -> Optional[tuple]:
    from sqlalchemy import func

    row = (
        db.query(func.count(CatalogItem.id), func.max(CatalogItem.updated_at))
        .filter(CatalogItem.project_id == str(project_id))
        .first()
    )
    return (int(row[0] or 0), str(row[1] or "")) if row else None
