"""Register trust_center module with Platform."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import trust_center_router


def register(ctx: ModuleContext) -> None:
    ctx.register_router(trust_center_router, name="trust_center")
    ctx.declare_permissions(["trust_center:read"])
    ctx.declare_navigation(
        [{"route": "trust-center", "labelKey": "trustCenter.nav", "section": "management"}]
    )
