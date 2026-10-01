"""Retrain uploaded documents through the ingest path so each keeps its own AI model."""
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user_required
from app.db import get_db
from app.models import UploadedDocument, User
from app.services.audit_service import emit_audit

from .upload_helpers import BUSY_INGEST_STATUSES, retrain_stored_document

router = APIRouter(prefix="/api/v1/documents", tags=["Documents"])

MAX_TRAIN_DOCUMENTS = 100


class DocumentTrainIn(BaseModel):
    document_ids: List[uuid.UUID] = Field(..., min_length=1, max_length=MAX_TRAIN_DOCUMENTS)


class DocumentTrainResult(BaseModel):
    id: str
    status: str
    message: str
    started: bool = False


@router.post(
    "/train",
    response_model=List[DocumentTrainResult],
    summary="Train or retrain documents with the AI model chosen for each",
)
async def train_documents(
    body: DocumentTrainIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
) -> List[DocumentTrainResult]:
    ids = list(dict.fromkeys(body.document_ids))
    docs = (
        db.query(UploadedDocument)
        .filter(UploadedDocument.id.in_(ids), UploadedDocument.user_id == current_user.id)
        .all()
    )
    if not docs:
        raise HTTPException(status_code=404, detail="No matching documents found.")

    results: List[DocumentTrainResult] = []
    for document in docs:
        if document.status in BUSY_INGEST_STATUSES:
            results.append(
                DocumentTrainResult(id=str(document.id), status=document.status, message="Already training.")
            )
            continue
        try:
            outcome = await retrain_stored_document(db, current_user, document)
        except HTTPException as exc:
            if exc.status_code == 429:
                raise
            results.append(
                DocumentTrainResult(id=str(document.id), status=document.status, message=str(exc.detail))
            )
            continue
        emit_audit(
            event_type="document.trained",
            request=request,
            user_id=current_user.id,
            project_id=document.project_id,
            resource_type="document",
            resource_id=str(document.id),
            summary=f"Document training started: {document.title}",
            details={"status": outcome.doc_status, "chunks": outcome.chunks_count},
        )
        results.append(
            DocumentTrainResult(
                id=str(document.id), status=outcome.doc_status, message=outcome.message, started=True
            )
        )
    return results
