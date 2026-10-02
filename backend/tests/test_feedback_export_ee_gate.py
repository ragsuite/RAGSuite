"""Feedback moderation export is Enterprise-only (dual gate)."""
from __future__ import annotations

import pytest
from fastapi import HTTPException


def test_can_export_feedback_false_when_edition_denied(monkeypatch):
    from app.routes import feedback_moderation as routes

    monkeypatch.setattr(
        "app.platform.ee_feature_gate.can_use_enterprise_edition",
        lambda: False,
    )
    assert routes._can_export_feedback_moderation() is False


def test_can_export_feedback_true_when_edition_allows(monkeypatch):
    from app.routes import feedback_moderation as routes

    monkeypatch.setattr(
        "app.platform.ee_feature_gate.can_use_enterprise_edition",
        lambda: True,
    )
    assert routes._can_export_feedback_moderation() is True


@pytest.mark.asyncio
async def test_export_endpoint_rejects_ce(monkeypatch):
    from app.routes import feedback_moderation as routes

    monkeypatch.setattr(routes, "_can_export_feedback_moderation", lambda: False)

    with pytest.raises(HTTPException) as exc_info:
        await routes.export_feedback_moderation(
            request=None,  # type: ignore[arg-type]
            db=None,  # type: ignore[arg-type]
            current_user=None,  # type: ignore[arg-type]
            active_project=None,  # type: ignore[arg-type]
            fmt="csv",
        )
    assert exc_info.value.status_code == 403
    assert "Enterprise" in str(exc_info.value.detail)
