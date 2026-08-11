"""Register Community audit_basic module."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import router


def register(ctx: ModuleContext) -> None:
    ctx.register_router(router, name="audit_basic")
    ctx.declare_permissions(["audit:read"])
    ctx.declare_navigation(
        [{"route": "audit", "labelKey": "nav.audit", "section": "management"}]
    )
    ctx.declare_migrations(["audit_events"])
