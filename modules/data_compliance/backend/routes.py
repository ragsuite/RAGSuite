"""Compliance API — deletion receipts. Retention policies live in Enterprise ``compliance``."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.auth import require_org_admin
from app.db import get_db
from app.models import DeletionReceipt, User
from app.services.data_lifecycle_service import resolve_org_id_for_user

router = APIRouter(prefix="/api/v1/compliance", tags=["Compliance"])


class DeletionReceiptOut(BaseModel):
    id: uuid.UUID
    org_id: int
    project_id: Optional[uuid.UUID] = None
    trigger_type: str
    initiated_by_user_id: Optional[int] = None
    initiated_at: datetime
    completed_at: Optional[datetime] = None
    status: str
    summary: str
    manifest: dict

    class Config:
        from_attributes = True


class DeletionReceiptListOut(BaseModel):
    items: List[DeletionReceiptOut]
    total: int


@router.get("/deletion-receipts", response_model=DeletionReceiptListOut)
def list_deletion_receipts(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    trigger_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin),
):
    org_id = resolve_org_id_for_user(db, current_user)
    base = db.query(DeletionReceipt).filter(DeletionReceipt.org_id == org_id)
    if trigger_type:
        base = base.filter(DeletionReceipt.trigger_type == trigger_type)
    total = base.count()
    rows = (
        base.order_by(desc(DeletionReceipt.initiated_at))
        .offset(offset)
        .limit(limit)
        .all()
    )
    return DeletionReceiptListOut(
        items=[DeletionReceiptOut.model_validate(r) for r in rows],
        total=total,
    )


@router.get("/deletion-receipts/{receipt_id}", response_model=DeletionReceiptOut)
def get_deletion_receipt(
    receipt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin),
):
    org_id = resolve_org_id_for_user(db, current_user)
    row = (
        db.query(DeletionReceipt)
        .filter(DeletionReceipt.id == receipt_id, DeletionReceipt.org_id == org_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Deletion receipt not found")
    return DeletionReceiptOut.model_validate(row)
