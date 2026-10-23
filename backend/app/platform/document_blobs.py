"""Load/save uploaded-document bytes via MinIO, with legacy DB/staging fallbacks."""
from __future__ import annotations

import logging
import os
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional

from sqlalchemy.orm import Session

from . import blob_store

logger = logging.getLogger(__name__)


def save_document_bytes(document, content: bytes, filename: str) -> str:
    """Write bytes to MinIO and set ``document.storage_key``. Does not commit."""
    key = blob_store.blob_key(document.project_id, document.id, filename)
    blob_store.put(key, content or b"")
    document.storage_key = key
    return key


def load_document_bytes(document, db: Optional[Session] = None) -> bytes:
    """MinIO first, then ``text_content``, then connector staging path."""
    key = getattr(document, "storage_key", None)
    if key:
        try:
            return blob_store.get(key)
        except Exception as exc:
            logger.warning("MinIO get failed for %s (%s): %s", getattr(document, "id", None), key, exc)

    raw = getattr(document, "text_content", None) or b""
    if isinstance(raw, memoryview):
        raw = raw.tobytes()
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    content = bytes(raw)
    if content:
        return content

    if db is None:
        return b""
    try:
        from app.models import ConnectorDocument

        link = (
            db.query(ConnectorDocument)
            .filter(ConnectorDocument.document_id == document.id)
            .first()
        )
        if link is None:
            return b""
        stored = getattr(link, "storage_key", None) or link.staging_path
        if stored and blob_store.configured() and "/" in str(stored) and not os.path.isfile(str(stored)):
            try:
                return blob_store.get(str(stored))
            except Exception:
                pass
        if stored and os.path.isfile(str(stored)):
            with open(stored, "rb") as fh:
                return fh.read()
    except Exception as exc:
        logger.warning("Could not recover document bytes for %s: %s", getattr(document, "id", None), exc)
    return b""


@contextmanager
def materialize_document_file(document, db: Optional[Session] = None, *, filename: str = "") -> Iterator[str]:
    """Yield a local temp path for extractors; source of truth stays MinIO."""
    content = load_document_bytes(document, db)
    suffix = Path(filename or getattr(document, "title", None) or "blob").suffix or ""
    fd, path = tempfile.mkstemp(prefix=f"rs-{document.id}-", suffix=suffix)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(content)
        yield path
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
