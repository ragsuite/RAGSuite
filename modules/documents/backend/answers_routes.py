"""Per-source "Use in answers" switch for Document, Text and Q&A Pairs sources.

Mounted under ``/api/v1/documents`` so documents write permission applies.
Switching never touches stored text, vectors or running jobs; it only changes what queries
may retrieve.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user_required
from app.db import get_db
from app.models import UploadedDocument, User
from app.services.audit_service import emit_audit
from app.services.rag import kb_generation, source_availability, source_routing
from app.services.document_training_progress import get_progress_map

from .upload_helpers import BUSY_INGEST_STATUSES

router = APIRouter(prefix="/api/v1/documents", tags=["Documents"])


class DocumentAnswersRequest(BaseModel):
    enabled: bool


class DocumentAnswersOut(BaseModel):
    document_id: UUID
    use_in_answers: bool


def _is_training(document: UploadedDocument) -> bool:
    if document.status in BUSY_INGEST_STATUSES:
        return True
    return str(document.id) in get_progress_map([str(document.id)])


@router.put("/{document_id}/answers", response_model=DocumentAnswersOut)
def set_document_use_in_answers(
    document_id: UUID,
    body: DocumentAnswersRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    document = (
        db.query(UploadedDocument)
        .filter(UploadedDocument.id == document_id, UploadedDocument.user_id == current_user.id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if (document.use_in_answers is not False) == body.enabled:
        return DocumentAnswersOut(document_id=document.id, use_in_answers=body.enabled)
    if _is_training(document):
        raise HTTPException(status_code=409, detail="Wait until training finishes or stop it first.")
    if (document.chunks or 0) <= 0:
        raise HTTPException(status_code=409, detail="This source has no trained content yet.")

    document.use_in_answers = body.enabled
    db.commit()

    project_id = str(document.project_id)
    kb_generation.bump()
    source_availability.invalidate(project_id)
    source_routing.invalidate(project_id)
    emit_audit(
        event_type="document.answers_enabled" if body.enabled else "document.answers_disabled",
        request=request,
        user_id=current_user.id,
        project_id=document.project_id,
        resource_type="document",
        resource_id=str(document.id),
        summary=f"Source {'included in' if body.enabled else 'excluded from'} answers: {document.title}",
    )
    return DocumentAnswersOut(document_id=document.id, use_in_answers=body.enabled)
