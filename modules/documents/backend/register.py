"""Register documents module with Platform."""
from __future__ import annotations

from app.platform.module_context import ModuleContext

from .routes import router
from .textual_routes import router as textual_router


def register(ctx: ModuleContext) -> None:
    ctx.register_router(router, name="documents")
    ctx.register_router(textual_router, name="documents-textual")
    ctx.declare_permissions(["documents:read", "documents:write"])
    ctx.declare_navigation(
        [{"route": "documents", "labelKey": "nav.documents", "section": "application"}]
    )
    ctx.declare_migrations(["uploaded_documents"])
