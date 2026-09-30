"""Register the voice module (id ``voice``); speech input/output runs in the browser."""
from __future__ import annotations

from app.platform.module_context import ModuleContext


def register(ctx: ModuleContext) -> None:
    ctx.declare_permissions(["voice:use"])
