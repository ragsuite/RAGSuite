"""Copy uploaded_documents.text_content and leftover staging files into MinIO."""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import List, Optional

from app.db import SessionLocal
from app.models import ConnectorDocument, UploadedDocument
from app.platform import blob_store
from app.platform.settings import settings

logger = logging.getLogger("blob_import")
PAGE = 50


def _log(message: str) -> None:
    print(f"[blob-import] {message}", flush=True)


def _read_bytes(path: Optional[str]) -> bytes:
    """Read a leftover staging file from the stored path or the migrate mount."""
    if path and os.path.isfile(path):
        return Path(path).read_bytes()
    if not path:
        return b""
    staging = Path(settings.document_staging_dir or "data/staging")
    alt = staging / Path(path).name
    if alt.is_file():
        return alt.read_bytes()
    return b""


def run_auto() -> int:
    if not blob_store.configured():
        _log("MINIO_ENDPOINT is not set; skip")
        return 0
    blob_store.get_client()
    db = SessionLocal()
    moved = 0
    try:
        offset = 0
        while True:
            rows = (
                db.query(UploadedDocument)
                .filter(UploadedDocument.storage_key.is_(None))
                .order_by(UploadedDocument.indexed_at)
                .offset(offset)
                .limit(PAGE)
                .all()
            )
            if not rows:
                break
            for doc in rows:
                raw = doc.text_content or b""
                if isinstance(raw, memoryview):
                    raw = raw.tobytes()
                content = bytes(raw) if raw else b""
                if not content:
                    link = (
                        db.query(ConnectorDocument)
                        .filter(ConnectorDocument.document_id == doc.id)
                        .first()
                    )
                    path = (link.staging_path if link else None) or None
                    content = _read_bytes(path)
                if not content:
                    continue
                key = blob_store.blob_key(doc.project_id, doc.id, doc.title or "blob")
                blob_store.put(key, content)
                doc.storage_key = key
                doc.text_content = None
                if link := db.query(ConnectorDocument).filter(ConnectorDocument.document_id == doc.id).first():
                    link.storage_key = key
                moved += 1
            db.commit()
            offset += len(rows)
        staging = Path(settings.document_staging_dir or "data/staging")
        if staging.is_dir():
            for path in staging.iterdir():
                if not path.is_file():
                    continue
                _log(f"left-over staging file {path.name} (already imported if a document row existed)")
        _log(f"moved {moved} document blob(s) to MinIO")
        return 0
    except Exception as exc:
        db.rollback()
        _log(f"ERROR: {exc}")
        logger.exception("blob import failed")
        return 1
    finally:
        db.close()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Import document blobs into MinIO")
    parser.add_argument("--auto", action="store_true")
    parser.parse_args(argv)
    logging.basicConfig(level=logging.WARNING)
    return run_auto()


if __name__ == "__main__":
    sys.exit(main())
