"""Register documents module with Platform."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import router


def register(ctx: ModuleContext) -> None:
    ctx.register_router(router, name="documents")
    ctx.declare_permissions(["documents:read", "documents:write"])
    ctx.declare_navigation(
        [{"route": "documents", "labelKey": "nav.documents", "section": "application"}]
    )
    ctx.declare_migrations(["uploaded_documents"])
