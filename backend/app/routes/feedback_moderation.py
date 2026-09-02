"""
Feedback moderation APIs — list, summary, patch, export, reason catalog.
Scopes to active project (same pattern as overview / chat history).
"""
from __future__ import annotations

import csv
import io
import json
import logging
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, or_, text
from sqlalchemy.orm import Query as SAQuery
from sqlalchemy.orm import Session

from ..auth import get_current_user_required, get_active_project
from ..db import get_db
from ..models import ChatMessage, Project, User
from ..schemas import (
    FeedbackModerationEntriesPageOut,
    FeedbackModerationPatch,
    FeedbackModerationRowOut,
    FeedbackModerationSummaryOut,
)
from ..services.audit_service import emit_audit
from ..services.execution_snapshot_metrics import message_execution_metrics
from ..services.feedback_reason_catalog import reason_catalog_public
from ..utils.csv_export import sanitize_csv_cell

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/feedback", tags=["Feedback moderation"])


def _preview_text(s: str, max_len: int = 220) -> str:
    t = (s or "").replace("\n", " ").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def _snapshot_metrics(snap: Any, db: Optional[Session] = None, msg: Optional[ChatMessage] = None) -> Dict[str, Any]:
    if db is not None and msg is not None:
        from ..services.execution_snapshot_metrics import message_execution_metrics

        return message_execution_metrics(db, msg)
    if not isinstance(snap, dict):
        return {
            "confidence_score": None,
            "total_ms": None,
            "llm_model": None,
            "embedding_model": None,
        }
    rt = snap.get("runtime_params") or {}
    tm = snap.get("timings_ms") or {}
    conf = snap.get("confidence_score")
    try:
        conf_i = int(conf) if conf is not None else None
    except (TypeError, ValueError):
        conf_i = None
    total = tm.get("total_ms")
    try:
        total_i = int(total) if total is not None else None
    except (TypeError, ValueError):
        total_i = None
    return {
        "confidence_score": conf_i,
        "total_ms": total_i,
        "llm_model": rt.get("llm_model"),
        "embedding_model": rt.get("embedding_model"),
    }


def _row_to_out(m: ChatMessage, db: Session) -> FeedbackModerationRowOut:
    fb = m.feedback
    assert fb is not None
    metrics = message_execution_metrics(db, m)
    ar = m.assistant_response or ""
    return FeedbackModerationRowOut(
        id=m.id,
        message_id=m.message_id,
        session_id=m.session_id,
        user_id=m.user_id,
        user_message=m.user_message or "",
        assistant_preview=_preview_text(ar),
        assistant_response_length=len(ar),
        feedback=bool(fb),
        feedback_rating=m.feedback_rating,
        feedback_text=m.feedback_text,
        context_tags=m.context_tags if isinstance(m.context_tags, list) else None,
        message_type=m.message_type or "chat",
        created_at=m.created_at,
        confidence_score=metrics["confidence_score"],
        total_ms=metrics["total_ms"],
        llm_model=str(metrics["llm_model"]) if metrics["llm_model"] else None,
        embedding_model=str(metrics["embedding_model"]) if metrics["embedding_model"] else None,
        feedback_moderation=m.feedback_moderation if isinstance(m.feedback_moderation, dict) else None,
    )


def _moderation_passes_python_filters(
    m: ChatMessage,
    db: Session,
    *,
    reason: Optional[str],
    reviewed: Optional[bool],
    flagged: Optional[bool],
    min_confidence: Optional[int],
    max_confidence: Optional[int],
    min_total_ms: Optional[int],
    max_total_ms: Optional[int],
    llm_model: Optional[str],
    source_contains: Optional[str],
) -> bool:
    mod = m.feedback_moderation if isinstance(m.feedback_moderation, dict) else {}
    if reviewed is not None:
        is_rev = bool(mod.get("reviewed"))
        if reviewed != is_rev:
            return False
    if flagged is not None:
        is_fl = bool(mod.get("flagged"))
        if flagged != is_fl:
            return False
    met = message_execution_metrics(db, m)
    if min_confidence is not None and (
        met["confidence_score"] is None or met["confidence_score"] < min_confidence
    ):
        return False
    if max_confidence is not None and (
        met["confidence_score"] is None or met["confidence_score"] > max_confidence
    ):
        return False
    if min_total_ms is not None and (met["total_ms"] is None or met["total_ms"] < min_total_ms):
        return False
    if max_total_ms is not None and (met["total_ms"] is None or met["total_ms"] > max_total_ms):
        return False
    if llm_model and (not met["llm_model"] or llm_model.lower() not in str(met["llm_model"]).lower()):
        return False
    if source_contains:
        snap_txt = json.dumps(m.execution_snapshot or {})
        if source_contains.lower() not in snap_txt.lower():
            return False
    if reason and reason.strip():
        r = reason.strip().lower()
        tags = m.context_tags if isinstance(m.context_tags, list) else []
        if r not in [str(x).lower() for x in tags]:
            return False
    return True


def _build_moderation_entries_base_query(
    db: Session,
    active_project: Project,
    *,
    message_type: str,
    q: Optional[str],
    session_id: Optional[str],
    user_id: Optional[int],
    feedback: Optional[bool],
    reason: Optional[str],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    reviewed: Optional[bool],
    flagged: Optional[bool],
    min_confidence: Optional[int],
    max_confidence: Optional[int],
    min_total_ms: Optional[int],
    max_total_ms: Optional[int],
    llm_model: Optional[str],
    source_contains: Optional[str],
) -> tuple[SAQuery, str]:
    base = db.query(ChatMessage).filter(
        and_(
            ChatMessage.project_id == active_project.id,
            ChatMessage.feedback.isnot(None),
        )
    )

    if message_type != "all":
        base = base.filter(ChatMessage.message_type == message_type)

    if q and q.strip():
        pat = f"%{q.strip()}%"
        base = base.filter(
            or_(ChatMessage.user_message.ilike(pat), ChatMessage.assistant_response.ilike(pat))
        )
    if session_id:
        base = base.filter(ChatMessage.session_id == session_id)
    if user_id is not None:
        base = base.filter(ChatMessage.user_id == user_id)
    if feedback is not None:
        base = base.filter(ChatMessage.feedback == feedback)
    if date_from:
        base = base.filter(ChatMessage.created_at >= date_from)
    if date_to:
        base = base.filter(ChatMessage.created_at <= date_to)

    if reason and reason.strip():
        r = reason.strip().lower()
        try:
            base = base.filter(ChatMessage.context_tags.contains([r]))
        except Exception:
            base = base.filter(ChatMessage.context_tags.isnot(None))

    dialect = db.get_bind().dialect.name

    if reviewed is not None and dialect == "postgresql":
        if reviewed:
            base = base.filter(text("(feedback_moderation->>'reviewed')::boolean IS TRUE"))
        else:
            base = base.filter(
                or_(
                    ChatMessage.feedback_moderation.is_(None),
                    text("coalesce((feedback_moderation->>'reviewed')::boolean, false) = false"),
                )
            )

    if flagged is not None and dialect == "postgresql":
        if flagged:
            base = base.filter(text("(feedback_moderation->>'flagged')::boolean IS TRUE"))
        else:
            base = base.filter(
                or_(
                    ChatMessage.feedback_moderation.is_(None),
                    text("coalesce((feedback_moderation->>'flagged')::boolean, false) = false"),
                )
            )

    if min_confidence is not None and dialect == "postgresql":
        base = base.filter(
            text("(execution_snapshot->>'confidence_score')::int >= :mc").bindparams(mc=min_confidence)
        )
    if max_confidence is not None and dialect == "postgresql":
        base = base.filter(
            text("(execution_snapshot->>'confidence_score')::int <= :xc").bindparams(xc=max_confidence)
        )

    if min_total_ms is not None and dialect == "postgresql":
        base = base.filter(
            text("(execution_snapshot->'timings_ms'->>'total_ms')::int >= :mt").bindparams(mt=min_total_ms)
        )
    if max_total_ms is not None and dialect == "postgresql":
        base = base.filter(
            text("(execution_snapshot->'timings_ms'->>'total_ms')::int <= :xt").bindparams(xt=max_total_ms)
        )

    if llm_model and dialect == "postgresql":
        base = base.filter(
            text("execution_snapshot->'runtime_params'->>'llm_model' ILIKE :lm").bindparams(lm=f"%{llm_model}%")
        )

    if source_contains and dialect == "postgresql":
        base = base.filter(text("execution_snapshot::text ILIKE :sc").bindparams(sc=f"%{source_contains}%"))

    return base, dialect


def _collect_moderation_rows_for_export(
    base: SAQuery,
    dialect: str,
    db: Session,
    *,
    max_rows: int,
    reason: Optional[str],
    reviewed: Optional[bool],
    flagged: Optional[bool],
    min_confidence: Optional[int],
    max_confidence: Optional[int],
    min_total_ms: Optional[int],
    max_total_ms: Optional[int],
    llm_model: Optional[str],
    source_contains: Optional[str],
) -> List[ChatMessage]:
    if dialect == "postgresql":
        return base.order_by(ChatMessage.created_at.desc()).limit(max_rows).all()

    scan_cap = min(max(max_rows * 50, 5000), 100_000)
    candidates = base.order_by(ChatMessage.created_at.desc()).limit(scan_cap).all()
    out: List[ChatMessage] = []
    for m in candidates:
        if not _moderation_passes_python_filters(
            m,
            db,
            reason=reason,
            reviewed=reviewed,
            flagged=flagged,
            min_confidence=min_confidence,
            max_confidence=max_confidence,
            min_total_ms=min_total_ms,
            max_total_ms=max_total_ms,
            llm_model=llm_model,
            source_contains=source_contains,
        ):
            continue
        out.append(m)
        if len(out) >= max_rows:
            break
    return out


def _count_moderation_entries(
    base: SAQuery,
    dialect: str,
    db: Session,
    *,
    reason: Optional[str],
    reviewed: Optional[bool],
    flagged: Optional[bool],
    min_confidence: Optional[int],
    max_confidence: Optional[int],
    min_total_ms: Optional[int],
    max_total_ms: Optional[int],
    llm_model: Optional[str],
    source_contains: Optional[str],
) -> int:
    if dialect == "postgresql":
        return int(base.count())

    scan_cap = 100_000
    candidates = base.order_by(ChatMessage.created_at.desc()).limit(scan_cap).all()
    total = 0
    for message in candidates:
        if _moderation_passes_python_filters(
            message,
            db,
            reason=reason,
            reviewed=reviewed,
            flagged=flagged,
            min_confidence=min_confidence,
            max_confidence=max_confidence,
            min_total_ms=min_total_ms,
            max_total_ms=max_total_ms,
            llm_model=llm_model,
            source_contains=source_contains,
        ):
            total += 1
    return total


@router.get("/reason-catalog")
async def get_reason_catalog(
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    _ = current_user, active_project
    return reason_catalog_public()


@router.get("/moderation/entries", response_model=FeedbackModerationEntriesPageOut)
async def list_feedback_moderation_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: Optional[str] = Query(None, description="Search user or assistant message"),
    session_id: Optional[str] = None,
    user_id: Optional[int] = None,
    feedback: Optional[bool] = Query(None, description="True=positive, False=negative"),
    message_type: str = Query("all", description="all, chat, or search"),
    reason: Optional[str] = Query(None, description="Reason key must appear in context_tags"),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    reviewed: Optional[bool] = None,
    flagged: Optional[bool] = None,
    min_confidence: Optional[int] = None,
    max_confidence: Optional[int] = None,
    min_total_ms: Optional[int] = None,
    max_total_ms: Optional[int] = None,
    llm_model: Optional[str] = None,
    source_contains: Optional[str] = None,
):
    _ = current_user
    base, dialect = _build_moderation_entries_base_query(
        db,
        active_project,
        message_type=message_type,
        q=q,
        session_id=session_id,
        user_id=user_id,
        feedback=feedback,
        reason=reason,
        date_from=date_from,
        date_to=date_to,
        reviewed=reviewed,
        flagged=flagged,
        min_confidence=min_confidence,
        max_confidence=max_confidence,
        min_total_ms=min_total_ms,
        max_total_ms=max_total_ms,
        llm_model=llm_model,
        source_contains=source_contains,
    )

    if dialect == "postgresql":
        rows = base.order_by(ChatMessage.created_at.desc()).offset(offset).limit(limit).all()
    else:
        candidates = base.order_by(ChatMessage.created_at.desc()).limit(500).all()
        out_rows = [
            m
            for m in candidates
            if _moderation_passes_python_filters(
                m,
                db,
                reason=reason,
                reviewed=reviewed,
                flagged=flagged,
                min_confidence=min_confidence,
                max_confidence=max_confidence,
                min_total_ms=min_total_ms,
                max_total_ms=max_total_ms,
                llm_model=llm_model,
                source_contains=source_contains,
            )
        ]
        rows = out_rows[offset : offset + limit]

    total = _count_moderation_entries(
        base,
        dialect,
        db,
        reason=reason,
        reviewed=reviewed,
        flagged=flagged,
        min_confidence=min_confidence,
        max_confidence=max_confidence,
        min_total_ms=min_total_ms,
        max_total_ms=max_total_ms,
        llm_model=llm_model,
        source_contains=source_contains,
    )

    return FeedbackModerationEntriesPageOut(
        items=[_row_to_out(m, db) for m in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/moderation/summary", response_model=FeedbackModerationSummaryOut)
async def feedback_moderation_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
    message_type: str = Query("all"),
):
    _ = current_user
    q = db.query(ChatMessage).filter(
        and_(
            ChatMessage.project_id == active_project.id,
            ChatMessage.feedback.isnot(None),
        )
    )
    if message_type != "all":
        q = q.filter(ChatMessage.message_type == message_type)
    qset = q.all()

    total = len(qset)
    pos = sum(1 for m in qset if m.feedback is True)
    neg = sum(1 for m in qset if m.feedback is False)
    totals_ms: List[int] = []
    reason_ctr: Counter = Counter()
    low_conf_neg = 0
    flagged_c = 0
    reviewed_c = 0

    for m in qset:
        met = message_execution_metrics(db, m)
        tm = met["total_ms"]
        if tm is not None:
            totals_ms.append(tm)
        mod = m.feedback_moderation if isinstance(m.feedback_moderation, dict) else {}
        if mod.get("flagged"):
            flagged_c += 1
        if mod.get("reviewed"):
            reviewed_c += 1
        if m.feedback is False and isinstance(m.context_tags, list):
            for tg in m.context_tags:
                if tg:
                    reason_ctr[str(tg).lower()] += 1
        if m.feedback is False and met["confidence_score"] is not None and met["confidence_score"] < 40:
            low_conf_neg += 1

    avg_ms = sum(totals_ms) / len(totals_ms) if totals_ms else None
    top_neg = [{"key": k, "count": v} for k, v in reason_ctr.most_common(8)]

    return FeedbackModerationSummaryOut(
        total_count=total,
        positive_count=pos,
        negative_count=neg,
        positive_pct=round(100.0 * pos / total, 1) if total else 0.0,
        negative_pct=round(100.0 * neg / total, 1) if total else 0.0,
        avg_total_ms=round(avg_ms, 1) if avg_ms is not None else None,
        top_negative_reasons=top_neg,
        low_confidence_negative_count=low_conf_neg,
        flagged_count=flagged_c,
        reviewed_count=reviewed_c,
    )


@router.patch("/moderation/{message_id}")
async def patch_feedback_moderation(
    message_id: str,
    body: FeedbackModerationPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    try:
        mid = uuid.UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message_id")

    m = (
        db.query(ChatMessage)
        .filter(
            and_(
                ChatMessage.message_id == mid,
                ChatMessage.project_id == active_project.id,
                ChatMessage.feedback.isnot(None),
            )
        )
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Message not found or has no feedback")

    mod = dict(m.feedback_moderation) if isinstance(m.feedback_moderation, dict) else {}

    if body.reviewed is not None:
        mod["reviewed"] = body.reviewed
        if body.reviewed:
            mod["reviewed_at"] = datetime.now(timezone.utc).isoformat()
            mod["reviewed_by_user_id"] = current_user.id
        else:
            mod.pop("reviewed_at", None)
            mod.pop("reviewed_by_user_id", None)

    if body.internal_notes is not None:
        mod["internal_notes"] = body.internal_notes

    if body.flagged is not None:
        mod["flagged"] = body.flagged
        if not body.flagged:
            mod.pop("flag_reason", None)

    if body.flag_reason is not None:
        mod["flag_reason"] = body.flag_reason

    m.feedback_moderation = mod or None
    m.updated_at = datetime.now(timezone.utc)
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"success": True, "feedback_moderation": m.feedback_moderation}


@router.get("/moderation/export")
async def export_feedback_moderation(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
    fmt: str = Query("csv"),
    message_type: str = Query("all"),
    max_rows: int = Query(10_000, ge=1, le=50_000),
    q: Optional[str] = Query(None, description="Search user or assistant message"),
    session_id: Optional[str] = None,
    user_id: Optional[int] = None,
    feedback: Optional[bool] = Query(None, description="True=positive, False=negative"),
    reason: Optional[str] = Query(None, description="Reason key must appear in context_tags"),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    reviewed: Optional[bool] = None,
    flagged: Optional[bool] = None,
    min_confidence: Optional[int] = None,
    max_confidence: Optional[int] = None,
    min_total_ms: Optional[int] = None,
    max_total_ms: Optional[int] = None,
    llm_model: Optional[str] = None,
    source_contains: Optional[str] = None,
):
    if fmt not in ("csv", "json"):
        raise HTTPException(status_code=400, detail="fmt must be csv or json")

    filter_summary = {
        k: v
        for k, v in {
            "q": q,
            "session_id": session_id,
            "user_id": user_id,
            "feedback": feedback,
            "message_type": message_type,
            "reason": reason,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "reviewed": reviewed,
            "flagged": flagged,
            "min_confidence": min_confidence,
            "max_confidence": max_confidence,
            "min_total_ms": min_total_ms,
            "max_total_ms": max_total_ms,
            "llm_model": llm_model,
            "source_contains": source_contains,
            "max_rows": max_rows,
        }.items()
        if v is not None and v != ""
    }

    try:
        base, dialect = _build_moderation_entries_base_query(
            db,
            active_project,
            message_type=message_type,
            q=q,
            session_id=session_id,
            user_id=user_id,
            feedback=feedback,
            reason=reason,
            date_from=date_from,
            date_to=date_to,
            reviewed=reviewed,
            flagged=flagged,
            min_confidence=min_confidence,
            max_confidence=max_confidence,
            min_total_ms=min_total_ms,
            max_total_ms=max_total_ms,
            llm_model=llm_model,
            source_contains=source_contains,
        )

        rows = _collect_moderation_rows_for_export(
            base,
            dialect,
            db,
            max_rows=max_rows,
            reason=reason,
            reviewed=reviewed,
            flagged=flagged,
            min_confidence=min_confidence,
            max_confidence=max_confidence,
            min_total_ms=min_total_ms,
            max_total_ms=max_total_ms,
            llm_model=llm_model,
            source_contains=source_contains,
        )

        if fmt == "json":
            payload = []
            for m in rows:
                metrics = message_execution_metrics(db, m)
                payload.append(
                    {
                        "message_id": str(m.message_id),
                        "session_id": m.session_id,
                        "user_id": m.user_id,
                        "created_at": m.created_at.isoformat() if m.created_at else None,
                        "feedback": m.feedback,
                        "context_tags": m.context_tags,
                        "feedback_text": m.feedback_text,
                        "user_message": m.user_message,
                        "assistant_response": m.assistant_response,
                        "confidence_score": metrics["confidence_score"],
                        "total_ms": metrics["total_ms"],
                        "llm_model": metrics["llm_model"],
                        "feedback_moderation": m.feedback_moderation,
                    }
                )

            def _iter_json():
                yield json.dumps(payload, default=str).encode("utf-8")

            resp = StreamingResponse(
                _iter_json(),
                media_type="application/json",
                headers={"Content-Disposition": 'attachment; filename="feedback-export.json"'},
            )
            emit_audit(
                event_type="data.feedback_moderation.exported",
                request=request,
                user_id=current_user.id,
                project_id=active_project.id,
                status="success",
                summary=f"Feedback export ({len(rows)} rows, json)",
                details={"row_count": len(rows), "format": "json", "filters": filter_summary},
            )
            return resp

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(
            [
                "message_id",
                "session_id",
                "user_id",
                "created_at",
                "feedback",
                "context_tags",
                "confidence_score",
                "total_ms",
                "llm_model",
                "user_message",
                "assistant_preview",
                "reviewed",
                "flagged",
            ]
        )
        for m in rows:
            metrics = message_execution_metrics(db, m)
            mod = m.feedback_moderation if isinstance(m.feedback_moderation, dict) else {}
            tags = m.context_tags if isinstance(m.context_tags, list) else []
            w.writerow(
                [
                    sanitize_csv_cell(str(m.message_id)),
                    sanitize_csv_cell(m.session_id),
                    m.user_id if m.user_id is not None else "",
                    sanitize_csv_cell(m.created_at.isoformat() if m.created_at else ""),
                    "positive" if m.feedback else "negative",
                    sanitize_csv_cell(";".join(str(t) for t in tags)),
                    metrics["confidence_score"] if metrics["confidence_score"] is not None else "",
                    metrics["total_ms"] if metrics["total_ms"] is not None else "",
                    sanitize_csv_cell(metrics["llm_model"] or ""),
                    sanitize_csv_cell((m.user_message or "").replace("\n", " ")[:2000]),
                    sanitize_csv_cell(_preview_text(m.assistant_response or "", 500)),
                    mod.get("reviewed", ""),
                    mod.get("flagged", ""),
                ]
            )

        data = buf.getvalue().encode("utf-8-sig")

        def _csv_iter():
            yield data

        resp = StreamingResponse(
            _csv_iter(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="feedback-export.csv"'},
        )
        emit_audit(
            event_type="data.feedback_moderation.exported",
            request=request,
            user_id=current_user.id,
            project_id=active_project.id,
            status="success",
            summary=f"Feedback export ({len(rows)} rows, csv)",
            details={"row_count": len(rows), "format": "csv", "filters": filter_summary},
        )
        return resp

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("feedback export failed: %s", exc)
        emit_audit(
            event_type="data.feedback_moderation.exported",
            request=request,
            user_id=current_user.id,
            project_id=active_project.id,
            status="failed",
            summary="Feedback export failed",
            details={"filters": filter_summary, "error": str(exc)[:500]},
        )
        raise HTTPException(status_code=500, detail="Export failed") from exc
