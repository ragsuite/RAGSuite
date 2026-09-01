"""Register data_compliance CE module."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import router


def register(ctx: ModuleContext) -> None:
    ctx.register_router(router, name="data_compliance")
    ctx.declare_permissions(["settings:data_retention", "compliance:view_receipts"])
    ctx.declare_navigation(
        [{"route": "compliance", "labelKey": "compliance.nav", "section": "management"}]
    )
    ctx.declare_migrations(["compliance_retention"])
