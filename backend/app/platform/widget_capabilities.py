"""Public widget capability advertisement (Platform).

Widgets are unauthenticated. Only capabilities that loaded Extensions opt into
via ``manifest.public_capabilities`` are returned — never a full module dump.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.platform.module_loader import loaded_manifests, loaded_module_ids

ALLOWED_PUBLIC_CAPABILITIES = frozenset({"voice.stt", "voice.tts"})

router = APIRouter(prefix="/api/v1/platform", tags=["platform"])


def collect_public_widget_capabilities() -> List[str]:
    """Capabilities of entitlement-loaded modules only (not inventory/skipped)."""
    loaded = set(loaded_module_ids())
    manifests = loaded_manifests()
    seen = []
    for module_id in loaded:
        manifest = manifests.get(module_id)
        if manifest is None:
            continue
        for cap in manifest.public_capabilities or []:
            if cap in ALLOWED_PUBLIC_CAPABILITIES and cap not in seen:
                seen.append(cap)
    return seen


@router.get("/widget-capabilities")
def widget_capabilities() -> JSONResponse:
    return JSONResponse(
        content={"capabilities": collect_public_widget_capabilities()},
        headers={"Cache-Control": "public, max-age=60"},
    )
