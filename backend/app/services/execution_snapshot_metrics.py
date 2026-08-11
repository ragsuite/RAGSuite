"""Resolve execution metrics for chat/search messages (snapshot + fallbacks)."""
from __future__ import annotations

from typing import Any, Dict, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..models import ChatMessage


def metrics_from_snapshot(snap: Any) -> Dict[str, Any]:
    """Extract feedback/history metrics from an execution_snapshot dict."""
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
    if total_i is not None and total_i <= 0:
        total_i = None
    llm = rt.get("llm_model")
    embed = rt.get("embedding_model")
    llm_provider = rt.get("llm_provider")
    embed_provider = rt.get("embedding_provider")
    return {
        "confidence_score": conf_i,
        "total_ms": total_i,
        "llm_model": _format_model_label(llm_provider, llm),
        "embedding_model": _format_model_label(embed_provider, embed),
    }


def _format_model_label(provider: Any, model: Any) -> Optional[str]:
    p = str(provider).strip() if provider else ""
    m = str(model).strip() if model else ""
    if p and m:
        if p.lower() in m.lower():
            return m
        return f"{p} / {m}"
    return m or p or None


def _int_or_none(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def synthesize_execution_snapshot(db: "Session", msg: "ChatMessage") -> Dict[str, Any]:
    """
    Build a minimal execution_snapshot when none was persisted (CE without EE tracing).
    Uses QueryLog + project settings — does not mutate the database row.
    """
    from ..models import ChatbotSettings, QueryLog, SearchSettings

    ql = (
        db.query(QueryLog)
        .filter(QueryLog.chat_message_id == msg.message_id)
        .order_by(QueryLog.timestamp.desc())
        .first()
    )
    if ql is None and msg.user_message:
        ql = (
            db.query(QueryLog)
            .filter(
                QueryLog.project_id == msg.project_id,
                QueryLog.query == msg.user_message,
            )
            .order_by(QueryLog.timestamp.desc())
            .first()
        )

    llm_provider = getattr(ql, "llm_provider", None) if ql else None
    llm_model = getattr(ql, "llm_model", None) if ql else None
    total_ms = _int_or_none(getattr(ql, "p95_latency", None) if ql else None)

    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None
    if (msg.message_type or "chat") == "search":
        settings = (
            db.query(SearchSettings)
            .filter(SearchSettings.project_id == msg.project_id)
            .first()
        )
        if settings:
            embedding_provider = getattr(settings, "model_provider", None)
            embedding_model = getattr(settings, "embedding_model", None)
            llm_model = llm_model or getattr(settings, "search_model", None)
            llm_provider = llm_provider or getattr(settings, "model_provider", None)
    else:
        settings = (
            db.query(ChatbotSettings)
            .filter(ChatbotSettings.project_id == msg.project_id)
            .first()
        )
        if settings:
            embedding_provider = getattr(settings, "model_provider", None)
            embedding_model = getattr(settings, "embedding_model", None)
            llm_model = llm_model or getattr(settings, "chat_model", None)
            llm_provider = llm_provider or getattr(settings, "model_provider", None)

    return {
        "schema_version": 2,
        "runtime_params": {
            "llm_provider": llm_provider,
            "llm_model": llm_model,
            "embedding_provider": embedding_provider,
            "embedding_model": embedding_model,
        },
        "timings_ms": {"total_ms": total_ms},
        "confidence_score": None,
    }


def effective_execution_snapshot(db: "Session", msg: "ChatMessage") -> Optional[Dict[str, Any]]:
    """Return persisted snapshot, or synthesize one with available telemetry."""
    snap = msg.execution_snapshot if isinstance(msg.execution_snapshot, dict) else None
    if snap and _snapshot_has_metrics(snap):
        return snap
    synthesized = synthesize_execution_snapshot(db, msg)
    if snap:
        return _merge_snapshots(snap, synthesized)
    if _snapshot_has_metrics(synthesized):
        return synthesized
    return snap


def _snapshot_has_metrics(snap: Dict[str, Any]) -> bool:
    metrics = metrics_from_snapshot(snap)
    return any(
        metrics.get(k) is not None
        for k in ("total_ms", "llm_model", "embedding_model", "confidence_score")
    )


def _merge_snapshots(primary: Dict[str, Any], fallback: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(primary)
    rt = dict(out.get("runtime_params") or {})
    fb_rt = fallback.get("runtime_params") or {}
    for key in ("llm_provider", "llm_model", "embedding_provider", "embedding_model"):
        if not rt.get(key) and fb_rt.get(key):
            rt[key] = fb_rt[key]
    out["runtime_params"] = rt

    tm = dict(out.get("timings_ms") or {})
    fb_tm = fallback.get("timings_ms") or {}
    cur_total = _int_or_none(tm.get("total_ms"))
    fb_total = _int_or_none(fb_tm.get("total_ms"))
    if cur_total is None and fb_total is not None:
        tm["total_ms"] = fb_total
    elif cur_total is not None:
        tm["total_ms"] = cur_total
    out["timings_ms"] = tm

    if out.get("confidence_score") is None and fallback.get("confidence_score") is not None:
        out["confidence_score"] = fallback["confidence_score"]
    return out


def message_execution_metrics(db: "Session", msg: "ChatMessage") -> Dict[str, Any]:
    snap = effective_execution_snapshot(db, msg)
    return metrics_from_snapshot(snap)
