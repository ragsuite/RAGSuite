"""Text and Q&A pair source endpoints (list/content/delete reuse the documents routes)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user_required
from app.db import get_db
from app.models import User
from app.services.textual_sources import QA_SOURCE_LABEL, TEXT_SOURCE_LABEL

from .textual_sources import (
    QaSourceIn,
    TextSourceIn,
    TextualSourceResponse,
    create_textual_document,
    qa_payload,
    text_payload,
    train_textual_document,
    update_textual_document,
)

router = APIRouter(prefix="/api/v1/documents", tags=["Documents"])


@router.post("/text", response_model=TextualSourceResponse, summary="Create a Text source (not trained yet)")
def create_text_source(
    body: TextSourceIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    return create_textual_document(db, request, current_user, body, text_payload(body))


@router.put("/text/{id}", response_model=TextualSourceResponse, summary="Update a Text source")
def update_text_source(
    id: str,
    body: TextSourceIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    return update_textual_document(db, request, current_user, id, body, text_payload(body))


@router.post("/text/{id}/train", response_model=TextualSourceResponse, summary="Train a Text source")
async def train_text_source(
    id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    return await train_textual_document(db, request, current_user, id, TEXT_SOURCE_LABEL)


@router.post("/qa-pairs", response_model=TextualSourceResponse, summary="Create a Q&A pairs source (not trained yet)")
def create_qa_source(
    body: QaSourceIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    return create_textual_document(db, request, current_user, body, qa_payload(body))


@router.put("/qa-pairs/{id}", response_model=TextualSourceResponse, summary="Update a Q&A pairs source")
def update_qa_source(
    id: str,
    body: QaSourceIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    return update_textual_document(db, request, current_user, id, body, qa_payload(body))


@router.post("/qa-pairs/{id}/train", response_model=TextualSourceResponse, summary="Train a Q&A pairs source")
async def train_qa_source(
    id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    return await train_textual_document(db, request, current_user, id, QA_SOURCE_LABEL)
