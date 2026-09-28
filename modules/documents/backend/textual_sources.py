"""Create / update / train Text and Q&A pair sources stored as ``UploadedDocument`` rows.

Saving never trains: rows are stored as ``Not Trained`` and training is started
explicitly through ``train_textual_document``.
"""
from __future__ import annotations

import hashlib
import os
import re
import uuid
from typing import List, Optional

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.models import UploadedDocument, User
from app.services.audit_service import emit_audit
from app.services.textual_sources import (
    NOT_TRAINED_STATUS,
    QA_EXT,
    QA_MIME,
    QA_SOURCE_LABEL,
    TEXT_EXT,
    TEXT_MIME,
    TEXT_SOURCE_LABEL,
    serialize_qa_pairs,
    staging_ext_for_mime,
)

from .upload_helpers import (
    enforce_ingest_queue_caps,
    ingest_save_path,
    prepare_ingest_dirs,
    resolve_upload_project_id,
    run_document_ingest,
)

MAX_TEXT_CHARS = 200_000
MAX_QA_PAIRS = 200
MAX_QUESTION_CHARS = 500
MAX_ANSWER_CHARS = 4000
MAX_TITLE_CHARS = 255
MAX_DESCRIPTION_CHARS = 2000

_BUSY_STATUSES = frozenset({"Queued", "Extracting", "Indexing"})
_SAVED_MESSAGE = "Source saved. Train it when you're ready."


def _required_text(value: str, field: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise ValueError(f"{field} is required")
    return cleaned


class _TextualSourceBase(BaseModel):
    title: str = Field(..., max_length=MAX_TITLE_CHARS)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_CHARS)
    language: str = Field("en", max_length=16)
    project_id: Optional[uuid.UUID] = None

    @field_validator("title")
    @classmethod
    def _title_required(cls, value: str) -> str:
        return _required_text(value, "Name")

    @field_validator("description")
    @classmethod
    def _description_clean(cls, value: Optional[str]) -> Optional[str]:
        cleaned = (value or "").strip()
        return cleaned or None


class TextSourceIn(_TextualSourceBase):
    content: str = Field(..., max_length=MAX_TEXT_CHARS)

    @field_validator("content")
    @classmethod
    def _content_required(cls, value: str) -> str:
        return _required_text(value, "Text content")


class QaPairIn(BaseModel):
    question: str = Field(..., max_length=MAX_QUESTION_CHARS)
    answer: str = Field(..., max_length=MAX_ANSWER_CHARS)

    @field_validator("question")
    @classmethod
    def _question_required(cls, value: str) -> str:
        return _required_text(value, "Question")

    @field_validator("answer")
    @classmethod
    def _answer_required(cls, value: str) -> str:
        return _required_text(value, "Answer")


class QaSourceIn(_TextualSourceBase):
    pairs: List[QaPairIn] = Field(..., min_length=1, max_length=MAX_QA_PAIRS)


class TextualSourceResponse(BaseModel):
    id: str
    status: str
    message: str


class _Payload:
    def __init__(self, source: str, mime: str, ext: str, content: bytes) -> None:
        self.source = source
        self.mime = mime
        self.ext = ext
        self.content = content


def text_payload(body: TextSourceIn) -> _Payload:
    return _Payload(TEXT_SOURCE_LABEL, TEXT_MIME, TEXT_EXT, body.content.encode("utf-8"))


def qa_payload(body: QaSourceIn) -> _Payload:
    raw = serialize_qa_pairs([p.model_dump() for p in body.pairs])
    return _Payload(QA_SOURCE_LABEL, QA_MIME, QA_EXT, raw)


def _checksum(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:12]


def _staging_name(title: str, ext: str) -> str:
    slug = re.sub(r"[^\w\-]+", "_", title)[:60].strip("_") or "source"
    return f"{slug}{ext}"


def _audit(request: Request, user: User, document: UploadedDocument, event_type: str, summary: str) -> None:
    emit_audit(
        event_type=event_type,
        request=request,
        user_id=user.id,
        project_id=document.project_id,
        resource_type="document",
        resource_id=str(document.id),
        summary=summary,
        details={"status": document.status, "chunks": document.chunks},
    )


def _apply_content(document: UploadedDocument, payload: _Payload) -> None:
    document.text_content = payload.content
    document.type = payload.mime
    document.source = payload.source
    document.checksum = _checksum(payload.content)
    document.size_kb = round(len(payload.content) / 1024)


def _load_owned_source(db: Session, user: User, document_id: str, source_label: str) -> UploadedDocument:
    try:
        doc_uuid = uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Source not found.")
    document = db.query(UploadedDocument).filter(
        UploadedDocument.id == doc_uuid,
        UploadedDocument.user_id == user.id,
        UploadedDocument.source == source_label,
    ).first()
    if not document:
        raise HTTPException(status_code=404, detail="Source not found.")
    if document.status in _BUSY_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="This source is still training. Wait until it finishes.",
        )
    return document


def create_textual_document(
    db: Session,
    request: Request,
    current_user: User,
    body: _TextualSourceBase,
    payload: _Payload,
) -> TextualSourceResponse:
    project_id = resolve_upload_project_id(db, current_user, body.project_id)
    document = UploadedDocument(
        id=uuid.uuid4(),
        user_id=current_user.id,
        project_id=project_id,
        title=body.title,
        description=body.description,
        language=body.language,
        status=NOT_TRAINED_STATUS,
        chunks=0,
    )
    _apply_content(document, payload)
    db.add(document)
    db.commit()
    db.refresh(document)
    _audit(request, current_user, document, "document.uploaded", f"{payload.source} source saved: {document.title}")
    return TextualSourceResponse(id=str(document.id), status=document.status, message=_SAVED_MESSAGE)


def update_textual_document(
    db: Session,
    request: Request,
    current_user: User,
    document_id: str,
    body: _TextualSourceBase,
    payload: _Payload,
) -> TextualSourceResponse:
    document = _load_owned_source(db, current_user, document_id, payload.source)
    training_input_changed = (
        document.checksum != _checksum(payload.content)
        or (document.language or "") != body.language
        or document.type != payload.mime
    )
    document.title = body.title
    document.description = body.description
    document.language = body.language
    _apply_content(document, payload)
    if training_input_changed:
        # Existing vectors keep answering until the user retrains.
        document.status = NOT_TRAINED_STATUS
    db.commit()
    db.refresh(document)
    _audit(request, current_user, document, "document.updated", f"{payload.source} source saved: {document.title}")
    return TextualSourceResponse(id=str(document.id), status=document.status, message=_SAVED_MESSAGE)


async def train_textual_document(
    db: Session,
    request: Request,
    current_user: User,
    document_id: str,
    source_label: str,
) -> TextualSourceResponse:
    document = _load_owned_source(db, current_user, document_id, source_label)
    ext = staging_ext_for_mime(document.type)
    content = bytes(document.text_content or b"")
    if not ext or not content.strip():
        raise HTTPException(status_code=400, detail="This source has no content to train.")

    async_ingest = prepare_ingest_dirs()
    enforce_ingest_queue_caps(db, current_user, document.project_id, async_ingest=async_ingest)
    document.status = "Queued"
    db.commit()
    db.refresh(document)

    save_path = ingest_save_path(async_ingest, str(document.id), _staging_name(document.title, ext))
    with open(save_path, "wb") as fh:
        fh.write(content)
    keep_staging = False
    try:
        outcome = await run_document_ingest(
            db,
            document=document,
            save_path=save_path,
            user_id=current_user.id,
            project_id=document.project_id,
            title=document.title,
            async_ingest=async_ingest,
        )
        keep_staging = outcome.keep_staging_file
    except Exception:
        db.rollback()
        if document.status in _BUSY_STATUSES:
            document.status = "Indexing Failed"
            db.commit()
        raise
    finally:
        if not keep_staging and os.path.exists(save_path):
            os.remove(save_path)

    _audit(request, current_user, document, "document.trained", f"{source_label} source training started: {document.title}")
    return TextualSourceResponse(id=str(document.id), status=outcome.doc_status, message=outcome.message)
