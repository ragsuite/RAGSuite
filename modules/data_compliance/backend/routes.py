"""Compliance API — retention policy and deletion receipts."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.auth import get_current_user_required, require_org_admin
from app.db import get_db
from app.models import DeletionReceipt, Organization, User
from app.services.audit_service import emit_audit
from app.services.data_lifecycle_service import (
    RETENTION_DEFAULT_DAYS,
    RETENTION_MAX_DAYS,
    RETENTION_MIN_DAYS,
    clamp_retention_days,
    resolve_org_id_for_user,
)
from app.services.retention_preview_service import build_retention_preview
from fastapi import Request

router = APIRouter(prefix="/api/v1/compliance", tags=["Compliance"])


class RetentionEligibleCountsOut(BaseModel):
    chat_messages: int = 0
    query_logs: int = 0
    analytics_days: int = 0
    audit_events: int = 0


class RetentionPreviewOut(BaseModel):
    cutoff_at: Optional[datetime] = None
    eligible_counts: RetentionEligibleCountsOut = Field(default_factory=RetentionEligibleCountsOut)
    new_data_expires_at: Optional[datetime] = None
    days_until_new_data_expires: int = 0
    oldest_interaction_at: Optional[datetime] = None
    days_until_oldest_expires: Optional[int] = None
    next_purge_estimate_at: Optional[datetime] = None
    auto_delete_active: bool = False


class RetentionPolicyOut(BaseModel):
    auto_delete: bool
    retention_days: int
    retention_updated_at: Optional[datetime] = None
    retention_last_purge_at: Optional[datetime] = None
    min_days: int = RETENTION_MIN_DAYS
    max_days: int = RETENTION_MAX_DAYS
    default_days: int = RETENTION_DEFAULT_DAYS
    preview: RetentionPreviewOut = Field(default_factory=RetentionPreviewOut)


def _policy_response(db: Session, org: Organization) -> RetentionPolicyOut:
    days = clamp_retention_days(org.retention_days or RETENTION_DEFAULT_DAYS)
    preview_raw = build_retention_preview(db, org)
    return RetentionPolicyOut(
        auto_delete=bool(org.retention_auto_delete),
        retention_days=days,
        retention_updated_at=org.retention_updated_at,
        retention_last_purge_at=org.retention_last_purge_at,
        preview=RetentionPreviewOut(
            cutoff_at=preview_raw.get("cutoff_at"),
            eligible_counts=RetentionEligibleCountsOut(**preview_raw.get("eligible_counts", {})),
            new_data_expires_at=preview_raw.get("new_data_expires_at"),
            days_until_new_data_expires=int(preview_raw.get("days_until_new_data_expires") or 0),
            oldest_interaction_at=preview_raw.get("oldest_interaction_at"),
            days_until_oldest_expires=preview_raw.get("days_until_oldest_expires"),
            next_purge_estimate_at=preview_raw.get("next_purge_estimate_at"),
            auto_delete_active=bool(preview_raw.get("auto_delete_active")),
        ),
    )


class RetentionPolicyUpdate(BaseModel):
    auto_delete: bool
    retention_days: int = Field(ge=RETENTION_MIN_DAYS, le=RETENTION_MAX_DAYS)
    confirmation: Optional[str] = None


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


def _get_org_for_admin(db: Session, user: User) -> Organization:
    org_id = resolve_org_id_for_user(db, user)
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.get("/retention", response_model=RetentionPolicyOut)
async def get_retention_policy(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin),
):
    org = _get_org_for_admin(db, current_user)
    return _policy_response(db, org)


@router.put("/retention", response_model=RetentionPolicyOut)
async def update_retention_policy(
    payload: RetentionPolicyUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_org_admin),
):
    org = _get_org_for_admin(db, current_user)
    new_days = clamp_retention_days(payload.retention_days)
    old_days = clamp_retention_days(org.retention_days or RETENTION_DEFAULT_DAYS)

    if new_days < old_days and (payload.confirmation or "").strip().upper() != "DELETE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Shortening retention requires confirmation: type DELETE",
        )

    org.retention_auto_delete = bool(payload.auto_delete)
    org.retention_days = new_days
    org.retention_updated_at = datetime.now(timezone.utc)
    org.retention_updated_by = current_user.id
    db.commit()
    db.refresh(org)

    emit_audit(
        event_type="compliance.retention.updated",
        request=request,
        user_id=current_user.id,
        project_id=None,
        resource_type="retention_policy",
        resource_id=str(org.id),
        summary=f"Retention policy updated: auto_delete={org.retention_auto_delete}, days={new_days}",
        details={
            "auto_delete": org.retention_auto_delete,
            "retention_days": new_days,
            "previous_days": old_days,
        },
        db=db,
    )

    return _policy_response(db, org)


@router.get("/deletion-receipts", response_model=DeletionReceiptListOut)
async def list_deletion_receipts(
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
async def get_deletion_receipt(
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
